// Migrations, seeding, the demo database and the data loader against a real (in-memory)
// PostgreSQL.
import test from "node:test";
import assert from "node:assert/strict";
import { count, eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

const { getDb, closeDb, schema: s } = await import("../src/db/index.ts");
const { loadDatasetFrom } = await import("../src/lib/dataset.ts");
const { createEngine, ALL } = await import("../src/lib/engine/engine.ts");
const { demoPersonas, resetDemo } = await import("../src/db/demo.ts");

test.after(() => closeDb());

test("first start of the live database: migrations, levels 0-5, settings, admin/admin, and no made-up people", async () => {
  const db = await getDb("live");
  const levels = await db.select().from(s.proficiencyLevel).orderBy(s.proficiencyLevel.level);
  assert.deepEqual(levels.map((l) => l.name), ["No Exposure", "Awareness", "Working", "Proficient", "Advanced", "Expert"]);
  const [admin] = await db.select().from(s.user).where(eq(s.user.username, "admin"));
  assert.equal(admin.role, "admin");
  assert.equal(admin.mustChangePassword, false, "no forced change unless FORCE_PASSWORD_CHANGE=true");
  const [acct] = await db.select().from(s.account).where(eq(s.account.userId, admin.id));
  assert.equal(await verifyPassword({ hash: acct.password!, password: "admin" }), true);
  const [{ n: people }] = await db.select({ n: count() }).from(s.employee);
  assert.equal(people, 0, "demo people live only in the demo database");
  const [{ n: skills }] = await db.select({ n: count() }).from(s.skill);
  assert.ok(skills >= 90, `the starter skill catalogue is there from the start: ${skills}`);
});

test("seeding twice changes nothing", async () => {
  const db = await getDb("live");
  const { seed } = await import("../src/db/seed.ts");
  await seed(db);
  const users = await db.select().from(s.user);
  assert.equal(users.filter((u) => u.username === "admin").length, 1);
});

test("without a mode, the database is the live one (outside a request there is no demo switch)", async () => {
  assert.equal(await getDb(), await getDb("live"));
});

test("the demo database is separate and tells a story worth presenting", async () => {
  const demo = await getDb("demo");
  assert.notEqual(demo, await getDb("live"));
  const [{ n: people }] = await demo.select({ n: count() }).from(s.employee);
  assert.ok(people > 80, `demo people: ${people}`);
  const [{ n: users }] = await demo.select({ n: count() }).from(s.user);
  assert.equal(users, 0, "no sign-ins in the demo: presenters use their own account");
  const e = createEngine(await loadDatasetFrom(demo));
  const k = e.kpis(ALL);
  assert.ok(k.onTargetPct! > 20 && k.onTargetPct! < 90, `on target ${k.onTargetPct}`);
  assert.ok(k.spof > 0, "some needs rest on one person");
  assert.ok(k.pendingConfirmation > 0, "some ratings wait for a manager");
  assert.ok(k.notStarted > 0, "some people have not started");
  const needs = e.shortNeeds(ALL);
  assert.ok(needs.some((n) => n.critical), "a team need nobody in the team covers");
  assert.ok(needs.some((n) => e.holdersOutside(n.managerId, n.skillId, n.level).length > 0), "someone elsewhere already has what a team lacks");
  const p = (await demoPersonas(demo))!;
  const mgr = e.empById.get(p.manager)!;
  assert.ok(e.directReportsOf(mgr.id).some((x) => e.ratingsOf(x.id).some((r) => r.status === "submitted")), "the manager persona has ratings to confirm");
  assert.equal(e.isTop(e.empById.get(p.top)!), true);
  assert.equal(e.assesses(e.empById.get(p.member)!), true);
  assert.deepEqual(e.teamHeatmap(p.top).rows.map((r) => r.name).sort(), ["Operations", "Technology"]);
});

test("demo people have invented names and work in invented places: nobody finds a colleague in the demo", async () => {
  const { MADE_UP_FIRST, MADE_UP_LAST, MADE_UP_PLACES } = await import("../src/db/made-up-names.ts");
  const demo = await getDb("demo");
  const people = await demo.select({ name: s.employee.name, email: s.employee.email, location: s.employee.location }).from(s.employee);
  assert.equal(new Set(people.map((p) => p.name)).size, people.length, "no two people share a name");
  for (const p of people) {
    const [first, last, ...more] = p.name.split(" ");
    assert.ok(MADE_UP_FIRST.includes(first) && MADE_UP_LAST.includes(last) && !more.length, `an invented name: ${p.name}`);
    assert.ok(MADE_UP_PLACES.includes(p.location ?? ""), `an invented place: ${p.location}`);
    assert.match(p.email, /@avro\.com$/);
  }
  // the lists themselves: no word twice, and none of the everyday names the demo used to have
  const all = [...MADE_UP_FIRST, ...MADE_UP_LAST];
  assert.equal(new Set(all.map((n) => n.toLowerCase())).size, all.length);
  const everyday = ["james", "emma", "liam", "olivia", "noah", "daniel", "grace", "henry", "smith", "brown", "taylor", "clark", "walker", "young", "king", "green", "london"];
  for (const n of [...all, ...MADE_UP_PLACES]) assert.ok(!everyday.includes(n.toLowerCase()), n);
});

test("the demo shows roles the way the app means them: each team's own, the same name in two teams, a person in two roles", async () => {
  const demo = await getDb("demo");
  const e = createEngine(await loadDatasetFrom(demo));
  const roleNames = new Set(e.roles.map((r) => r.name));
  for (const r of ["IT Operations", "SRE", "Software Developer", "Batch Operations", "ServiceNow", "ITOM ServiceNow"]) assert.ok(roleNames.has(r), `role ${r}`);
  const team = (name: string) => e.activeEmployees.find((x) => x.teamName === name)!;
  const rolesOf = (name: string) => e.rolesOf(team(name).id).map((r) => r.name);

  // a role belongs to one team; two teams each have their own SRE
  assert.deepEqual(rolesOf("Compute & Containers"), ["Cloud Engineer", "SRE"]);
  assert.deepEqual(rolesOf("Reliability"), ["SRE"]);
  const sre = e.roles.filter((r) => r.name === "SRE");
  assert.ok(sre.length >= 3 && new Set(sre.map((r) => r.managerId)).size === sre.length, "one SRE per team that has it, each its own role");
  assert.deepEqual(rolesOf("Cloud Platform"), [], "a director's own team (the managers below) has no roles: nothing is passed down");

  // people are in the roles of their own manager's team only, and every role has someone
  for (const x of e.activeEmployees) for (const rid of x.roleIds) assert.equal(e.roleById.get(rid)!.managerId, x.managerId, `${x.name} is in a role of their own team`);
  for (const r of e.roles) assert.ok(e.roleMembers(r.id).length > 0, `${r.name} has people`);

  // one person serves two roles where a team has two, and is asked for both roles' skills
  const both = e.directReportsOf(team("Compute & Containers").id).filter((x) => x.roleIds.length === 2);
  assert.equal(both.length, 1);
  const asked = new Set(e.requiredSkillIds(both[0]));
  for (const rid of both[0].roleIds) for (const k of e.roleSkillsOf(rid)) assert.ok(asked.has(k.skillId));

  // the same skill is in several roles
  const [{ id: linux }] = await demo.select({ id: s.skill.id }).from(s.skill).where(eq(s.skill.name, "Linux administration"));
  const using = new Set((await demo.select({ roleId: s.teamRoleSkill.roleId }).from(s.teamRoleSkill).where(eq(s.teamRoleSkill.skillId, linux))).map((x) => x.roleId));
  assert.ok(using.size >= 4, `Linux administration is in ${using.size} roles`);

  // everyone who is asked to rate is in a role, and so has something to rate
  assert.equal(e.activeEmployees.filter((x) => e.assesses(x) && !x.roleIds.length).length, 0);
  const p = (await demoPersonas(demo))!;
  assert.deepEqual(e.empById.get(p.member)!.roleIds.map((id) => e.roleById.get(id)!.name), ["Cloud Engineer"]);
  assert.ok(e.isManager(e.empById.get(p.coordinator)!), "the coordinator persona manages a team too");

  // someone's skills also match a role of another team, at the default 50%
  assert.ok(e.directReportsOf(p.manager).some((x) => e.roleFits(x).length > 0), "the manager persona sees where their people would also fit");
});

test("the demo has changes waiting in Review for the manager persona, and requests at every stage", async () => {
  const demo = await getDb("demo");
  const { readDraft, readLiveSetup } = await import("../src/lib/team-setup-db.ts");
  const { diffSetup } = await import("../src/lib/team-setup.ts");
  const p = (await demoPersonas(demo))!;
  const draft = await readDraft(demo, p.manager);
  assert.ok(draft, "a draft is waiting");
  const changes = diffSetup(await readLiveSetup(demo, p.manager), draft!.setup);
  assert.deepEqual(changes.map((c) => c.kind).sort(), ["extra_added", "member_added", "member_added", "role_added", "skill_added", "skill_added"]);
  // the team member persona is asked for a skill beyond their role, in force already
  const e = createEngine(await loadDatasetFrom(demo));
  const ansible = [...e.skillById.values()].find((k) => k.name === "Ansible")!;
  assert.equal(e.targetFor(e.empById.get(p.member)!, ansible.id)?.source, "person");
  const requests = await demo.select().from(s.catalogueRequest);
  assert.deepEqual([...new Set(requests.map((r) => r.status))].sort(), ["approved", "pending", "rejected", "returned"]);
  assert.ok(requests.some((r) => r.kind === "category" && r.status === "pending"));
  for (const r of requests.filter((x) => x.status === "returned" || x.status === "rejected")) assert.ok(r.comment.length > 10 && r.decidedByName, "sent back or refused with a note, by someone");
});

test("the catalogue has the three kinds of skill every sort of work needs, next to the technical ones", async () => {
  const live = await getDb("live");
  const cats = (await live.select().from(s.skillCategory)).map((c) => c.name);
  for (const c of ["Managerial", "Analytical", "Business"]) assert.ok(cats.includes(c), `starter category ${c}`);
  assert.ok(cats.length >= 10, "and the technical ones, by technology");
  assert.ok(!cats.includes("Ways of Working"));
  const demoCats = (await (await getDb("demo")).select().from(s.skillCategory)).map((c) => c.name);
  for (const c of ["Managerial", "Analytical", "Business"]) assert.ok(demoCats.includes(c), `demo category ${c}`);
});

test("a role of another manager's team does not count: someone who moved is in no role until their new manager gives one", async () => {
  const demo = await getDb("demo");
  const before = createEngine(await loadDatasetFrom(demo));
  const from = before.activeEmployees.find((x) => x.teamName === "Reliability")!;
  const to = before.activeEmployees.find((x) => x.teamName === "Identity")!;
  const mover = before.directReportsOf(from.id)[0];
  assert.ok(mover.roleIds.length > 0);
  await demo.update(s.employee).set({ managerId: to.id }).where(eq(s.employee.id, mover.id));
  const after = createEngine(await loadDatasetFrom(demo));
  assert.deepEqual(after.empById.get(mover.id)!.roleIds, [], "the old team's role no longer applies");
  assert.deepEqual(after.requiredSkillIds(after.empById.get(mover.id)!), []);
  await demo.update(s.employee).set({ managerId: from.id }).where(eq(s.employee.id, mover.id));
});

test("a demo database from an older version is rebuilt on the next start; a current one is left alone", async () => {
  const demo = await getDb("demo");
  const { seedDemoIfEmpty, DEMO_VERSION } = await import("../src/db/demo.ts");
  const version = async () => (await demo.select().from(s.appSetting).where(eq(s.appSetting.key, "demo_version")))[0]?.value;
  assert.equal(await version(), DEMO_VERSION);
  await demo.delete(s.rating);
  await seedDemoIfEmpty(demo);
  assert.equal((await demo.select({ n: count() }).from(s.rating))[0].n, 0, "current: what a presenter changed stays");
  await demo.delete(s.appSetting).where(eq(s.appSetting.key, "demo_version")); // as an older version left it
  await seedDemoIfEmpty(demo);
  assert.ok((await demo.select({ n: count() }).from(s.rating))[0].n > 300, "rebuilt");
  assert.equal(await version(), DEMO_VERSION);
});

test("resetting the demo puts it back as it was and touches nothing live", async () => {
  const demo = await getDb("demo");
  const live = await getDb("live");
  const [liveUsers] = await live.select({ n: count() }).from(s.user);
  await demo.delete(s.rating);
  await resetDemo(demo);
  const [{ n }] = await demo.select({ n: count() }).from(s.rating);
  assert.ok(n > 500, `ratings back: ${n}`);
  assert.deepEqual(await live.select({ n: count() }).from(s.user), [liveUsers]);
});
