// CSV import/export: everything exported from one database imports into an empty one
// and exports again identically; the numbers the app shows come out the same.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { count } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

process.env.PGLITE_DIR = "memory://";
process.env.SEED_DEMO = "true";
delete process.env.DATABASE_URL;

const { getDb, closeDb, schema } = await import("../src/db/index.ts");
const { exportCsv, importCsv, KINDS } = await import("../src/lib/transfer.ts");
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
    assert.deepEqual(b.hiringPlan(b.roots[0].id).map((h) => [b.skillLabel(h.skillId), h.count]),
      a.hiringPlan(a.roots[0].id).map((h) => [a.skillLabel(h.skillId), h.count]));
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
