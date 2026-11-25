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

test("the demo shows roles the way managers set them: chosen for a team, for everyone below, changed lower down, or one's own", async () => {
  const demo = await getDb("demo");
  const e = createEngine(await loadDatasetFrom(demo));
  const roleNames = e.roles.map((r) => r.name);
  for (const r of ["IT Operations", "SRE", "Software Developer", "Batch Operations", "ServiceNow", "ITOM ServiceNow"]) assert.ok(roleNames.includes(r), `role ${r}`);
  const team = (name: string) => e.activeEmployees.find((x) => x.teamName === name)!;
  const roleOf = (x: { roleId: string | null }) => e.roleById.get(x.roleId ?? "")?.name ?? null;
  const members = (name: string) => e.directReportsOf(team(name).id);

  // the head of Operations chose IT Operations for everyone below
  const ops = team("Operations");
  assert.equal(roleOf({ roleId: ops.teamRoleId ?? null }), "IT Operations");
  assert.equal(ops.teamRoleCascade, true);
  const desk = members("Service Desk");
  assert.ok(desk.length >= 5 && desk.every((x) => roleOf(x) === "IT Operations" && x.roleFrom === ops.id && !x.ownRoleId), "Service Desk follows it, two levels down, with no role of their own");

  // a manager below chose another for their team; a department head chose another for everyone below them
  assert.ok(members("Batch Operations").every((x) => roleOf(x) === "Batch Operations" && x.roleFrom === team("Batch Operations").id));
  assert.ok(members("Change & Release").every((x) => roleOf(x) === "ServiceNow" && x.roleFrom === team("IT Service Management").id));
  // ... and the more specific role, next to the one it was named after
  assert.ok(members("CMDB & Discovery").every((x) => roleOf(x) === "ITOM ServiceNow"));

  // nobody is forced: a few people keep a role of their own inside a team with another
  const own = members("Compute & Containers").filter((x) => x.ownRoleId);
  assert.ok(own.length > 0 && own.every((x) => roleOf(x) === "SRE" && x.roleFrom == null));
  assert.ok(members("Compute & Containers").some((x) => roleOf(x) === "Cloud Engineer" && x.roleFrom === team("Cloud Platform").id));

  // the same skill is in several roles
  const [{ id: linux }] = await demo.select({ id: s.skill.id }).from(s.skill).where(eq(s.skill.name, "Linux administration"));
  const using = new Set((await demo.select({ roleId: s.roleSkill.roleId }).from(s.roleSkill).where(eq(s.roleSkill.skillId, linux))).map((x) => x.roleId));
  assert.ok(using.size >= 4, `Linux administration is in ${using.size} roles`);

  // everyone who is asked to rate has a role, and so something to rate
  const asked = e.activeEmployees.filter((x) => e.assesses(x));
  assert.equal(asked.filter((x) => !x.roleId).length, 0);
  const p = (await demoPersonas(demo))!;
  assert.equal(roleOf(e.empById.get(p.member)!), "Cloud Engineer");
  assert.ok(e.directReportsOf(p.director).some((x) => e.isManager(x)), "the director persona has managers below: the app asks who a role is for");
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
