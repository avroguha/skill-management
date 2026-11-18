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
