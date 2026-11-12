// OData v4 for Power BI and Tableau: the service document, $metadata (EDMX built from the
// datasets' typed columns) and one page of an entity set. Pure: no database, no framework.
import type { ColType, DatasetDef, Row } from "./datasets.ts";


const EDM: Record<ColType, string> = { string: "Edm.String", int: "Edm.Int32", decimal: "Edm.Double", bool: "Edm.Boolean", datetime: "Edm.DateTimeOffset" };
const ODATA = { "cache-control": "no-store", "odata-version": "4.0" };
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function odataService(sets: DatasetDef[], base: string): Response {
  return Response.json({
    "@odata.context": `${base}/api/odata/$metadata`,
    value: sets.map((d) => ({ name: d.entity, kind: "EntitySet", url: d.entity, title: d.title })),
  }, { headers: { ...ODATA, "content-type": "application/json;odata.metadata=minimal" } });
}

export function odataMetadata(sets: DatasetDef[]): Response {
  const types = sets.map((d) => [
    `<EntityType Name="${d.entity}Row"><Key><PropertyRef Name="row_id"/></Key>`,
    `<Property Name="row_id" Type="Edm.Int64" Nullable="false"/>`,
    ...d.columns.map((c) => `<Property Name="${c.name}" Type="${EDM[c.type]}"><Annotation Term="Core.Description" String="${xml(c.description)}"/></Property>`),
    `</EntityType>`,
  ].join("")).join("");
  const setsXml = sets.map((d) => `<EntitySet Name="${d.entity}" EntityType="SkillManagement.${d.entity}Row"><Annotation Term="Core.Description" String="${xml(d.description)}"/></EntitySet>`).join("");
  const body = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
<edmx:Reference Uri="https://oasis-tcs.github.io/odata-vocabularies/vocabularies/Org.OData.Core.V1.xml"><edmx:Include Namespace="Org.OData.Core.V1" Alias="Core"/></edmx:Reference>
<edmx:DataServices><Schema Namespace="SkillManagement" xmlns="http://docs.oasis-open.org/odata/ns/edm">${types}<EntityContainer Name="Container">${setsXml}</EntityContainer></Schema></edmx:DataServices>
</edmx:Edmx>`;
  return new Response(body, { headers: { ...ODATA, "content-type": "application/xml" } });
}

const intParam = (v: string | null, def: number) => { const n = Number(v); return v != null && Number.isInteger(n) && n >= 0 ? n : def; };

/** One page of an entity set: $top, $skip, $select and $count; the rest via @odata.nextLink. */
export function odataSet(def: DatasetDef, rows: Row[], url: URL, base: string, pageSize: number): Response {
  const skip = intParam(url.searchParams.get("$skip"), 0);
  const top = url.searchParams.has("$top") ? intParam(url.searchParams.get("$top"), rows.length) : rows.length;
  const end = Math.min(rows.length, skip + top);
  const pageEnd = Math.min(end, skip + pageSize);
  const select = url.searchParams.get("$select")?.split(",").map((s) => s.trim()).filter((s) => s === "row_id" || def.columns.some((c) => c.name === s));
  const cols = select?.length ? select : ["row_id", ...def.columns.map((c) => c.name)];
  const value = rows.slice(skip, pageEnd).map((r, i) => Object.fromEntries(cols.map((c) => [c, c === "row_id" ? skip + i + 1 : r[c] ?? null])));
  const out: Record<string, unknown> = { "@odata.context": `${base}/api/odata/$metadata#${def.entity}${select?.length ? `(${select.join(",")})` : ""}` };
  if (url.searchParams.get("$count") === "true") out["@odata.count"] = rows.length;
  out.value = value;
  if (pageEnd < end) {
    const next = new URL(`${base}/api/odata/${def.entity}`);
    for (const [k, v] of url.searchParams) if (k !== "$skip" && k !== "$top") next.searchParams.set(k, v);
    next.searchParams.set("$skip", String(pageEnd));
    if (url.searchParams.has("$top")) next.searchParams.set("$top", String(end - pageEnd));
    out["@odata.nextLink"] = next.toString();
  }
  return Response.json(out, { headers: { ...ODATA, "content-type": "application/json;odata.metadata=minimal" } });
}
