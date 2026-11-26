// CSV import/export: everything exported from one database imports into an empty one
// and exports again identically; the numbers the app shows come out the same.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { count } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

const { getDb, closeDb, schema } = await import("../src/db/index.ts");
const { exportCsv, importCsv, KINDS, skillSimilarity } = await import("../src/lib/transfer.ts");
const { parseCsv, parseCsvObjects, toCsv } = await import("../src/lib/csv.ts");
const { loadDatasetFrom } = await import("../src/lib/dataset.ts");
const { createEngine, ALL } = await import("../src/lib/engine/engine.ts");
type DB = Awaited<ReturnType<typeof getDb>>;

async function emptyDb(): Promise<{ db: DB; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db: db as unknown as DB, close: () => client.close() };
}

test.after(() => closeDb());

test("CSV: quotes, commas, line breaks, doubled quotes, BOM, CRLF and header normalising", () => {
  const text = '﻿Name,Manager E-mail,Note\r\n"Smith, Ann",ann@x.com,"said ""hi""\nthen left"\r\n\r\nBob,,plain\r\n';
  assert.deepEqual(parseCsv(text), [["Name", "Manager E-mail", "Note"], ["Smith, Ann", "ann@x.com", 'said "hi"\nthen left'], ["Bob", "", "plain"]]);
  const objs = parseCsvObjects(text);
  assert.deepEqual(objs[0], { line: 2, data: { name: "Smith, Ann", manager_email: "ann@x.com", note: 'said "hi"\nthen left' } });
  const round = toCsv(["a", "b"], [{ a: 'x,"y"', b: " lead" }]);
  assert.deepEqual(parseCsv(round), [["a", "b"], ['x,"y"', " lead"]]);
});

test("every export re-imports into an empty database and exports again identically", async () => {
  const source = await getDb("demo"); // the made-up organisation: something of every kind
  const exported = Object.fromEntries(await Promise.all(KINDS.map(async (k) => [k, await exportCsv(source, k)] as const)));
  const target = await emptyDb();
  try {
    for (const k of KINDS) {
      const rep = await importCsv(target.db, k, exported[k]);
      assert.deepEqual(rep.errors, [], `${k}: ${JSON.stringify(rep.errors.slice(0, 3))}`);
      assert.ok(rep.created > 0, `${k} created rows`);
    }
    for (const k of KINDS) {
      assert.equal(await exportCsv(target.db, k), exported[k], `${k} differs after the round trip`);
    }
    // a second import of the same files changes nothing and creates nothing
    for (const k of KINDS) {
      const rep = await importCsv(target.db, k, exported[k]);
      assert.equal(rep.created, 0, `${k} created on re-import`);
      assert.equal(await exportCsv(target.db, k), exported[k], `${k} drifted on re-import`);
    }
    const a = createEngine(await loadDatasetFrom(source));
    const b = createEngine(await loadDatasetFrom(target.db));
    const ka = a.kpis(ALL), kb = b.kpis(ALL);
    for (const key of ["people", "asked", "required", "onTargetPct", "assessedPct", "short", "nobody", "spof", "pendingConfirmation"] as const) {
      assert.equal(kb[key], ka[key], `KPI ${key}`);
    }
    const short = (x: typeof a) => x.shortNeeds(ALL).map((c) => [x.teamLabel(c.managerId), x.skillLabel(c.skillId), c.count, c.headcount]);
    assert.deepEqual(short(b), short(a));
  } finally {
    await target.close();
  }
});

test("dry run reports and changes nothing; bad rows are skipped with their line numbers", async () => {
  const t = await emptyDb();
  try {
    const before = (await t.db.select({ n: count() }).from(schema.employee))[0].n;
    const csv = [
      "email,name,team_name,role,manager_email",
      "ann@acme.test,Ann,Ops,,",
      "not-an-email,Bob,,,",
      "cat@acme.test,Cat,,,nobody@acme.test",
      "dan@acme.test,Dan,,Wizard,",
      "eve@acme.test,Eve,,,ann@acme.test",
    ].join("\n");
    const dry = await importCsv(t.db, "people", csv, { dryRun: true });
    assert.equal(dry.dryRun, true);
    assert.deepEqual(dry.errors.map((e) => e.line), [3, 4]);
    assert.match(dry.errors[1].message, /Manager nobody@acme.test not found/);
    assert.match(dry.warnings[0].message, /role and team_role columns are not used any more/, "a file from before roles belonged to teams still loads its people");
    assert.equal((await t.db.select({ n: count() }).from(schema.employee))[0].n, before, "dry run wrote nothing");
    const real = await importCsv(t.db, "people", csv);
    assert.equal(real.created, 4);
    const people = await t.db.select().from(schema.employee);
    const eve = people.find((p) => p.email === "eve@acme.test")!;
    assert.equal(eve.managerId, people.find((p) => p.email === "ann@acme.test")!.id, "manager resolved in the second pass");
    assert.equal(people.find((p) => p.email === "ann@acme.test")!.teamName, "Ops");
    const needs = await importCsv(t.db, "team-needs", "manager_email,skill,min_level\nnobody@acme.test,AWS,3\n");
    assert.match(needs.errors[0].message, /Unknown manager/);
    const missing = await importCsv(t.db, "ratings", "email,level\nann@acme.test,3\n");
    assert.match(missing.errors[0].message, /Missing column/);
  } finally {
    await t.close();
  }
});

test("team roles by CSV: a role is named by its team, a person is put in the roles of their own manager only", async () => {
  const t = await emptyDb();
  try {
    await importCsv(t.db, "skills", "category,skill\nCloud,Kubernetes\nCloud,Terraform\n");
    await importCsv(t.db, "people", "email,name,manager_email\nann@acme.test,Ann,\noli@acme.test,Oli,\nbob@acme.test,Bob,ann@acme.test\nfay@acme.test,Fay,oli@acme.test\n");
    // the same role name in two teams: two roles
    const roles = await importCsv(t.db, "team-roles", "manager_email,role,description\nann@acme.test,SRE,Keeps production healthy\noli@acme.test,SRE,\nnobody@acme.test,SRE,\n");
    assert.equal(roles.created, 2);
    assert.match(roles.errors[0].message, /Unknown manager/);
    assert.equal((await t.db.select().from(schema.teamRole)).length, 2);
    const people = await importCsv(t.db, "role-people", "manager_email,role,email\nann@acme.test,SRE,bob@acme.test\nann@acme.test,On-call,bob@acme.test\nann@acme.test,SRE,fay@acme.test\n");
    assert.equal(people.created, 2, "Bob is in two roles of Ann's team; the second one is made on the way");
    assert.match(people.errors[0].message, /does not report to ann@acme.test/, "Fay reports to Oli");
    const skills = await importCsv(t.db, "role-skills", "manager_email,role,skill,level,must_have\nann@acme.test,SRE,Kubernetes,4,yes\nann@acme.test,On-call,Kubernetes,2,no\nann@acme.test,SRE,Terraform,9,yes\n");
    assert.equal(skills.created, 2);
    assert.match(skills.errors[0].message, /level must be 1-5/);
    const e = createEngine(await loadDatasetFrom(t.db));
    const bob = e.activeEmployees.find((x) => x.email === "bob@acme.test")!;
    const k8s = [...e.skillById.values()].find((k) => k.name === "Kubernetes")!;
    assert.deepEqual(e.targetFor(bob, k8s.id), { target: 4, mandatory: true, source: "role" }, "the higher of his two roles");
    assert.equal(e.activeEmployees.find((x) => x.email === "fay@acme.test")!.roleIds.length, 0);
  } finally {
    await t.close();
  }
});

test("near-identical skill names: typos, the same words, one inside the other; not mere overlap", () => {
  assert.match(skillSimilarity("Kubernets cluster upgrades", "Kubernetes Cluster Upgrades")!.reason, /same|almost/);
  assert.match(skillSimilarity("Release Management", "Release Management – Blue/Green")!.reason, /contains/);
  assert.ok(skillSimilarity("Network Capacity Planning", "Capacity planning, network"), "same words in another order");
  assert.equal(skillSimilarity("Unit Testing", "Grow unit testing habits in every squad through pairing"), null);
  assert.equal(skillSimilarity("Kubernetes", "Terraform"), null);
});

test("an upload with near-identical skills waits for a decision: keep both, merge, skip or replace", async () => {
  const t = await emptyDb();
  const skills = async () => t.db.select().from(schema.skill);
  try {
    await importCsv(t.db, "skills", [
      "category,skill,sub_skill,aliases,description,status",
      "Ops,Problem Management,,,,active",
      "Ops,Problem Management,Root Cause Analysis,RCA,,active",
      "Ops,Problem Management,Known Error Database,,,active",
      "Ops,Monitoring,,,,active",
      "Ops,Monitoring,Splunk Dashboards,,,active",
      "Ops,Monitoring,Grafana Dashboards,,,active",
    ].join("\n"));
    const before = await skills();
    const id = (name: string) => before.find((k) => k.name === name)!.id;
    const upload = [
      "category,skill,sub_skill,aliases,description,status",
      "Ops,Problem Management,Root-cause analysis,,From the upload,active", // line 2: merge
      "Ops,Problem Management,Known Error Data Base,,,active",            // line 3: replace
      "Ops,Monitoring,Splunk Dashboard,,,active",                         // line 4: skip
      "Ops,Monitoring,Grafana Dashboards for Executives,,,active",        // line 5: keep both
      "Ops,Monitoring,Prometheus Alerts,,,active",                         // line 6: nothing like it, plain new
    ].join("\n");

    const dry = await importCsv(t.db, "skills", upload, { dryRun: true });
    const keyOf = (line: number) => dry.matches.find((m) => m.lines.includes(line))!.key;
    assert.deepEqual(dry.matches.flatMap((m) => m.lines).sort(), [2, 3, 4, 5]);
    assert.equal(dry.matches.find((m) => m.lines.includes(2))!.candidates[0].id, id("Root Cause Analysis"));
    assert.equal(dry.undecided, 4);
    assert.equal(dry.created, 1, "only the skill like nothing else would be added");

    // without decisions the near-identical rows are refused, the rest goes in
    const blind = await importCsv(t.db, "skills", upload);
    assert.deepEqual(blind.errors.map((e) => e.line), [2, 3, 4, 5]);
    assert.equal((await skills()).length, before.length + 1);

    const real = await importCsv(t.db, "skills", upload, { decisions: [
      { key: keyOf(2), action: "merge", targetId: id("Root Cause Analysis") },
      { key: keyOf(3), action: "replace", targetId: id("Known Error Database") },
      { key: keyOf(4), action: "skip" },
      { key: keyOf(5), action: "separate" },
    ] });
    assert.deepEqual(real.errors, []);
    const after = await skills();
    const rca = after.find((k) => k.id === id("Root Cause Analysis"))!;
    assert.deepEqual(rca.aliases, ["RCA", "Root-cause analysis"], "merged: the new name is an alias, no new skill");
    assert.equal(rca.description, "From the upload", "an empty description is filled in");
    const kedb = after.find((k) => k.id === id("Known Error Database"))!;
    assert.equal(kedb.name, "Known Error Data Base", "replaced in place: same skill, so its ratings stay");
    assert.deepEqual(kedb.aliases, ["Known Error Database"]);
    assert.ok(!after.some((k) => k.name === "Splunk Dashboard"), "skipped");
    assert.ok(after.some((k) => k.name === "Grafana Dashboards for Executives"), "kept both");
    assert.equal(after.length, before.length + 2);

    // a decision for a skill it was not matched with is ignored, not applied
    const forged = await importCsv(t.db, "skills", "category,skill,sub_skill\nOps,Monitoring,Grafana Dashboard\n",
      { dryRun: true, decisions: [{ key: "sub:monitoring>grafana dashboard", action: "replace", targetId: id("Problem Management") }] });
    assert.equal(forged.undecided, 1);
  } finally {
    await t.close();
  }
});

// The site's own catalogue stays out of git (it names the teams that suggested each skill):
// the test runs where the file is, and is skipped elsewhere.
const SITE_CATALOGUE = path.join(import.meta.dirname, "..", "docs", "skills-catalogue.csv");
test("the site catalogue in docs/ imports cleanly into an empty database, and again without changes", { skip: !fs.existsSync(SITE_CATALOGUE) && "docs/skills-catalogue.csv is not here" }, async () => {
  const csv = fs.readFileSync(SITE_CATALOGUE, "utf8");
  const t = await emptyDb();
  try {
    const first = await importCsv(t.db, "skills", csv);
    assert.deepEqual(first.errors, []);
    assert.deepEqual(first.matches, [], "nothing in the file looks like anything else in it");
    const cats = await t.db.select().from(schema.skillCategory);
    const all = await t.db.select().from(schema.skill);
    assert.ok(cats.length > 0 && all.some((k) => k.parentId), "categories, skills and sub-skills");
    assert.ok(all.every((k) => k.name.length <= 120), "every name can still be edited on the page");
    const again = await importCsv(t.db, "skills", csv);
    assert.equal(again.created, 0);
    assert.deepEqual(again.matches, []);
  } finally {
    await t.close();
  }
});

test("the starter catalogue imports cleanly, again without changes, and holds nothing near-identical to itself", async () => {
  const { STARTER_SKILLS_CSV } = await import("../src/db/starter-skills.ts");
  const t = await emptyDb();
  try {
    const first = await importCsv(t.db, "skills", STARTER_SKILLS_CSV);
    assert.deepEqual(first.errors, []);
    assert.deepEqual(first.matches.map((m) => m.incoming), [], "no starter skill looks like another");
    assert.ok(first.created >= 90, `created ${first.created}`);
    const again = await importCsv(t.db, "skills", STARTER_SKILLS_CSV);
    assert.equal(again.created, 0);
    assert.equal(again.errors.length, 0);
  } finally {
    await t.close();
  }
});

test("a skills upload is an upsert: existing skills updated from the columns given, new ones added, nothing wiped or deleted", async () => {
  const t = await emptyDb();
  try {
    await importCsv(t.db, "skills", "category,skill,sub_skill,aliases,description,status\nCloud,Kubernetes,,K8s;kube,Containers at scale,active\nCloud,Legacy grid,,,Old,retired\nCloud,AWS,EC2,,Instances,active\n");
    // a short file: only category and skill (and a new description for one)
    const r = await importCsv(t.db, "skills", "category,skill,sub_skill,description\nCloud,Kubernetes,,Running workloads on Kubernetes\nCloud,Legacy grid,,Old\nCloud,AWS,EC2,Virtual machines\nCloud,Helm,,Charts\n");
    assert.deepEqual(r.errors, []);
    assert.equal(r.created, 1, "Helm is new");
    const all = await t.db.select().from(schema.skill);
    const by = (n: string) => all.find((k) => k.name === n)!;
    assert.deepEqual(by("Kubernetes").aliases, ["K8s", "kube"], "no aliases column: the aliases stay");
    assert.equal(by("Kubernetes").description, "Running workloads on Kubernetes", "a column given: updated");
    assert.equal(by("Legacy grid").status, "retired", "no status: a retired skill stays retired");
    assert.equal(by("EC2").description, "Virtual machines", "sub-skills are updated too");
    assert.equal(all.length, 5, "nothing deleted");
    const cleared = await importCsv(t.db, "skills", "category,skill,aliases\nCloud,Kubernetes,\n");
    assert.deepEqual(cleared.errors, []);
    assert.deepEqual((await t.db.select().from(schema.skill)).find((k) => k.name === "Kubernetes")!.aliases, [], "an aliases column given empty clears them");
  } finally {
    await t.close();
  }
});
