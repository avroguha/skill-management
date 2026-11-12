// Migrations, seeding and the data loader against a real (in-memory) PostgreSQL.
import test from "node:test";
import assert from "node:assert/strict";
import { count, eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";

process.env.PGLITE_DIR = "memory://";
process.env.SEED_DEMO = "true";
delete process.env.DATABASE_URL;

const { getDb, closeDb, schema: s } = await import("../src/db/index.ts");
const { loadDatasetFrom } = await import("../src/lib/dataset.ts");
const { createEngine } = await import("../src/lib/engine/engine.ts");

test.after(() => closeDb());

test("first start: migrations, levels 0-5, settings, admin/admin, demo organisation", async () => {
  const db = await getDb();
  const levels = await db.select().from(s.proficiencyLevel).orderBy(s.proficiencyLevel.level);
  assert.deepEqual(levels.map((l) => l.name), ["No Exposure", "Awareness", "Working", "Proficient", "Advanced", "Expert"]);

  const [admin] = await db.select().from(s.user).where(eq(s.user.username, "admin"));
  assert.equal(admin.role, "admin");
  assert.equal(admin.mustChangePassword, false, "no forced change unless FORCE_PASSWORD_CHANGE=true");
  const [acct] = await db.select().from(s.account).where(eq(s.account.userId, admin.id));
  assert.equal(acct.providerId, "credential");
  assert.equal(await verifyPassword({ hash: acct.password!, password: "admin" }), true);

  const [{ n: people }] = await db.select({ n: count() }).from(s.employee);
  assert.ok(people > 80, `demo people: ${people}`);
  const [{ n: snaps }] = await db.select({ n: count() }).from(s.snapshot);
  assert.ok(snaps > 0);
});

test("seeding twice changes nothing", async () => {
  const db = await getDb();
  const before = await db.select({ n: count() }).from(s.employee);
  const { seed } = await import("../src/db/seed.ts");
  await seed(db);
  const after = await db.select({ n: count() }).from(s.employee);
  assert.deepEqual(after, before);
  const users = await db.select().from(s.user);
  assert.equal(users.filter((u) => u.username === "admin").length, 1);
});

test("the demo tells a story: critical gaps, single points of failure, short needs", async () => {
  const db = await getDb();
  const ds = await loadDatasetFrom(db);
  const e = createEngine(ds);
  const root = e.roots[0];
  assert.equal(root.name, "Avro Corp");
  const k = e.kpis(root.id);
  assert.ok(k.onTargetPct! > 30 && k.onTargetPct! < 90, `on target ${k.onTargetPct}`);
  assert.ok(k.spof > 0, "some single points of failure");
  assert.ok(k.pendingValidation > 0, "some ratings awaiting validation");
  const needs = e.shortNeeds(root.id);
  assert.ok(needs.some((n) => n.critical), "a team need nobody covers");
  assert.ok(needs.some((n) => n.shortfall > 0 && !n.critical), "a team need partly covered");
  const heat = e.unitHeatmap(root.id);
  assert.deepEqual(heat.rows.map((r) => r.name).sort(), ["Direct members", "Operations", "Technology"]);
});
