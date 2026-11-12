// The integration endpoints' answers: the JSON API (/api/v1), CSV for Excel and anything
// that reads a file from the web, and an OData v4 feed (/api/odata) for Power BI and
// Tableau, which both connect to OData natively with a user name and password.
import { getDb } from "@/db";
import { appUrl } from "@/lib/auth";
import { getEngine, loadDataset } from "@/lib/server";
import { authenticate, denied, type ApiClient } from "./keys";
import { DATASETS, datasetRows, type ColType, type DatasetDef, type Row } from "./datasets";
import * as O from "./odata";

export const MAX_PAGE = 10_000;
export const ODATA_PAGE = 5_000;

/** Authenticate, then hand the client to the handler; errors come back in the asked format. */
export async function withClient(req: Request, json: boolean, fn: (client: ApiClient) => Promise<Response>): Promise<Response> {
  try {
    const auth = await authenticate(await getDb(), req);
    if (!auth.ok) return denied(auth, json);
    return await fn(auth.client);
  } catch (err) {
    console.error("integration api:", (err as Error).message);
    return json ? Response.json({ error: "Something went wrong on the server." }, { status: 500 }) : new Response("Server error", { status: 500 });
  }
}

export const allowedSets = (client: ApiClient) => DATASETS.filter((d) => client.datasets.includes(d.key));

export async function rowsOf(def: DatasetDef): Promise<Row[]> {
  const [engine, ds] = await Promise.all([getEngine("validated"), loadDataset()]);
  return datasetRows(def, engine, ds);
}

export const base = () => appUrl();

const NO_STORE = { "cache-control": "no-store" };

// ---- CSV ------------------------------------------------------------------------------

/** CSV with a BOM for Excel. A text cell that starts like a formula gets a leading
 *  apostrophe, so a name such as "=HYPERLINK(...)" from a directory is never run. */
export function csvResponse(def: DatasetDef, rows: Row[]): Response {
  const esc = (v: unknown, type: ColType) => {
    let s = v == null ? "" : String(v);
    if (type === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [def.columns.map((c) => c.name).join(","), ...rows.map((r) => def.columns.map((c) => esc(r[c.name], c.type)).join(","))];
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: { ...NO_STORE, "content-type": "text/csv; charset=utf-8", "content-disposition": `inline; filename="${def.key}-${stamp}.csv"` },
  });
}

// ---- OData v4 (built in ./odata.ts, which a test can load) ---------------------------------

export const odataService = (sets: DatasetDef[]) => O.odataService(sets, base());
export const odataMetadata = (sets: DatasetDef[]) => O.odataMetadata(sets);
export const odataSet = (def: DatasetDef, rows: Row[], url: URL) => O.odataSet(def, rows, url, base(), ODATA_PAGE);
