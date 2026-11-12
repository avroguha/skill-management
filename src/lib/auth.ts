// Authentication: better-auth with
//   - local accounts (username + password), seeded with admin / admin
//   - SAML 2.0 single sign-on (@better-auth/sso), providers configured in Admin > Single sign-on
// Both land in the same user table, so switching to SSO later changes nothing else.
// Self-registration is off: local accounts are created by an administrator.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, username } from "better-auth/plugins";
import { sso } from "@better-auth/sso";
import { nextCookies } from "better-auth/next-js";
import { getDb, schema, type DB } from "../db/index.ts";
import { normaliseAttributes, recordAttempt, matchValue, rememberPending, gateSnapshot, lookupPerson, refreshGate } from "./sso-gate.ts";

/** Every password set through the app must be at least this long. */
export const MIN_PASSWORD_LENGTH = 10;

export function authSecret(): string {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const file = process.env.BETTER_AUTH_SECRET_FILE;
  if (file) return fs.readFileSync(file, "utf8").trim();
  // Development: a random secret kept beside the embedded database.
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
  const local = path.join(dir, "auth-secret");
  if (!fs.existsSync(local)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BETTER_AUTH_SECRET_FILE is not set - the session-signing secret must come from a file in production");
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(local, crypto.randomBytes(32).toString("base64url"), { mode: 0o600 });
  }
  return fs.readFileSync(local, "utf8").trim();
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** The SSO gate (src/lib/sso-gate.ts): test capture until activated, then only active people. */
// No database access in here: it runs inside the auth transaction (see sso-gate.ts).
async function gate(input: Parameters<NonNullable<Parameters<typeof sso>[0]>["resolveUser"] & {}>[0]) {
  const snap = gateSnapshot();
  if (!snap) return { action: "reject" as const, code: "SSO_NOT_READY", message: "The server is still starting. Try again in a moment." };
  const settings = snap.settings;
  const attributes = normaliseAttributes(input.protocol === "saml" ? input.providerAttributes : input.providerClaims);
  const base = {
    at: new Date().toISOString(), providerId: input.providerId, nameId: input.accountKey.accountId,
    email: input.providerUser.email ?? "", name: input.providerUser.name ?? "", attributes,
  };
  if (!settings.active) {
    recordAttempt({ ...base, outcome: "test", reason: "Single sign-on is not active yet: captured for the test, nobody signed in." });
    return { action: "reject" as const, code: "SSO_TEST", message: "Test sign-in captured. You can close this window." };
  }
  const value = matchValue(settings, base.nameId, attributes);
  const person = lookupPerson(settings.matchField, value);
  if (!person) {
    recordAttempt({ ...base, outcome: "refused", reason: `No active person has ${settings.matchField} "${value || "(empty)"}".` });
    return { action: "reject" as const, code: "NOT_ALLOWED", message: "Your account is not one of the people this app is for." };
  }
  recordAttempt({ ...base, outcome: "allowed", reason: `Matched ${settings.matchField} "${value}".`, matchedPerson: person.name });
  if (person.userId) return { action: "link" as const, userId: person.userId, profile: "preserve" as const };
  if (base.email) rememberPending(base.email, person.id);
  return { action: "continue" as const };
}

function makeAuth(db: DB) {
  return betterAuth({
    appName: "Skill Management",
    baseURL: appUrl(),
    secret: authSecret(),
    trustedOrigins: (process.env.TRUSTED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean),
    // transactions on: the SSO gate (resolveUser) runs only on an adapter with real transactions
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD_LENGTH, disableSignUp: true },
    user: {
      additionalFields: {
        mustChangePassword: { type: "boolean", defaultValue: false, input: false },
      },
    },
    // the session is read from a signed cookie for up to a minute instead of the database on
    // every request (scale); disabling someone or changing access applies within a minute
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60, cookieCache: { enabled: true, maxAge: 60 } },
    advanced: { useSecureCookies: appUrl().startsWith("https://") },
    plugins: [
      username(),
      admin({ defaultRole: "employee", adminRoles: ["admin"] }),
      sso({ resolveUser: (input) => gate(input) }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof makeAuth>;

const g = globalThis as unknown as { __skillsAuth?: Promise<Auth> };

/** The auth instance, created once the database is ready. */
export function getAuth(): Promise<Auth> {
  // the SSO gate needs its snapshot before the first sign-in
  g.__skillsAuth ??= getDb().then(async (db) => { await refreshGate(db); return makeAuth(db); });
  return g.__skillsAuth;
}
