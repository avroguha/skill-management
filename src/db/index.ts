// Database connections, migrations and first-start seeding.
//
// Two databases, one schema:
//   live   the real one
//   demo   made-up people and skills for presentations (the header's Demo switch);
//          nothing done in demo mode ever reaches the live database
//
// DATABASE_URL set   -> PostgreSQL through node-postgres (Docker, production). DATABASE_URL
//                       names the server and the version-1 database; v2 keeps its data in
//                       "<name>_v2" and the demo in "<name>_demo" on the same server, and
//                       creates them on first start. The version-1 database is only read
//                       (once, to import it) and never changed, so going back stays possible.
//                       The password may come from DATABASE_PASSWORD_FILE.
// DATABASE_URL unset -> PGlite (PostgreSQL compiled to WebAssembly) in DATA_DIR: development
//                       and tests, no server. PGLITE_DIR=memory:// keeps everything in memory.
import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import * as schema from "./schema.ts";

export type DB = NodePgDatabase<typeof schema>;
export type Mode = "live" | "demo";

type Holder = { db?: DB; ready?: Promise<void>; close?: () => Promise<void>; opening?: Promise<DB> };
const g = globalThis as unknown as { __skillsDb2?: Record<Mode, Holder>; __skillsModeResolver?: () => Promise<Mode> };
const holders: Record<Mode, Holder> = (g.__skillsDb2 ??= { live: {}, demo: {} });

/**
 * Which database a call without an explicit mode uses: set by the server (src/lib/mode.ts)
 * to read the request's demo switch. Outside a request - and in tests - it is the live one.
 */
export function setModeResolver(fn: () => Promise<Mode>): void {
  g.__skillsModeResolver = fn;
}
async function resolveMode(): Promise<Mode> {
  try { return (await g.__skillsModeResolver?.()) ?? "live"; } catch { return "live"; }
}

function migrationsFolder(): string {
  const candidates = [process.env.MIGRATIONS_DIR, path.join(process.cwd(), "drizzle")].filter(Boolean) as string[];
  for (const c of candidates) if (fs.existsSync(path.join(c, "meta", "_journal.json"))) return c;
  throw new Error(`migrations not found (looked in ${candidates.join(", ")})`);
}

function readPasswordFile(): string | undefined {
  const f = process.env.DATABASE_PASSWORD_FILE;
  if (!f) return undefined;
  return fs.readFileSync(f, "utf8").trim();
}

/** The password goes INTO the connection string: pg lets the values parsed from a
 *  connectionString override its other options, so a separate `password` was silently
 *  dropped. That went unnoticed while the app reached PostgreSQL on 127.0.0.1, which the
 *  image trusts without a password; over the compose network it is required. */
export function withPassword(url: string, password: string | undefined): string {
  if (!password) return url;
  const u = new URL(url);
  if (u.password) return url; // a password in DATABASE_URL itself wins
  u.password = encodeURIComponent(password);
  return u.toString();
}

/** The same server, another database. */
export function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(database)}`;
  return u.toString();
}

/** The database names on a PostgreSQL server: v1 (DATABASE_URL's), live and demo. */
export function databaseNames(url: string): { v1: string; live: string; demo: string } {
  const v1 = decodeURIComponent(new URL(url).pathname.replace(/^\//, "")) || "skills";
  return {
    v1,
    live: process.env.LIVE_DATABASE || `${v1}_v2`,
    demo: process.env.DEMO_DATABASE || `${v1}_demo`,
  };
}

/** The embedded databases: the v1 folder, and a folder each for live and demo beside it. */
export function liteDirs(): { v1: string; live: string; demo: string } {
  const base = process.env.PGLITE_DIR ?? path.join(process.env.DATA_DIR ?? path.join(process.cwd(), ".data"), "pglite");
  if (base === "memory://") return { v1: "", live: "memory://", demo: "memory://" };
  return { v1: base, live: `${base}-v2`, demo: `${base}-demo` };
}

/**
 * The embedded development database. PGlite cannot recover a data folder left behind by a
 * killed process ("PGlite failed to initialize properly"), and a stopped dev server is
 * usually killed. So: close it cleanly on Ctrl+C / stop, and if it still cannot be opened,
 * move the folder aside (never delete it), say so loudly, and start a fresh one.
 */
async function openLiteDir(PGlite: typeof import("@electric-sql/pglite").PGlite, dir: string) {
  if (dir === "memory://") return new PGlite();
  fs.mkdirSync(dir, { recursive: true });
  let client = new PGlite(dir);
  try {
    await client.waitReady;
  } catch (err) {
    if (process.env.NODE_ENV === "production") throw err;
    await client.close().catch(() => undefined);
    const aside = `${dir}-broken-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.renameSync(dir, aside);
    console.error(`[db] The development database in ${dir} could not be opened (${(err as Error).message}); `
      + `this happens after the dev server is killed. It was moved to ${aside} and a fresh one is being created.`);
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
    await client.waitReady;
  }
  const shut = () => { void client.close().catch(() => undefined).finally(() => process.exit(0)); };
  process.once("SIGINT", shut);
  process.once("SIGTERM", shut);
  return client;
}

type Opened = { db: DB; migrate: () => Promise<void>; close: () => Promise<void>; exclusive: <T>(fn: () => Promise<T>) => Promise<T> };

/** Start-up work (backup before upgrade, migrations, import, first seed) runs in one worker
 *  at a time: several app workers or containers on one database would otherwise race. */
const START_LOCK = 727_274_002;

/** Creates a database on the server if it is not there yet (several workers may try at once). */
async function ensureDatabase(adminUrl: string, name: string): Promise<void> {
  const pg = await import("pg");
  const client = new pg.default.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [START_LOCK]);
    const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (!rowCount) {
      await client.query(`create database "${name.replace(/"/g, '""')}"`);
      console.log(`[db] created the database ${name}`);
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [START_LOCK]).catch(() => undefined);
    await client.end();
  }
}

async function open(mode: Mode): Promise<Opened> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pg = await import("pg");
    const full = withPassword(url, readPasswordFile());
    const name = databaseNames(url)[mode];
    await ensureDatabase(full, name);
    const pool = new pg.default.Pool({
      connectionString: withDatabase(full, name),
      max: Number(process.env.DATABASE_POOL_MAX || (mode === "demo" ? 4 : 10)),
    });
    const db = drizzlePg(pool, { schema });
    return {
      db,
      migrate: () => migratePg(db, { migrationsFolder: migrationsFolder() }),
      close: () => pool.end(),
      exclusive: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("select pg_advisory_lock($1)", [START_LOCK]);
          return await fn();
        } finally {
          await client.query("select pg_advisory_unlock($1)", [START_LOCK]).catch(() => undefined);
          client.release();
        }
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzleLite } = await import("drizzle-orm/pglite");
  const { migrate: migrateLite } = await import("drizzle-orm/pglite/migrator");
  const client = await openLiteDir(PGlite, liteDirs()[mode]);
  const lite = drizzleLite(client, { schema });
  return {
    db: lite as unknown as DB,
    migrate: () => migrateLite(lite, { migrationsFolder: migrationsFolder() }),
    close: () => client.close(),
    exclusive: (fn) => fn(), // one process owns an embedded database
  };
}

/**
 * Before an upgrade changes the database (migrations pending on a database that already has
 * data), take a full backup. If it cannot be taken, the upgrade stops here: nothing is
 * changed without a way back.
 */
async function backupBeforeUpgrade(db: DB): Promise<void> {
  const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder(), "meta", "_journal.json"), "utf8")) as { entries: unknown[] };
  const { migrationsApplied, saveBackup } = await import("../lib/backup.ts");
  const applied = await migrationsApplied(db);
  if (applied === 0 || applied >= journal.entries.length) return;
  try {
    const b = await saveBackup(db, "system", "before-upgrade");
    console.log(`[db] ${journal.entries.length - applied} database change(s) to apply: backed up to ${b.name} first`);
  } catch (e) {
    throw new Error(`[db] the backup before upgrading could not be written (${(e as Error).message}); the database was not changed. Make BACKUP_DIR writable and start again.`);
  }
}

/**
 * The database, migrated and seeded. Safe to call from anywhere, any number of times.
 * Without a mode: the database of the current request (the demo one while the viewer has
 * switched to demo mode), else the live one.
 */
export async function getDb(mode?: Mode): Promise<DB> {
  const m = mode ?? (await resolveMode());
  const h = holders[m];
  if (h.db && h.ready) {
    await h.ready;
    return h.db;
  }
  h.opening ??= (async () => {
    const { db, migrate, close, exclusive } = await open(m);
    h.db = db;
    h.close = close;
    h.ready = exclusive(async () => {
      if (m === "live") await backupBeforeUpgrade(db);
      await migrate();
      if (m === "live") {
        const { importIfDue } = await import("../lib/import-v1.ts");
        await importIfDue(db);
        const { seed } = await import("./seed.ts");
        await seed(db);
      } else {
        const { seedDemoIfEmpty } = await import("./demo.ts");
        await seedDemoIfEmpty(db);
      }
    });
    h.ready.catch(() => { h.opening = undefined; h.ready = undefined; h.db = undefined; });
    await h.ready;
    return db;
  })();
  return h.opening;
}

/** For tests: close and forget the connections. */
export async function closeDb(): Promise<void> {
  for (const m of ["live", "demo"] as Mode[]) {
    const h = holders[m];
    await h.close?.().catch(() => undefined);
    holders[m] = {};
  }
  g.__skillsDb2 = holders;
}

export { schema };
