// The "view as" cookie: which administrator is viewing as which person, until when. Signed
// with a key derived from the app secret, so it cannot be forged or edited; checked again
// on every request against the signed-in administrator (src/lib/server.ts).
import crypto from "node:crypto";
import { authSecret } from "./auth.ts";

export const VIEW_AS_COOKIE = "skm_view_as";
export const VIEW_AS_MINUTES = 60;

const mac = (body: string) => crypto.createHmac("sha256", `view-as:${authSecret()}`).update(body).digest("base64url");

export function viewAsCookie(adminUserId: string, employeeId: string, now = Date.now()): { value: string; expires: Date } {
  const expires = new Date(now + VIEW_AS_MINUTES * 60_000);
  const body = Buffer.from(JSON.stringify({ a: adminUserId, e: employeeId, x: expires.getTime() })).toString("base64url");
  return { value: `${body}.${mac(body)}`, expires };
}

/** The cookie's content if it is genuine and not expired, else null. */
export function readViewAsCookie(value: string | undefined, now = Date.now()): { a: string; e: string; x: number } | null {
  if (!value) return null;
  const [body, sig, extra] = value.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { a?: unknown; e?: unknown; x?: unknown };
    if (typeof v.a !== "string" || typeof v.e !== "string" || typeof v.x !== "number" || v.x <= now) return null;
    return { a: v.a, e: v.e, x: v.x };
  } catch { return null; }
}
