// Backups: everything out, everything back, exactly; older backups still restore; newer ones
// and foreign files are refused; the file store cannot be tricked into other paths.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://";
process.env.SEED_DEMO = "true";
process.env.BETTER_AUTH_SECRET = "test-secret-for-backups";
process.env.BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "skills-backups-"));
delete process.env.DATABASE_URL;

const { getDb, closeDb } = await import("../src/db/index.ts");
const B = await import("../src/lib/backup.ts");

const rows = async (q: ReturnType<typeof sql>) => ((await (await getDb()).execute(q)) as unknown as { rows: Record<string, unknown>[] }).rows;
const count = async (t: string) => Number((await rows(sql`select count(*)::int as n from ${sql.identifier(t)}`))[0].n);

test.after(async () => { await closeDb(); fs.rmSync(process.env.BACKUP_DIR!, { recursive: true, force: true }); });

test("a backup holds every table; restoring it after a wipe gives back exactly the same", async () => {
  const db = await getDb();
  await db.execute(sql`insert into app_setting (key, value) values ('directory', ${JSON.stringify({ instanceUrl: "https://x.service-now.com", rootUserName: "boss" })}::jsonb)
    on conflict (key) do update set value = excluded.value`);
  const before = Object.fromEntries(await Promise.all(B.backupTables().map(async (t) => [t, await count(t)] as const)));
  assert.ok(before.employee > 50 && before.rating > 100, "the demo is loaded");
  const oneRating = (await rows(sql`select * from rating order by employee_id, skill_id limit 1`))[0];

  const file = B.encodeBackup(await B.exportBackup(db, "tester", "manual"));
  const back = B.decodeBackup(file);
  assert.equal(back.tables.employee.length, before.employee);
  assert.ok(!("session" in back.tables), "sessions are not kept");

  // wipe the lot, as a lost server would
  await db.execute(sql`delete from rating`);
  await db.execute(sql`delete from app_setting`);
  await db.execute(sql`update employee set name = 'changed'`);

  const counts = await B.restoreBackup(db, back);
  assert.equal(counts.employee, before.employee);
  for (const t of B.backupTables()) assert.equal(await count(t), before[t], `${t} restored`);
  const again = (await rows(sql`select * from rating order by employee_id, skill_id limit 1`))[0];
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(oneRating)), "dates and values come back identical");
  const dir = (await rows(sql`select value from app_setting where key = 'directory'`))[0];
  assert.equal((dir.value as { rootUserName: string }).rootUserName, "boss", "configuration comes back too");
  assert.equal((await rows(sql`select count(*)::int as n from employee where name = 'changed'`))[0].n, 0);
});

test("an older backup (a column added since) restores with defaults; a column since dropped is ignored", async () => {
  const db = await getDb();
  const b = await B.exportBackup(db, "tester", "manual");
  b.tables.employee = b.tables.employee.map((r) => { const { location, ...rest } = r; return { ...rest, shoe_size: 44 }; });
  await B.restoreBackup(db, b);
  const r = (await rows(sql`select location from employee limit 1`))[0];
  assert.equal(r.location, "", "the missing column took its default");
});

test("a backup from a newer version, or a file that is not a backup, is refused", async () => {
  const db = await getDb();
  const b = await B.exportBackup(db, "tester", "manual");
  await assert.rejects(B.restoreBackup(db, { ...b, migrations: b.migrations + 1 }), /newer version/);
  assert.throws(() => B.decodeBackup(Buffer.from("hello")), /not a backup/);
  assert.throws(() => B.decodeBackup(Buffer.from(JSON.stringify({ format: "other", version: 1, tables: {} }))), /not a backup/);
  assert.throws(() => B.decodeBackup(Buffer.from([0x1f, 0x8b, 1, 2, 3])), /damaged/);
});

test("stored backups: listed newest first, no path tricks, pruning keeps hand-made ones", async () => {
  const db = await getDb();
  const m = await B.saveBackup(db, "tester", "manual");
  const s1 = await B.saveBackup(db, "schedule", "scheduled");
  const s2 = await B.saveBackup(db, "schedule", "scheduled");
  const list = B.listBackups().map((x) => x.name);
  assert.ok(list.includes(m.name) && list.includes(s1.name) && list.includes(s2.name));
  assert.equal(B.decodeBackup(fs.readFileSync(B.backupPath(s2.name))).reason, "scheduled");
  assert.throws(() => B.backupPath("../../etc/passwd"), /No such backup/);
  assert.throws(() => B.backupPath("skills-backup-20260101-000000-manual.json.gz"), /No such backup/);
  B.pruneBackups(1);
  const left = B.listBackups();
  assert.ok(left.some((x) => x.name === m.name), "made by hand: kept");
  assert.equal(left.filter((x) => x.reason !== "manual").length, 1, "only the newest automatic one kept");
});

test("the automatic backup runs when due and not again until the interval has passed", async () => {
  const db = await getDb();
  await B.writeBackupSettings(db, { enabled: true, everyHours: 24, keep: 5 });
  for (const x of B.listBackups()) if (x.reason === "scheduled") B.deleteBackup(x.name);
  const first = await B.backupIfDue(db);
  assert.ok(first, "nothing scheduled yet: one is taken");
  assert.equal(await B.backupIfDue(db), null, "not due again yet");
  assert.ok(await B.backupIfDue(db, Date.now() + 25 * 3600e3), "due after the interval");
  await B.writeBackupSettings(db, { enabled: false, everyHours: 24, keep: 5 });
  assert.equal(await B.backupIfDue(db, Date.now() + 100 * 3600e3), null, "switched off: never");
});
