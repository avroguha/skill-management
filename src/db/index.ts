// Database connection, migrations and first-start seeding.
//
// DATABASE_URL set   -> PostgreSQL through node-postgres (Docker, production).
//                       The password may come from DATABASE_PASSWORD_FILE.
// DATABASE_URL unset -> PGlite (PostgreSQL compiled to WebAssembly) in DATA_DIR,
//                       default ./.data/pglite: development and tests, no server.
//
// Both speak the same SQL and use the same Drizzle schema and migrations.
import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import * as schema from "./schema.ts";

export type DB = NodePgDatabase<typeof schema>;

type Holder = { db?: DB; ready?: Promise<void>; close?: () => Promise<void> };
const g = globalThis as unknown as { __skillsDb?: Holder };
const holder: Holder = (g.__skillsDb ??= {});

function migrationsFolder(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.join(process.cwd(), "drizzle"),
  ].filter(Boolean) as string[];
  for (const c of candidates) if (fs.existsSync(path.join(c, "meta", "_journal.json"))) return c;
  throw new Error(`migrations not found (looked in ${candidates.join(", ")})`);
}

function readPasswordFile(): string | undefined {
  const f = process.env.DATABASE_PASSWORD_FILE;
  if (!f) return undefined;
  return fs.readFileSync(f, "utf8").trim();
}

/**
 * The embedded development database. PGlite cannot recover a data folder left behind by a
 * killed process ("PGlite failed to initialize properly"), and a stopped dev server is
 * usually killed. So: close it cleanly on Ctrl+C / stop, and if it still cannot be opened,
 * move the folder aside (never delete it), say so loudly, and start a fresh one, which the
 * seed fills again. Development only: production uses PostgreSQL through DATABASE_URL.
 */
async function openLiteDir(PGlite: typeof import("@electric-sql/pglite").PGlite, dir: string) {
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

/** Start-up work (backup before upgrade, migrations, first seed) runs in one worker at a
 *  time: several app workers or containers on one database would otherwise race. */
const START_LOCK = 727_274_001;

async function open(): Promise<Opened> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pg = await import("pg");
    const password = readPasswordFile();
    const pool = new pg.default.Pool({
      connectionString: url,
      ...(password ? { password } : {}),
      max: Number(process.env.DATABASE_POOL_MAX || 10),
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
  const dir = process.env.PGLITE_DIR ?? path.join(process.env.DATA_DIR ?? path.join(process.cwd(), ".data"), "pglite");
  const client = dir === "memory://" ? new PGlite() : await openLiteDir(PGlite, dir);
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

let opening: Promise<DB> | undefined;

/** The database, migrated and seeded. Safe to call from anywhere, any number of times. */
export async function getDb(): Promise<DB> {
  if (holder.db && holder.ready) {
    await holder.ready;
    return holder.db;
  }
  opening ??= (async () => {
    const { db, migrate, close, exclusive } = await open();
    holder.db = db;
    holder.close = close;
    holder.ready = exclusive(async () => {
      await backupBeforeUpgrade(db);
      await migrate();
      const { seed } = await import("./seed.ts");
      await seed(db);
    });
    await holder.ready;
    return db;
  })();
  return opening;
}

/** For tests: close and forget the connection. */
export async function closeDb(): Promise<void> {
  await holder.close?.();
  holder.db = undefined;
  holder.ready = undefined;
  holder.close = undefined;
  opening = undefined;
}

export { schema };
