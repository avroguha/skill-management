// Signed cookies: "view as" (an administrator seeing the app as one person) and "demo"
// (this browser looks at the demo database, as one of the demo people). Signed with a key
// derived from the app secret, so they cannot be forged or edited; checked again on every
// request against the signed-in account (src/lib/server.ts).
import crypto from "node:crypto";
import { authSecret } from "./auth.ts";

export const VIEW_AS_COOKIE = "skm_view_as";
export const VIEW_AS_MINUTES = 60;
export const DEMO_COOKIE = "skm_demo";
export const DEMO_HOURS = 12;

const mac = (purpose: string, body: string) => crypto.createHmac("sha256", `${purpose}:${authSecret()}`).update(body).digest("base64url");

function sign(purpose: string, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(purpose, body)}`;
}

function read(purpose: string, value: string | undefined, now: number): Record<string, unknown> | null {
  if (!value) return null;
  const [body, sig, extra] = value.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = Buffer.from(mac(purpose, body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    return typeof v.x === "number" && v.x > now ? v : null;
  } catch { return null; }
}

export function viewAsCookie(adminUserId: string, employeeId: string, now = Date.now()): { value: string; expires: Date } {
  const expires = new Date(now + VIEW_AS_MINUTES * 60_000);
  return { value: sign("view-as", { a: adminUserId, e: employeeId, x: expires.getTime() }), expires };
}

/** The cookie's content if it is genuine and not expired, else null. */
export function readViewAsCookie(value: string | undefined, now = Date.now()): { a: string; e: string; x: number } | null {
  const v = read("view-as", value, now);
  return v && typeof v.a === "string" && typeof v.e === "string" ? { a: v.a, e: v.e, x: v.x as number } : null;
}

/** Demo mode for this browser: the signed-in account (u) sees the demo as persona p. */
export function demoCookie(userId: string, persona: string, now = Date.now()): { value: string; expires: Date } {
  const expires = new Date(now + DEMO_HOURS * 3600_000);
  return { value: sign("demo", { u: userId, p: persona, x: expires.getTime() }), expires };
}

export function readDemoCookie(value: string | undefined, now = Date.now()): { u: string; p: string; x: number } | null {
  const v = read("demo", value, now);
  return v && typeof v.u === "string" && typeof v.p === "string" ? { u: v.u, p: v.p, x: v.x as number } : null;
}
