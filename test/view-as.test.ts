// "View as": the cookie that says which administrator is viewing as whom cannot be forged,
// edited or kept past its hour.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.BETTER_AUTH_SECRET = "test-secret-for-view-as";
const { viewAsCookie, readViewAsCookie, VIEW_AS_MINUTES } = await import("../src/lib/view-as-cookie.ts");

test("a genuine cookie reads back: who is viewing, as whom, until when", () => {
  const now = Date.UTC(2026, 10, 12, 9, 0);
  const { value, expires } = viewAsCookie("admin-1", "emp-7", now);
  assert.equal(expires.getTime(), now + VIEW_AS_MINUTES * 60_000);
  assert.deepEqual(readViewAsCookie(value, now + 1000), { a: "admin-1", e: "emp-7", x: expires.getTime() });
});

test("an edited, re-signed or truncated cookie is refused", () => {
  const { value } = viewAsCookie("admin-1", "emp-7");
  const [body, sig] = value.split(".");
  const other = Buffer.from(JSON.stringify({ a: "admin-1", e: "emp-ceo", x: Date.now() + 3600e3 })).toString("base64url");
  assert.equal(readViewAsCookie(`${other}.${sig}`), null, "someone else's id under the old signature");
  const forged = crypto.createHmac("sha256", "view-as:guessed-secret").update(other).digest("base64url");
  assert.equal(readViewAsCookie(`${other}.${forged}`), null, "signed with the wrong key");
  assert.equal(readViewAsCookie(body), null, "no signature");
  assert.equal(readViewAsCookie(`${body}.${sig}.x`), null, "extra parts");
  assert.equal(readViewAsCookie(`${body}.${sig.slice(0, -2)}`), null, "cut signature");
  assert.equal(readViewAsCookie(""), null);
  assert.equal(readViewAsCookie(undefined), null);
});

test("after its hour the cookie counts for nothing", () => {
  const now = Date.now();
  const { value } = viewAsCookie("admin-1", "emp-7", now);
  assert.ok(readViewAsCookie(value, now + (VIEW_AS_MINUTES - 1) * 60_000));
  assert.equal(readViewAsCookie(value, now + VIEW_AS_MINUTES * 60_000), null);
});
