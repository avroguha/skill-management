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
process.env.SEED_DEMO = "true";
delete process.env.DATABASE_URL;

const { getDb, closeDb, schema } = await import("../src/db/index.ts");
const { exportCsv, importCsv, KINDS, skillSimilarity } = await import("../src/lib/transfer.ts");
const { parseCsv, parseCsvObjects, toCsv } = await import("../src/lib/csv.ts");
const { loadDatasetFrom } = await import("../src/lib/dataset.ts");
const { createEngine } = await import("../src/lib/engine/engine.ts");
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
  const source = await getDb();
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
    const ka = a.kpis(a.roots[0].id), kb = b.kpis(b.roots[0].id);
    for (const key of ["people", "required", "onTargetPct", "assessedPct", "criticalGaps", "spof", "pendingValidation"] as const) {
      assert.equal(kb[key], ka[key], `KPI ${key}`);
    }
    const short = (x: typeof a) => x.shortNeeds(x.roots[0].id).map((c) => [x.unitById.get(c.unitId)?.name, x.skillLabel(c.skillId), c.count, c.headcount]);
    assert.deepEqual(short(b), short(a));
  } finally {
    await target.close();
  }
});

test("dry run reports and changes nothing; bad rows are skipped with their line numbers", async () => {
  const t = await emptyDb();
  try {
    await importCsv(t.db, "units", "path,kind\nAcme,company\nAcme > Ops,team\n");
    const before = (await t.db.select({ n: count() }).from(schema.employee))[0].n;
    const csv = [
      "email,name,unit,role,manager_email",
      "ann@acme.test,Ann,Acme > Ops,,",
      "not-an-email,Bob,Acme > Ops,,",
      "cat@acme.test,Cat,Acme > Nowhere,,",
      "dan@acme.test,Dan,Acme > Ops,Wizard,",
      "eve@acme.test,Eve,Acme > Ops,,ann@acme.test",
    ].join("\n");
    const dry = await importCsv(t.db, "people", csv, { dryRun: true });
    assert.equal(dry.dryRun, true);
    assert.deepEqual(dry.errors.map((e) => e.line), [3, 4, 5]);
    assert.match(dry.errors[1].message, /Unknown unit/);
    assert.match(dry.errors[2].message, /Unknown role/);
    assert.equal((await t.db.select({ n: count() }).from(schema.employee))[0].n, before, "dry run wrote nothing");
    const real = await importCsv(t.db, "people", csv);
    assert.equal(real.created, 2);
    const people = await t.db.select().from(schema.employee);
    const eve = people.find((p) => p.email === "eve@acme.test")!;
    assert.equal(eve.managerId, people.find((p) => p.email === "ann@acme.test")!.id, "manager resolved in the second pass");
    const missing = await importCsv(t.db, "ratings", "email,level\nann@acme.test,3\n");
    assert.match(missing.errors[0].message, /Missing column/);
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
