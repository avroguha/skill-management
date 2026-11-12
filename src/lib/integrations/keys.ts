// Integration keys: made by an administrator (Admin › Integrations), shown once, stored
// only as a SHA-256 hash. A request carries one as `Authorization: Bearer <key>`,
// `X-API-Key: <key>`, or as the password of Basic authentication (any user name), which is
// how Power BI, Tableau and Excel ask for it. Never in a URL: URLs end up in logs.
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../db/schema.ts";
import type { DB } from "../../db/index.ts";
export type ApiClient = typeof schema.apiClient.$inferSelect;

export const TOOLS = ["powerbi", "tableau", "csv", "other"] as const;
export type Tool = (typeof TOOLS)[number];
export const TOOL_LABEL: Record<Tool, string> = { powerbi: "Power BI", tableau: "Tableau", csv: "Excel / CSV", other: "Other (JSON API)" };

const PREFIX = "skm_";

export function newKey(): { key: string; hash: string; hint: string } {
  const key = PREFIX + crypto.randomBytes(30).toString("base64url");
  return { key, hash: hashKey(key), hint: `…${key.slice(-4)}` };
}

export const hashKey = (key: string) => crypto.createHash("sha256").update(key, "utf8").digest("hex");

/** The key a request presents, from whichever header carries it. */
export function presentedKey(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const [scheme, value] = [h.slice(0, h.indexOf(" ")).toLowerCase(), h.slice(h.indexOf(" ") + 1).trim()];
  if (scheme === "bearer" && value) return value;
  if (scheme === "basic" && value) {
    try {
      const text = Buffer.from(value, "base64").toString("utf8");
      const i = text.indexOf(":");
      const pass = i >= 0 ? text.slice(i + 1) : "";
      return pass || (text.startsWith(PREFIX) ? text.replace(/:$/, "") : null); // a key typed as the user name works too
    } catch { return null; }
  }
  const x = req.headers.get("x-api-key");
  return x ? x.trim() : null;
}

// per worker: a client may make this many requests a minute (a report refresh pages through
// a few datasets; a loop gone wrong should not take the portal with it)
const PER_MINUTE = 240;
const window = new Map<string, { at: number; n: number }>();
function allowed(id: string): boolean {
  const now = Date.now();
  const w = window.get(id);
  if (!w || now - w.at > 60_000) { window.set(id, { at: now, n: 1 }); return true; }
  w.n += 1;
  return w.n <= PER_MINUTE;
}

export type AuthResult = { ok: true; client: ApiClient } | { ok: false; status: 401 | 403 | 429; error: string };

/** Who is calling: a live key, not revoked, not expired, under its rate limit. Records the use. */
export async function authenticate(db: DB, req: Request): Promise<AuthResult> {
  const key = presentedKey(req);
  if (!key || !key.startsWith(PREFIX)) return { ok: false, status: 401, error: "An integration key is needed (Authorization: Bearer <key>, X-API-Key, or as the Basic-auth password)." };
  const [client] = await db.select().from(schema.apiClient).where(eq(schema.apiClient.tokenHash, hashKey(key)));
  if (!client) return { ok: false, status: 401, error: "This key is not known." };
  if (client.revokedAt) return { ok: false, status: 401, error: "This key was revoked." };
  if (client.expiresAt && client.expiresAt.getTime() < Date.now()) return { ok: false, status: 401, error: "This key has expired." };
  if (!allowed(client.id)) return { ok: false, status: 429, error: `More than ${PER_MINUTE} requests a minute. Slow down and try again.` };
  await db.update(schema.apiClient).set({ lastUsedAt: new Date(), useCount: sql`${schema.apiClient.useCount} + 1` }).where(eq(schema.apiClient.id, client.id));
  return { ok: true, client };
}

export function denied(r: Extract<AuthResult, { ok: false }>, json = true): Response {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (r.status === 401) headers["www-authenticate"] = 'Basic realm="Skill Management integrations", charset="UTF-8"';
  if (r.status === 429) headers["retry-after"] = "60";
  return json
    ? Response.json({ error: r.error }, { status: r.status, headers })
    : new Response(r.error, { status: r.status, headers });
}
