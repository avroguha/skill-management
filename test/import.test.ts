// Version 1 -> version 2, end to end: a real v1 database (built from the v1 migrations in
// drizzle-v1/, filled the way a site that has set up SSO and the ServiceNow sync would be),
// then v2 starting beside it for the first time. Everything with a meaning in v2 must come
// across with its ids, units must become teams, and the v1 database must not change.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";

const base = fs.mkdtempSync(path.join(os.tmpdir(), "skm-import-"));
const v1dir = path.join(base, "pglite");
process.env.PGLITE_DIR = v1dir;
process.env.BACKUP_DIR = path.join(base, "backups");
delete process.env.DATABASE_URL;

async function buildV1() {
  const db = new PGlite(v1dir);
  await db.waitReady;
  const dir = path.join(import.meta.dirname, "..", "drizzle-v1");
  const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
  for (const e of journal.entries) {
    for (const stmt of fs.readFileSync(path.join(dir, `${e.tag}.sql`), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await db.exec(stmt);
    }
  }
  const t = "now()";
  await db.exec(`
    insert into "user" (id, name, email, email_verified, username, role, created_at, updated_at) values
      ('u-admin', 'Administrator', 'admin@skills.local', true, 'admin', 'admin', ${t}, ${t}),
      ('u-ann', 'Ann Lee', 'ann@avro.com', true, null, 'executive', ${t}, ${t}),
      ('u-bob', 'Bob Ray', 'bob@avro.com', true, null, null, ${t}, ${t});
    insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values
      ('a-admin', 'u-admin', 'credential', 'u-admin', 'hash', ${t}, ${t}),
      ('a-ann', 'ann-nameid', 'entra', 'u-ann', null, ${t}, ${t});
    insert into sso_provider (id, issuer, saml_config, user_id, provider_id, domain) values ('p1', 'https://skills.avro.com/sso', '{}', 'u-admin', 'entra', 'avro.com');
    insert into job_role (id, name) values ('r-eng', 'Engineer');
    insert into grade (id, name, rank) values ('g-sr', 'Senior', 2);
    insert into skill_category (id, name, sort) values ('c1', 'Cloud', 1);
    insert into skill (id, category_id, name, aliases, status) values ('s-aws', 'c1', 'AWS', '{"Amazon Web Services"}', 'active'), ('s-k8s', 'c1', 'Kubernetes', '{K8s,kube}', 'active');
    insert into role_skill (id, role_id, grade_id, skill_id, target, mandatory) values ('rs1', 'r-eng', null, 's-aws', 3, true);
    insert into org_unit (id, name, kind, parent_id, manager_id, external_key) values
      ('o-co', 'Avro', 'company', null, 'e-ann', null),
      ('o-plat', 'Platform Engineering', 'team', 'o-co', 'e-ann', null),
      ('o-sync', 'Cid Ng''s team', 'team', 'o-co', 'e-cid', 'mgr:cid');
    insert into employee (id, name, email, title, unit_id, role_id, grade_id, manager_id, user_id, source, external_id, user_name, attributes) values
      ('e-ann', 'Ann Lee', 'ann@avro.com', 'Director', 'o-co', null, null, null, 'u-ann', 'directory', 'sys-ann', 'ann.lee', '{"employee_number":"1"}'),
      ('e-bob', 'Bob Ray', 'bob@avro.com', 'Senior Engineer', 'o-plat', 'r-eng', 'g-sr', 'e-ann', 'u-bob', 'directory', 'sys-bob', 'bob.ray', '{}'),
      ('e-cid', 'Cid Ng', 'cid@avro.com', 'Manager', 'o-sync', null, null, 'e-ann', null, 'directory', 'sys-cid', 'cid.ng', '{}'),
      ('e-dee', 'Dee Fox', 'dee@avro.com', 'Engineer', 'o-sync', 'r-eng', null, 'e-cid', null, 'directory', 'sys-dee', 'dee.fox', '{}');
    insert into assessment_cycle (id, name, starts_on, due_on, status) values ('cy1', '2026 H2', '2026-10-01', '2026-12-15', 'open');
    insert into rating (employee_id, skill_id, self_level, self_at, validated_level, validated_at, validated_by, evidence, interest, status, cycle_id) values
      ('e-bob', 's-aws', 4, ${t}, 4, ${t}, 'u-ann', 'led the migration', true, 'validated', 'cy1'),
      ('e-dee', 's-aws', 2, ${t}, null, null, null, '', false, 'submitted', 'cy1');
    insert into rating_event (id, employee_id, skill_id, kind, level, actor_id, cycle_id) values ('ev1', 'e-bob', 's-aws', 'validate', 4, 'u-ann', 'cy1');
    insert into unit_requirement (id, unit_id, skill_id, min_level, headcount, note) values
      ('ur1', 'o-plat', 's-k8s', 3, 2, 'on-call'), ('ur2', 'o-sync', 's-aws', 2, 1, '');
    insert into employee_target (employee_id, skill_id, target, reason) values ('e-bob', 's-k8s', 3, 'migration');
    insert into training_plan (id, employee_id, skill_id, target_level, title) values ('tp1', 'e-dee', 's-aws', 3, 'AWS course');
    insert into sn_group (id, external_id, name) values ('grp1', 'sys-grp1', 'Cloud Ops');
    insert into group_member (group_id, employee_id) values ('grp1', 'e-bob');
    insert into app_setting (key, value) values
      ('sso', '{"active": true, "matchField": "email"}'),
      ('directory', '{"enabled": true, "instanceUrl": "https://avro.service-now.com", "orgFromHierarchy": true}'),
      ('settings', '{"staleMonths": 18, "excludeStale": false, "greenAt": 80, "amberAt": 50}'),
      ('demo_seeded', '{"at": "2026-11-12"}');
    insert into audit_log (id, actor_name, action, entity) values ('al1', 'Administrator', 'save_sso', 'app_setting');
  `);
  const counts = await db.query<{ t: string; n: number }>(`select 'employee' t, count(*)::int n from employee union all select 'rating', count(*)::int from rating union all select 'org_unit', count(*)::int from org_unit`);
  await db.close();
  return counts.rows;
}

const before = await buildV1();
const { getDb, closeDb, schema: s } = await import("../src/db/index.ts");
const { IMPORT_KEY, importIfDue } = await import("../src/lib/import-v1.ts");
const { loadDatasetFrom } = await import("../src/lib/dataset.ts");
const { createEngine } = await import("../src/lib/engine/engine.ts");

test.after(async () => { await closeDb(); fs.rmSync(base, { recursive: true, force: true }); });

test("first start of v2 imports v1: people, accounts, SSO, skills, ratings and history, with their ids", async () => {
  const db = await getDb("live");
  const people = await db.select().from(s.employee);
  assert.deepEqual(people.map((p) => p.id).sort(), ["e-ann", "e-bob", "e-cid", "e-dee"]);
  const bob = people.find((p) => p.id === "e-bob")!;
  assert.deepEqual([bob.managerId, bob.userId, bob.roleId, bob.gradeId, bob.externalId, bob.userName], ["e-ann", "u-bob", "r-eng", "g-sr", "sys-bob", "bob.ray"]);
  assert.deepEqual(people.find((p) => p.id === "e-ann")!.attributes, { employee_number: "1" });
  const users = await db.select().from(s.user);
  assert.deepEqual(users.map((u) => u.username ?? u.id).sort(), ["admin", "u-ann", "u-bob"], "no second admin seeded over the imported one");
  assert.equal((await db.select().from(s.account)).length, 2);
  assert.equal((await db.select().from(s.ssoProvider))[0].providerId, "entra");
  const skills = await db.select().from(s.skill);
  assert.deepEqual(skills.find((k) => k.id === "s-k8s")!.aliases, ["K8s", "kube"]);
  const [r] = await db.select().from(s.rating).where(eq(s.rating.employeeId, "e-bob"));
  assert.deepEqual([r.validatedLevel, r.status, r.interest], [4, "validated", true]);
  assert.equal((await db.select().from(s.ratingEvent)).length, 1);
  assert.equal((await db.select().from(s.groupMember)).length, 1);
  assert.equal((await db.select().from(s.roleSkill)).length, 1);
  assert.equal((await db.select().from(s.auditLog)).filter((a) => a.action === "save_sso").length, 1);
});

test("units become teams: their needs go to the unit's manager, a hand-made unit's name becomes the team name", async () => {
  const db = await getDb("live");
  const needs = await db.select().from(s.teamNeed);
  assert.deepEqual(needs.map((n) => [n.managerId, n.skillId, n.minLevel, n.headcount, n.note]).sort(), [["e-ann", "s-k8s", 3, 2, "on-call"], ["e-cid", "s-aws", 2, 1, ""]]);
  const people = await db.select().from(s.employee);
  assert.equal(people.find((p) => p.id === "e-ann")!.teamName, "Avro", "the first unit Ann manages, by order");
  assert.equal(people.find((p) => p.id === "e-cid")!.teamName, "", "the sync's own \"Cid Ng's team\" is not kept as a name");
  const e = createEngine(await loadDatasetFrom(db));
  assert.deepEqual(e.membersOf("e-cid").map((x) => x.id), ["e-cid", "e-dee"]);
  assert.equal(e.teamLabel("e-cid"), "Cid Ng's team");
});

test("settings come across (single sign-on, ServiceNow, rules); v1 bookkeeping does not", async () => {
  const db = await getDb("live");
  const rows = await db.select().from(s.appSetting);
  const keys = rows.map((x) => x.key).sort();
  assert.ok(keys.includes("sso") && keys.includes("directory") && keys.includes("settings"));
  assert.ok(!keys.includes("demo_seeded"));
  assert.equal((rows.find((x) => x.key === "settings")!.value as { staleMonths: number }).staleMonths, 18);
  assert.equal((rows.find((x) => x.key === "sso")!.value as { active: boolean }).active, true);
});

test("what v2 no longer has is counted and left in v1; the summary is kept and the import runs once", async () => {
  const db = await getDb("live");
  const [row] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, IMPORT_KEY));
  const sum = row.value as { leftBehind: Record<string, number>; converted: { teamNeeds: number }; copied: Record<string, number> };
  assert.deepEqual(sum.leftBehind, { units: 3, "assessment rounds": 1, "per-person targets": 1, "training plans": 1 });
  assert.equal(sum.converted.teamNeeds, 2);
  assert.equal(sum.copied.employee, 4);
  assert.equal(await importIfDue(db), null, "a second start imports nothing");
  const [{ n }] = await db.select({ n: count() }).from(s.employee);
  assert.equal(n, 4);
});

test("the v1 database is unchanged", async () => {
  await closeDb();
  const v1 = new PGlite(v1dir);
  await v1.waitReady;
  const after = await v1.query<{ t: string; n: number }>(`select 'employee' t, count(*)::int n from employee union all select 'rating', count(*)::int from rating union all select 'org_unit', count(*)::int from org_unit`);
  await v1.close();
  assert.deepEqual(after.rows, before);
});
