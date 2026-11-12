// Integration keys and datasets: a key is stored only as a hash, works from any of the three
// headers, stops at revocation or expiry; every dataset row has exactly its declared columns.
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://";
process.env.SEED_DEMO = "true";
process.env.BETTER_AUTH_SECRET = "test-secret-for-integrations";
delete process.env.DATABASE_URL;

const { getDb, closeDb, schema } = await import("../src/db/index.ts");
const K = await import("../src/lib/integrations/keys.ts");
const { DATASETS, datasetRows } = await import("../src/lib/integrations/datasets.ts");
const { loadDatasetFrom } = await import("../src/lib/dataset.ts");
const { createEngine } = await import("../src/lib/engine/engine.ts");

test.after(() => closeDb());

const req = (headers: Record<string, string>) => new Request("http://x/api/v1", { headers });

test("a key works as Bearer, X-API-Key or Basic password, and only its hash is stored", async () => {
  const db = await getDb();
  const k = K.newKey();
  assert.match(k.key, /^skm_[A-Za-z0-9_-]{40}$/);
  assert.notEqual(k.hash, k.key);
  const [row] = await db.insert(schema.apiClient).values({ name: "t", tool: "powerbi", tokenHash: k.hash, tokenHint: k.hint, datasets: ["people"] }).returning();
  assert.ok(!JSON.stringify(row).includes(k.key), "the key itself is never stored");
  const tries: Record<string, string>[] = [{ authorization: `Bearer ${k.key}` }, { "x-api-key": k.key }, { authorization: `Basic ${Buffer.from(`key:${k.key}`).toString("base64")}` }];
  for (const h of tries) {
    const r = await K.authenticate(db, req(h));
    assert.ok(r.ok, JSON.stringify(h));
  }
  const [after] = await db.select().from(schema.apiClient).where(eq(schema.apiClient.id, row.id));
  assert.equal(after.useCount, 3);
  assert.ok(after.lastUsedAt);
});

test("no key, a wrong key, a revoked or an expired key is refused with 401", async () => {
  const db = await getDb();
  assert.equal((await K.authenticate(db, req({}))).ok, false);
  assert.equal((await K.authenticate(db, req({ authorization: "Bearer skm_nope" }))).ok, false);
  const revoked = K.newKey();
  await db.insert(schema.apiClient).values({ name: "r", tool: "csv", tokenHash: revoked.hash, tokenHint: revoked.hint, datasets: ["people"], revokedAt: new Date() });
  const expired = K.newKey();
  await db.insert(schema.apiClient).values({ name: "e", tool: "csv", tokenHash: expired.hash, tokenHint: expired.hint, datasets: ["people"], expiresAt: new Date(Date.now() - 1000) });
  for (const k of [revoked, expired]) {
    const r = await K.authenticate(db, req({ "x-api-key": k.key }));
    assert.ok(!r.ok && r.status === 401);
    assert.equal(K.denied(r as never).headers.get("www-authenticate")?.startsWith("Basic"), true, "tools are asked for credentials");
  }
});

test("every dataset row has exactly its declared columns, with values of the declared type", async () => {
  const db = await getDb();
  const ds = await loadDatasetFrom(db);
  const engine = createEngine(ds);
  for (const def of DATASETS) {
    assert.match(def.entity, /^[A-Za-z]+$/);
    const rows = datasetRows(def, engine, ds);
    assert.ok(rows.length > 0, `${def.key} has rows on the demo`);
    const names = def.columns.map((c) => c.name);
    for (const r of rows.slice(0, 500)) {
      assert.deepEqual(Object.keys(r).sort(), [...names].sort(), def.key);
      for (const c of def.columns) {
        const v = r[c.name];
        if (v == null) continue;
        const ok = c.type === "string" || c.type === "datetime" ? typeof v === "string" : c.type === "bool" ? typeof v === "boolean" : typeof v === "number" && (c.type === "decimal" || Number.isInteger(v));
        assert.ok(ok, `${def.key}.${c.name} = ${JSON.stringify(v)} is not ${c.type}`);
      }
    }
    assert.equal(datasetRows(def, engine, ds), rows, "built once per engine");
  }
});

test("OData: a big set comes in pages joined by @odata.nextLink, honouring $top, $skip and $select", async () => {
  const O = await import("../src/lib/integrations/odata.ts");
  const def = DATASETS.find((d) => d.key === "skills")!;
  const rows = Array.from({ length: 23 }, (_, i) => ({ id: `s${i}`, name: `Skill ${i}`, full_name: `Skill ${i}`, category: "C", parent_id: null, status: "active" }));
  const read = async (u: string) => (await O.odataSet(def, rows, new URL(u), "http://h", 10).json()) as { value: Record<string, unknown>[]; "@odata.nextLink"?: string; "@odata.count"?: number };

  // follow the links: every row once, in order
  const seen: unknown[] = [];
  let next: string | undefined = "http://h/api/odata/Skills?$count=true";
  let pages = 0;
  while (next) {
    const p = await read(next);
    if (pages === 0) assert.equal(p["@odata.count"], 23);
    seen.push(...p.value.map((r) => r.id));
    next = p["@odata.nextLink"];
    pages += 1;
  }
  assert.equal(pages, 3);
  assert.deepEqual(seen, rows.map((r) => r.id));

  // $top across a page boundary, and $select
  const a = await read("http://h/api/odata/Skills?$skip=5&$top=12&$select=name");
  assert.equal(a.value.length, 10);
  assert.deepEqual(Object.keys(a.value[0]), ["name"]);
  const b = await read(a["@odata.nextLink"]!);
  assert.equal(b.value.length, 2, "only what $top asked for");
  assert.equal(b["@odata.nextLink"], undefined);
  assert.equal(b.value[1].name, "Skill 16");

  const meta = await O.odataMetadata(DATASETS).text();
  for (const d of DATASETS) assert.ok(meta.includes(`<EntitySet Name="${d.entity}"`));
  assert.ok(!/[<>&]"/.test(meta.replace(/<[^>]+>/g, "")), "descriptions are escaped");
});
