// Bringing version 1's data into version 2, once, on the first start of v2.
//
// v2 lives in its own database; the v1 database is only READ here and never changed, so
// going back to v1 stays possible. Everything that still has a meaning comes across with
// its ids unchanged (so sessions, SSO links, ratings and history line up):
//
//   accounts, sessions, single sign-on providers, people, roles, grades, skill categories,
//   skills, levels, role targets, ratings and their history, the ServiceNow groups, the
//   settings (single sign-on, ServiceNow, e-mail, help, levels), sync runs, the audit log,
//   sent e-mail
//
// and what v2 does differently is converted:
//
//   a unit's team needs  -> the needs of the unit's manager's team
//   a unit's name        -> the team name of its manager (hand-made units only)
//
// What v2 no longer has is counted and left behind (it stays in the v1 database): units,
// assessment rounds, per-person targets, training plans, open positions, charts, operator
// assignments, API keys, feedback, monthly snapshots.
import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { databaseNames, liteDirs, withDatabase, withPassword } from "../db/index.ts";
import * as s from "../db/schema.ts";

export const IMPORT_KEY = "imported_v1";

export interface ImportSummary {
  at: string;
  /** where it came from, or null when there was no v1 database */
  source: string | null;
  copied: Record<string, number>;
  converted: { teamNeeds: number; teamNames: number };
  leftBehind: Record<string, number>;
  note?: string;
}

type Row = Record<string, unknown>;
interface Source { label: string; query: (text: string) => Promise<Row[]>; close: () => Promise<void> }

/** v1 tables copied as they are (in an order that satisfies the foreign keys). */
const COPY = [
  "user", "account", "session", "verification", "sso_provider",
  "job_role", "grade", "skill_category", "skill", "proficiency_level", "role_skill",
  "employee", "rating", "rating_event",
  "sn_group", "group_member", "sync_run", "audit_log", "sso_attempt", "sso_pending", "email_message",
] as const;

/** v1 tables with no place in v2: counted, left in the v1 database. */
const LEFT_BEHIND: Record<string, string> = {
  org_unit: "units", assessment_cycle: "assessment rounds", employee_target: "per-person targets",
  training_plan: "training plans", open_position: "open positions", saved_chart: "charts",
  operator_scope: "operator assignments", api_client: "API keys", feedback: "feedback messages", snapshot: "monthly snapshots",
};

/** Settings keys that belonged to v1's own bookkeeping. */
const SKIP_SETTINGS = new Set(["demo_seeded", "email_reminders", IMPORT_KEY]);

async function openSource(): Promise<Source | null> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pg = await import("pg");
    const name = databaseNames(url).v1;
    const client = new pg.default.Client({ connectionString: withDatabase(withPassword(url, process.env.DATABASE_PASSWORD_FILE ? fs.readFileSync(process.env.DATABASE_PASSWORD_FILE, "utf8").trim() : undefined), name) });
    try { await client.connect(); } catch { return null; }
    return { label: `PostgreSQL database ${name}`, query: async (q) => (await client.query(q)).rows as Row[], close: () => client.end() };
  }
  const dir = liteDirs().v1;
  if (!dir || !fs.existsSync(path.join(dir, "PG_VERSION"))) return null;
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(dir);
  await client.waitReady;
  return { label: `embedded database ${dir}`, query: async (q) => (await client.query<Row>(q)).rows, close: () => client.close() };
}

/** For tests: import from a given source instead of the configured one. */
export async function importFrom(db: DB, src: Source): Promise<ImportSummary> {
  const tables = new Set((await src.query("select table_name from information_schema.tables where table_schema = 'public'")).map((r) => String(r.table_name)));
  const summary: ImportSummary = { at: new Date().toISOString(), source: src.label, copied: {}, converted: { teamNeeds: 0, teamNames: 0 }, leftBehind: {} };
  if (!tables.has("org_unit") || !tables.has("employee")) {
    summary.note = "That database is not a version-1 Skill Management database: nothing was imported.";
    return summary;
  }

  // the columns each v2 table has: a v1 column v2 no longer has is left out
  const targetCols = new Map<string, Set<string>>();
  const colRows = (await db.execute(sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`)) as unknown as { rows: Row[] };
  for (const r of colRows.rows) {
    const t = String(r.table_name);
    if (!targetCols.has(t)) targetCols.set(t, new Set());
    targetCols.get(t)!.add(String(r.column_name));
  }

  // units: the name of a hand-made unit becomes its manager's team name
  const units = tables.has("org_unit") ? await src.query(`select id, name, manager_id, external_key, sort from "org_unit" order by sort, name`) : [];
  const teamName = new Map<string, string>();
  for (const u of units) {
    const mgr = u.manager_id as string | null;
    const name = String(u.name ?? "").trim();
    if (!mgr || !name || teamName.has(mgr)) continue;
    if (u.external_key && /'s team$/i.test(name)) continue; // the sync's own "<name>'s team"
    teamName.set(mgr, name);
  }

  const insert = async (tx: DB, table: string, rows: Row[], onConflict = false) => {
    const cols = targetCols.get(table);
    if (!cols || !rows.length) return 0;
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => cols.has(k));
    const list = sql.join(keys.map((k) => sql.identifier(k)), sql`, `);
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = JSON.stringify(rows.slice(i, i + 1000), (_k, v) => (typeof v === "bigint" ? Number(v) : v));
      await tx.execute(sql`insert into ${sql.identifier(table)} (${list}) select ${list} from json_populate_recordset(null::${sql.identifier(table)}, ${chunk}::json)${onConflict ? sql` on conflict do nothing` : sql``}`);
    }
    return rows.length;
  };

  await db.transaction(async (tx) => {
    const t = tx as unknown as DB;
    // the seeded rows of an empty v2 (levels, settings) give way to v1's
    await t.delete(s.proficiencyLevel);
    for (const table of COPY) {
      if (!tables.has(table)) continue;
      let rows = await src.query(`select * from "${table}"`);
      if (table === "employee") rows = rows.map((r) => ({ ...r, team_name: teamName.get(String(r.id)) ?? "" }));
      if (table === "employee" && rows.some((r) => teamName.has(String(r.id)))) summary.converted.teamNames = rows.filter((r) => teamName.has(String(r.id))).length;
      summary.copied[table] = await insert(t, table, rows);
    }
    if (tables.has("app_setting")) {
      const rows = (await src.query(`select key, value from "app_setting"`)).filter((r) => !SKIP_SETTINGS.has(String(r.key)));
      await t.delete(s.appSetting).where(sql`${s.appSetting.key} in (${sql.join(rows.map((r) => sql`${String(r.key)}`), sql`, `)})`);
      summary.copied.app_setting = await insert(t, "app_setting", rows);
    }
    if (tables.has("unit_requirement")) {
      const needs = await src.query(`select r.id, u.manager_id, r.skill_id, r.min_level, r.headcount, r.note
        from "unit_requirement" r join "org_unit" u on u.id = r.unit_id where u.manager_id is not null`);
      summary.converted.teamNeeds = needs.length;
      await insert(t, "team_need", needs, true);
    }
    for (const [table, label] of Object.entries(LEFT_BEHIND)) {
      if (!tables.has(table)) continue;
      const [{ n }] = await src.query(`select count(*)::int as n from "${table}"`);
      if (Number(n)) summary.leftBehind[label] = Number(n);
    }
    await t.insert(s.appSetting).values({ key: IMPORT_KEY, value: summary as never })
      .onConflictDoUpdate({ target: s.appSetting.key, set: { value: summary as never } });
    await t.insert(s.auditLog).values({ actorName: "system", action: "import_v1", entity: "database", detail: summary as never });
  });
  return summary;
}

/**
 * On the first start of v2: if the live database is still empty and a v1 database exists,
 * import it. Runs once (the summary is kept and shown in Settings › Data).
 */
export async function importIfDue(db: DB): Promise<ImportSummary | null> {
  const [done] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, IMPORT_KEY));
  if (done) return null;
  const [{ n }] = (await db.execute(sql`select (select count(*) from "employee") + (select count(*) from "user") as n`) as unknown as { rows: { n: number }[] }).rows;
  const record = async (summary: ImportSummary) => {
    await db.insert(s.appSetting).values({ key: IMPORT_KEY, value: summary as never }).onConflictDoNothing();
    return summary;
  };
  if (Number(n) > 0) return record({ at: new Date().toISOString(), source: null, copied: {}, converted: { teamNeeds: 0, teamNames: 0 }, leftBehind: {}, note: "Version 2 already had data: nothing was imported." });
  const src = await openSource().catch(() => null);
  if (!src) return record({ at: new Date().toISOString(), source: null, copied: {}, converted: { teamNeeds: 0, teamNames: 0 }, leftBehind: {}, note: "No version-1 database was found: version 2 started empty." });
  try {
    const summary = await importFrom(db, src);
    if (summary.note) return record(summary);
    console.log(`[import] version 1 imported from ${src.label}: ${Object.entries(summary.copied).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    return summary;
  } finally {
    await src.close().catch(() => undefined);
  }
}
