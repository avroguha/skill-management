// Backups: every table - organisation, ratings, catalogue, accounts, ServiceNow and single
// sign-on configuration, settings, audit log - in one gzipped JSON file, read from one
// consistent snapshot. Restore replaces everything in one transaction: all or nothing.
//
// Files live in BACKUP_DIR (Docker: a host folder outside the containers, ideally another
// disk or a network share), never in the image, so a redeploy cannot touch them.
// Automatic backups run on a schedule; safety backups are taken before a restore, before
// "start from scratch" and before an upgrade that changes the database.
//
// Sessions and one-time verification codes are not kept: after a restore everyone signs in
// again. The ServiceNow password is stored sealed with the app secret, so on a server with
// a different secret it has to be entered again.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { DB } from "../db/index.ts";
import * as schema from "../db/schema.ts";

export const BACKUP_FORMAT = "skill-management-backup";
const SKIP = new Set(["session", "verification"]);
export type BackupReason = "manual" | "scheduled" | "before-restore" | "before-clear" | "before-upgrade" | "uploaded";

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  createdAt: string;
  by: string;
  reason: BackupReason;
  /** database migrations applied when it was taken */
  migrations: number;
  tables: Record<string, Record<string, unknown>[]>;
}

/** Every table the app keeps, by its database name. */
export function backupTables(): string[] {
  return Object.values(schema).filter((t) => is(t, PgTable)).map((t) => getTableName(t as PgTable))
    .filter((n) => !SKIP.has(n)).sort();
}

type Rows = { rows: Record<string, unknown>[] };
const rowsOf = (r: unknown) => (r as Rows).rows;

export async function migrationsApplied(db: DB): Promise<number> {
  try {
    const r = rowsOf(await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`));
    return Number(r[0]?.n ?? 0);
  } catch { return 0; }
}

/** Reads everything from one snapshot. */
export async function exportBackup(db: DB, by: string, reason: BackupReason): Promise<BackupFile> {
  const migrations = await migrationsApplied(db);
  const tables: BackupFile["tables"] = {};
  await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read`);
    for (const t of backupTables()) tables[t] = rowsOf(await tx.execute(sql`select * from ${sql.identifier(t)}`));
  });
  return { format: BACKUP_FORMAT, version: 1, createdAt: new Date().toISOString(), by, reason, migrations, tables };
}

export const encodeBackup = (b: BackupFile): Buffer => zlib.gzipSync(Buffer.from(JSON.stringify(b)));

/** A backup from a file: gzipped or plain JSON. Throws a readable error for anything else. */
export function decodeBackup(buf: Buffer): BackupFile {
  let text: string;
  try { text = (buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf).toString("utf8"); }
  catch { throw new Error("This file is not a readable backup (the compression is damaged)."); }
  let b: Partial<BackupFile>;
  try { b = JSON.parse(text); } catch { throw new Error("This file is not a backup made by this app."); }
  if (b.format !== BACKUP_FORMAT || b.version !== 1 || typeof b.tables !== "object" || !b.tables) {
    throw new Error("This file is not a backup made by this app.");
  }
  return b as BackupFile;
}

export function summarise(b: BackupFile): Record<string, number> {
  const pick = ["employee", "org_unit", "skill", "job_role", "rating", "user", "training_plan"];
  return Object.fromEntries(pick.map((t) => [t, b.tables[t]?.length ?? 0]));
}

/**
 * Replaces every table with the backup's rows, in one transaction. Foreign keys are not
 * checked while loading (the rows come from one consistent snapshot), so tables load in any
 * order. Columns the backup lacks (added by a newer version) take their defaults; columns
 * the database no longer has are ignored. A backup from a newer version is refused.
 */
export async function restoreBackup(db: DB, b: BackupFile): Promise<Record<string, number>> {
  const have = await migrationsApplied(db);
  if (b.migrations > have) throw new Error(`This backup was made by a newer version of the app (database version ${b.migrations}, this one is ${have}). Upgrade first.`);
  const tables = backupTables();
  const counts: Record<string, number> = {};
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    const cols = new Map<string, Set<string>>();
    for (const r of rowsOf(await tx.execute(sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`))) {
      const t = String(r.table_name);
      if (!cols.has(t)) cols.set(t, new Set());
      cols.get(t)!.add(String(r.column_name));
    }
    for (const t of tables) await tx.execute(sql`delete from ${sql.identifier(t)}`);
    await tx.execute(sql`delete from ${sql.identifier("session")}`);
    for (const t of tables) {
      const rows = b.tables[t] ?? [];
      counts[t] = rows.length;
      if (!rows.length) continue;
      const known = cols.get(t) ?? new Set();
      const names = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => known.has(c));
      const list = sql.join(names.map((c) => sql.identifier(c)), sql`, `);
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = JSON.stringify(rows.slice(i, i + 500));
        await tx.execute(sql`insert into ${sql.identifier(t)} (${list}) select ${list} from json_populate_recordset(null::${sql.identifier(t)}, ${chunk}::json)`);
      }
    }
  });
  return counts;
}

// ---- files -------------------------------------------------------------------------------

export function backupDir(): string {
  return process.env.BACKUP_DIR || path.join(process.env.DATA_DIR ?? path.join(process.cwd(), ".data"), "backups");
}

const NAME = /^skills-backup-\d{8}-\d{6}-[a-z-]+\.json\.gz$/;

export interface StoredBackup { name: string; size: number; at: string; reason: string }

function fileName(reason: BackupReason, at = new Date()): string {
  const s = at.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `skills-backup-${s}-${reason}.json.gz`;
}

/** Takes a backup and writes it to BACKUP_DIR (readable by the app's user only). */
export async function saveBackup(db: DB, by: string, reason: BackupReason): Promise<StoredBackup & { summary: Record<string, number> }> {
  const b = await exportBackup(db, by, reason);
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  let name = fileName(reason);
  for (let n = 1; fs.existsSync(path.join(dir, name)); n++) name = fileName(reason, new Date(Date.now() + n * 1000));
  const buf = encodeBackup(b);
  fs.writeFileSync(path.join(dir, name), buf, { mode: 0o600 });
  return { name, size: buf.length, at: b.createdAt, reason, summary: summarise(b) };
}

export function listBackups(): StoredBackup[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => NAME.test(n)).map((name) => {
    const st = fs.statSync(path.join(dir, name));
    const reason = /-\d{6}-([a-z-]+)\.json\.gz$/.exec(name)?.[1] ?? "";
    return { name, size: st.size, at: st.mtime.toISOString(), reason };
  }).sort((a, b) => b.name.localeCompare(a.name));
}

/** The path of a stored backup; refuses anything that is not one of ours (no path tricks). */
export function backupPath(name: string): string {
  if (!NAME.test(name)) throw new Error("No such backup.");
  const p = path.join(backupDir(), name);
  if (!fs.existsSync(p)) throw new Error("No such backup.");
  return p;
}

export function deleteBackup(name: string): void {
  fs.unlinkSync(backupPath(name));
}

/** Keeps the newest `keep` automatic and safety backups; backups made by hand stay until deleted. */
export function pruneBackups(keep: number): string[] {
  const auto = listBackups().filter((b) => b.reason !== "manual");
  const gone = auto.slice(Math.max(1, keep)).map((b) => b.name);
  for (const n of gone) fs.unlinkSync(path.join(backupDir(), n));
  return gone;
}

// ---- schedule ----------------------------------------------------------------------------

export interface BackupSettings { enabled: boolean; everyHours: number; keep: number }
export const DEFAULT_BACKUP: BackupSettings = { enabled: true, everyHours: 24, keep: 14 };

export async function readBackupSettings(db: DB): Promise<BackupSettings> {
  const r = rowsOf(await db.execute(sql`select value from app_setting where key = 'backup'`));
  return { ...DEFAULT_BACKUP, ...((r[0]?.value ?? {}) as Partial<BackupSettings>) };
}

export async function writeBackupSettings(db: DB, s: BackupSettings): Promise<void> {
  await db.execute(sql`insert into app_setting (key, value) values ('backup', ${JSON.stringify(s)}::jsonb)
    on conflict (key) do update set value = excluded.value`);
}

const g = globalThis as unknown as { __skillsBackupRunning?: boolean };

/** Runs the automatic backup when it is due. Never throws: a failure is logged. */
export async function backupIfDue(db: DB, now = Date.now()): Promise<StoredBackup | null> {
  if (g.__skillsBackupRunning) return null;
  try {
    const s = await readBackupSettings(db);
    if (!s.enabled || s.everyHours <= 0) return null;
    const last = listBackups().find((b) => b.reason === "scheduled");
    if (last && now - Date.parse(last.at) < s.everyHours * 3600e3) return null;
    g.__skillsBackupRunning = true;
    const saved = await saveBackup(db, "schedule", "scheduled");
    pruneBackups(s.keep);
    return saved;
  } catch (e) {
    console.error(`[backup] the automatic backup failed: ${(e as Error).message}`);
    return null;
  } finally {
    g.__skillsBackupRunning = false;
  }
}
