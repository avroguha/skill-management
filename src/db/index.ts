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

async function open(): Promise<{ db: DB; migrate: () => Promise<void>; close: () => Promise<void> }> {
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
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzleLite } = await import("drizzle-orm/pglite");
  const { migrate: migrateLite } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.env.DATA_DIR ?? path.join(process.cwd(), ".data"), "pglite");
  const client = dir === "memory://" ? new PGlite() : (fs.mkdirSync(dir, { recursive: true }), new PGlite(dir));
  const lite = drizzleLite(client, { schema });
  return {
    db: lite as unknown as DB,
    migrate: () => migrateLite(lite, { migrationsFolder: migrationsFolder() }),
    close: () => client.close(),
  };
}

let opening: Promise<DB> | undefined;

/** The database, migrated and seeded. Safe to call from anywhere, any number of times. */
export async function getDb(): Promise<DB> {
  if (holder.db && holder.ready) {
    await holder.ready;
    return holder.db;
  }
  opening ??= (async () => {
    const { db, migrate, close } = await open();
    holder.db = db;
    holder.close = close;
    holder.ready = (async () => {
      await migrate();
      const { seed } = await import("./seed.ts");
      await seed(db);
    })();
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
