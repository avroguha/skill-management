// Against a real (in-memory) PostgreSQL, on the made-up organisation:
//   - requests for a new skill or category: asking, the coordinator's three answers, what the
//     asker can still do (src/lib/requests.ts)
//   - a team's setup put in force from a draft (src/lib/team-setup-db.ts)
//   - resets (src/lib/reset.ts)
import test from "node:test";
import assert from "node:assert/strict";
import { count, eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

const { getDb, closeDb, schema: s } = await import("../src/db/index.ts");
const { askFor, decide, resend, withdraw } = await import("../src/lib/requests.ts");
const { applyOp, diffSetup } = await import("../src/lib/team-setup.ts");
const { applySetup, readDraft, readLiveSetup, saveDraft, deleteDraft } = await import("../src/lib/team-setup-db.ts");
const { resetAssessments, resetRequests, resetTeams, resetToOutOfBox } = await import("../src/lib/reset.ts");
const { loadDatasetFrom } = await import("../src/lib/dataset.ts");
const { createEngine } = await import("../src/lib/engine/engine.ts");
const { demoPersonas } = await import("../src/db/demo.ts");

test.after(() => closeDb());

const mia = { id: "u-mia", employeeId: null, name: "Mia" };
const tom = { id: "u-tom", employeeId: null, name: "Tom" };
const cora = { id: "u-cora", employeeId: null, name: "Cora (coordinator)" };
const one = async (id: string) => (await (await getDb("demo")).select().from(s.catalogueRequest).where(eq(s.catalogueRequest.id, id)))[0]!;
const cat = async (name: string) => (await (await getDb("demo")).select().from(s.skillCategory)).find((c) => c.name === name)!;

test("asking for a skill: it waits for a coordinator; what exists or is already asked for is refused with the reason", async () => {
  const db = await getDb("demo");
  const cloud = await cat("Cloud");
  const r = await askFor(db, mia, { kind: "skill", name: "  Platform   engineering ", categoryId: cloud.id, reason: "Three teams do it" });
  assert.ok(r.ok, r.ok ? "" : r.error);
  const row = await one(r.ok ? r.id : "");
  assert.deepEqual([row.status, row.name, row.requestedByName, row.categoryId, row.history.length], ["pending", "Platform engineering", "Mia", cloud.id, 1]);
  const dup = await askFor(db, tom, { kind: "skill", name: "platform-engineering", categoryId: cloud.id });
  assert.match(dup.ok ? "" : dup.error, /Mia has already asked for “Platform engineering”/);
  const exists = await askFor(db, tom, { kind: "skill", name: "kubernetes", categoryId: cloud.id });
  assert.match(exists.ok ? "" : exists.error, /already in the catalogue/);
  const alias = await askFor(db, tom, { kind: "skill", name: "K8s", categoryId: cloud.id });
  assert.match(alias.ok ? "" : alias.error, /“Kubernetes” is already in the catalogue \(it also goes by “K8s”\)/);
  const nowhere = await askFor(db, tom, { kind: "skill", name: "Edge computing" });
  assert.match(nowhere.ok ? "" : nowhere.error, /Choose the category/);
  const noName = await askFor(db, tom, { kind: "category", name: " " });
  assert.equal(noName.ok, false);
  const catDup = await askFor(db, tom, { kind: "category", name: "cloud" });
  assert.match(catDup.ok ? "" : catDup.error, /already a category called “Cloud”/);
});

test("approving makes the skill; the coordinator may change the name and where it goes first", async () => {
  const db = await getDb("demo");
  const [row] = await db.select().from(s.catalogueRequest).where(eq(s.catalogueRequest.name, "Platform engineering"));
  const devops = await cat("DevOps");
  const r = await decide(db, cora, { id: row.id, decision: "approve", name: "Platform engineering practice", categoryId: devops.id });
  assert.ok(r.ok, r.ok ? "" : r.error);
  const [skill] = await db.select().from(s.skill).where(eq(s.skill.name, "Platform engineering practice"));
  assert.deepEqual([skill.categoryId, skill.status, skill.parentId], [devops.id, "active", null]);
  const after = await one(row.id);
  assert.deepEqual([after.status, after.decidedByName, after.resultId, after.name], ["approved", "Cora (coordinator)", skill.id, "Platform engineering practice"]);
  assert.match(after.comment, /Approved with a change/, "the asker sees that it was changed");
  assert.equal(after.history.at(-1)!.action, "approved with a change");
  const again = await decide(db, cora, { id: row.id, decision: "reject", comment: "changed my mind" });
  assert.match(again.ok ? "" : again.error, /not waiting any more/, "a decision is made once");
  // people can rate it at once: the engine sees it
  assert.ok(createEngine(await loadDatasetFrom(db)).isRateable(skill.id));
});

test("a skill in a category that does not exist yet: approving makes both; a sub-skill goes under its skill", async () => {
  const db = await getDb("demo");
  const a = await askFor(db, mia, { kind: "skill", name: "Carbon accounting", categoryName: "Sustainability" });
  assert.ok(a.ok);
  const r = await decide(db, cora, { id: a.ok ? a.id : "", decision: "approve" });
  assert.ok(r.ok, r.ok ? "" : r.error);
  const made = await cat("Sustainability");
  assert.ok(made, "the category was made with it");
  const [skill] = await db.select().from(s.skill).where(eq(s.skill.name, "Carbon accounting"));
  assert.equal(skill.categoryId, made.id);
  const [aws] = await db.select().from(s.skill).where(eq(s.skill.name, "AWS"));
  const sub = await askFor(db, mia, { kind: "skill", name: "CloudFront", parentId: aws.id });
  assert.ok(sub.ok, sub.ok ? "" : sub.error);
  await decide(db, cora, { id: sub.ok ? sub.id : "", decision: "approve" });
  const [cdn] = await db.select().from(s.skill).where(eq(s.skill.name, "CloudFront"));
  assert.deepEqual([cdn.parentId, cdn.categoryId], [aws.id, aws.categoryId], "under AWS, in AWS's category");
  const c = await askFor(db, tom, { kind: "category", name: "Legal and compliance", description: "Contracts, audits" });
  await decide(db, cora, { id: c.ok ? c.id : "", decision: "approve" });
  assert.equal((await cat("Legal and compliance")).description, "Contracts, audits");
});

test("sent back: a note is needed, the asker changes it and sends it again; nobody else can", async () => {
  const db = await getDb("demo");
  const cloud = await cat("Cloud");
  const a = await askFor(db, mia, { kind: "skill", name: "Kubernets admission control", categoryId: cloud.id });
  const id = a.ok ? a.id : "";
  const bare = await decide(db, cora, { id, decision: "return", comment: " " });
  assert.match(bare.ok ? "" : bare.error, /Say what should change/);
  assert.ok((await decide(db, cora, { id, decision: "return", comment: "Check the spelling, and say what it covers." })).ok);
  let row = await one(id);
  assert.deepEqual([row.status, row.comment, row.decidedByName], ["returned", "Check the spelling, and say what it covers.", "Cora (coordinator)"]);
  const notMine = await resend(db, tom, id, { name: "Kubernetes admission control", categoryId: cloud.id });
  assert.match(notMine.ok ? "" : notMine.error, /Only the person who asked/);
  const ok = await resend(db, mia, id, { name: "Kubernetes admission control", categoryId: cloud.id, description: "Writing controllers" });
  assert.ok(ok.ok, ok.ok ? "" : ok.error);
  row = await one(id);
  assert.deepEqual([row.status, row.name, row.description], ["pending", "Kubernetes admission control", "Writing controllers"]);
  assert.deepEqual(row.history.map((h) => h.action), ["asked", "sent back", "changed it and sent it again"]);
  assert.ok((await decide(db, cora, { id, decision: "approve" })).ok);
});

test("refused with a reason; withdrawn by the asker; neither can be changed afterwards", async () => {
  const db = await getDb("demo");
  const cloud = await cat("Cloud");
  const a = await askFor(db, mia, { kind: "skill", name: "Blockchain", categoryId: cloud.id });
  const id = a.ok ? a.id : "";
  assert.match(((await decide(db, cora, { id, decision: "reject", comment: "" })) as { error: string }).error, /Say why not/);
  assert.ok((await decide(db, cora, { id, decision: "reject", comment: "No team uses it." })).ok);
  assert.deepEqual([(await one(id)).status, (await one(id)).comment], ["rejected", "No team uses it."]);
  assert.match(((await resend(db, mia, id, { name: "Blockchain", categoryId: cloud.id })) as { error: string }).error, /cannot be changed any more/);
  assert.equal((await db.select().from(s.skill).where(eq(s.skill.name, "Blockchain"))).length, 0, "nothing was added");
  // the name is free again: she can ask again later
  const b = await askFor(db, mia, { kind: "skill", name: "Blockchain", categoryId: cloud.id });
  assert.ok(b.ok);
  assert.match(((await withdraw(db, tom, b.ok ? b.id : "")) as { error: string }).error, /Only the person who asked/);
  assert.ok((await withdraw(db, mia, b.ok ? b.id : "")).ok);
  assert.equal((await one(b.ok ? b.id : "")).status, "withdrawn");
  assert.match(((await decide(db, cora, { id: b.ok ? b.id : "", decision: "approve" })) as { error: string }).error, /not waiting any more/);
});

test("a team's draft is kept apart from what is in force; confirming puts exactly the draft in force and drops it", async () => {
  const db = await getDb("demo");
  const p = (await demoPersonas(db))!;
  const e = createEngine(await loadDatasetFrom(db));
  const ctx = { people: new Set(e.directReportsOf(p.manager).map((x) => x.id)), rateable: e.isRateable };
  const live = await readLiveSetup(db, p.manager);
  const draft = (await readDraft(db, p.manager))!;
  assert.equal(draft.authorName, e.empById.get(p.manager)!.name);
  const newRole = draft.setup.roles.find((r) => r.name === "On-call")!;
  assert.ok(!e.roleById.has(newRole.id) && !e.rolesOf(p.manager).some((r) => r.name === "On-call"), "the draft role is not in force: nobody is asked for it yet");

  // one more change on top of the draft, saved
  const sre = draft.setup.roles.find((r) => r.name === "SRE")!;
  const moved = applyOp(draft.setup, { op: "updateRole", roleId: sre.id, name: "Site reliability" }, ctx);
  assert.ok(moved.ok);
  await saveDraft(db, p.manager, moved.ok ? moved.setup : draft.setup, { id: "u-x", name: "Someone above" });
  const stored = (await readDraft(db, p.manager))!;
  assert.equal(stored.authorName, "Someone above");
  assert.ok(diffSetup(live, stored.setup).some((c) => c.kind === "role_renamed"));
  assert.deepEqual(await readLiveSetup(db, p.manager), live, "saving a draft changes nothing that is in force");

  await applySetup(db, p.manager, stored.setup);
  assert.equal(await readDraft(db, p.manager), null, "confirmed: the draft is gone");
  assert.deepEqual(diffSetup(await readLiveSetup(db, p.manager), stored.setup), [], "what is in force is the draft");
  const after = createEngine(await loadDatasetFrom(db));
  assert.deepEqual(after.rolesOf(p.manager).map((r) => r.name), ["Cloud Engineer", "Site reliability", "On-call"], "in the manager's order");
  const onCall = after.rolesOf(p.manager).find((r) => r.name === "On-call")!;
  assert.equal(after.roleMembers(onCall.id).length, 2);
  for (const m of after.roleMembers(onCall.id)) assert.ok(after.requiredSkillIds(m).length > 0);

  // two roles can swap names in one go, and a role taken out is gone with its people and skills
  const now = await readLiveSetup(db, p.manager);
  const swapped = { ...now, roles: [{ ...now.roles[0], name: now.roles[1].name }, { ...now.roles[1], name: now.roles[0].name }] };
  await applySetup(db, p.manager, swapped);
  const end = await readLiveSetup(db, p.manager);
  assert.deepEqual(end.roles.map((r) => r.name), ["Site reliability", "Cloud Engineer"]);
  const [{ n }] = await db.select({ n: count() }).from(s.teamRoleMember).where(eq(s.teamRoleMember.roleId, onCall.id));
  assert.equal(n, 0);
  await deleteDraft(db, p.manager);
});

test("resets: one person's or one team's assessments, a team's roles and needs, the requests; the rest stays", async () => {
  const db = await getDb("demo");
  const p = (await demoPersonas(db))!;
  const e = createEngine(await loadDatasetFrom(db));
  const n = async (t: typeof s.rating | typeof s.teamRole | typeof s.catalogueRequest | typeof s.teamNeed | typeof s.employee | typeof s.skill) => Number((await db.select({ n: count() }).from(t))[0].n);
  const all = await n(s.rating);
  const someone = e.directReportsOf(p.manager).find((x) => e.ratingsOf(x.id).length > 0)!;
  const gone = await resetAssessments(db, [someone.id]);
  assert.equal(gone, e.ratingsOf(someone.id).length);
  assert.equal(await n(s.rating), all - gone);
  assert.equal((await db.select().from(s.ratingEvent).where(eq(s.ratingEvent.employeeId, someone.id))).length, 0, "their history too");

  const roles = await n(s.teamRole);
  const other = e.activeEmployees.find((x) => x.teamName === "Reliability")!;
  const removed = await resetTeams(db, [other.id]);
  assert.equal(removed, e.rolesOf(other.id).length);
  assert.equal(await n(s.teamRole), roles - removed);
  assert.equal((await db.select().from(s.teamNeed).where(eq(s.teamNeed.managerId, other.id))).length, 0);
  assert.ok((await db.select().from(s.teamNeed).where(eq(s.teamNeed.managerId, p.manager))).length > 0, "another team's needs stay");
  assert.equal(await n(s.rating), all - gone, "ratings stay when a team is reset");

  assert.ok(await resetRequests(db) > 0);
  assert.equal(await n(s.catalogueRequest), 0);
  assert.ok((await db.select().from(s.skill).where(eq(s.skill.name, "Carbon accounting"))).length === 1, "skills that were approved stay in the catalogue");
});

test("back to how it was first installed: the starter catalogue, no ratings, roles, needs or requests; the people stay", async () => {
  const db = await getDb("demo");
  const people = Number((await db.select({ n: count() }).from(s.employee))[0].n);
  await db.update(s.appSetting).set({ value: { staleMonths: 3, fitPercent: 80 } }).where(eq(s.appSetting.key, "settings"));
  await db.update(s.proficiencyLevel).set({ name: "Renamed" }).where(eq(s.proficiencyLevel.level, 3));
  const r = await resetToOutOfBox(db);
  const live = await getDb("live");
  const starter = Number((await live.select({ n: count() }).from(s.skill))[0].n);
  assert.equal(r.skills, starter, "the same catalogue a fresh install gets");
  for (const t of [s.rating, s.ratingEvent, s.teamRole, s.teamRoleMember, s.teamRoleSkill, s.teamNeed, s.teamDraft, s.catalogueRequest]) {
    assert.equal(Number((await db.select({ n: count() }).from(t))[0].n), 0);
  }
  assert.equal(Number((await db.select({ n: count() }).from(s.employee))[0].n), people, "people and who reports to whom stay");
  assert.ok((await db.select().from(s.employee)).every((x) => x.teamName === ""), "team names go back to the manager's name");
  const cats = (await db.select().from(s.skillCategory)).map((c) => c.name);
  assert.ok(cats.includes("Managerial") && cats.includes("Analytical") && cats.includes("Business") && !cats.includes("Sustainability"));
  const [settings] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, "settings"));
  assert.deepEqual([(settings.value as { staleMonths: number }).staleMonths, (settings.value as { fitPercent: number }).fitPercent], [12, 50]);
  assert.equal((await db.select().from(s.proficiencyLevel).where(eq(s.proficiencyLevel.level, 3)))[0].name, "Proficient");
  const e = createEngine(await loadDatasetFrom(db));
  assert.equal(e.roles.length, 0);
  assert.ok(e.activeEmployees.length === people && e.tops.length === 1);
});
