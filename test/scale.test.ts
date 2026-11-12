// Several app workers: the data version moves on every change the engine reads (and after a
// restore), and a scheduled job runs in one worker at a time.
import test from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://";
process.env.SEED_DEMO = "true";
process.env.BETTER_AUTH_SECRET = "test-secret-for-scale";
delete process.env.DATABASE_URL;

const { getDb, closeDb } = await import("../src/db/index.ts");
const { takeLease, releaseLease, withLease } = await import("../src/lib/lease.ts");
const B = await import("../src/lib/backup.ts");

const version = async () => Number(((await (await getDb()).execute(sql`select v from data_version where id = 1`)) as unknown as { rows: { v: number }[] }).rows[0].v);

test.after(() => closeDb());

test("the data version moves on every change the engine reads, and only then", async () => {
  const db = await getDb();
  const v0 = await version();
  await db.execute(sql`update employee set title = title || '' where id = (select id from employee limit 1)`);
  const v1 = await version();
  assert.ok(v1 > v0, "an update to people moves it");
  await db.execute(sql`insert into app_setting (key, value) values ('x-test', '{}'::jsonb) on conflict (key) do update set value = excluded.value`);
  assert.ok((await version()) > v1, "settings move it");
  const v2 = await version();
  await db.execute(sql`insert into audit_log (id, action, entity) values (gen_random_uuid()::text, 'test', 'x')`);
  assert.equal(await version(), v2, "the audit log does not (the engine does not read it)");
});

test("a restore, which loads with triggers off, still moves the version", async () => {
  const db = await getDb();
  const b = await B.exportBackup(db, "tester", "manual");
  assert.ok(!("data_version" in b.tables) && !("job_lease" in b.tables), "transient tables are not backed up");
  const before = await version();
  await B.restoreBackup(db, b);
  assert.ok((await version()) > before);
});

test("a job lease is held by one worker at a time and frees itself when it expires", async () => {
  const db = await getDb();
  assert.equal(await takeLease(db, "job", 60_000, "worker-a"), true);
  assert.equal(await takeLease(db, "job", 60_000, "worker-b"), false, "held by a");
  assert.equal(await takeLease(db, "job", 60_000, "worker-a"), true, "a may renew");
  await releaseLease(db, "job", "worker-a");
  assert.equal(await takeLease(db, "job", 1, "worker-b"), true, "free once released");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(await takeLease(db, "job", 60_000, "worker-c"), true, "an expired lease is taken over");

  let ran = 0;
  const slow = withLease(db, "once", 60_000, async () => { ran += 1; await new Promise((r) => setTimeout(r, 50)); return "a"; }, "w1");
  const second = await withLease(db, "once", 60_000, async () => { ran += 1; return "b"; }, "w2");
  assert.equal(second, null, "the second worker does not run it");
  assert.equal(await slow, "a");
  assert.equal(ran, 1);
});
