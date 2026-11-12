// Encrypts settings secrets (the directory password) at rest in the database.
// AES-256-GCM with a key derived from the app's session-signing secret, which lives
// in a file outside the database (BETTER_AUTH_SECRET_FILE). A database dump alone
// therefore does not reveal the password.
import crypto from "node:crypto";
import { authSecret } from "./auth.ts";

const PREFIX = "enc:v1:";

function key(): Buffer {
  return crypto.createHash("sha256").update(`settings-secret:${authSecret()}`).digest();
}

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

export function open(sealed: string): string {
  if (!sealed.startsWith(PREFIX)) throw new Error("not an encrypted value");
  const raw = Buffer.from(sealed.slice(PREFIX.length), "base64url");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}
