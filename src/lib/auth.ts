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
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "../db/index.ts";

/** Every password set through the app must be at least this long. */
export const MIN_PASSWORD_LENGTH = 10;

function authSecret(): string {
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

/** Links a signed-in user to the employee record with the same e-mail address. */
export async function linkEmployee(db: DB, user: { id: string; email: string; role?: string | null }) {
  await db.update(schema.employee)
    .set({ userId: user.id })
    .where(and(sql`lower(${schema.employee.email}) = lower(${user.email})`, isNull(schema.employee.userId)));
  if (!user.role) await db.update(schema.user).set({ role: "employee" }).where(eq(schema.user.id, user.id));
}

function makeAuth(db: DB) {
  return betterAuth({
    appName: "Skill Management",
    baseURL: appUrl(),
    secret: authSecret(),
    trustedOrigins: (process.env.TRUSTED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean),
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD_LENGTH, disableSignUp: true },
    user: {
      additionalFields: {
        mustChangePassword: { type: "boolean", defaultValue: false, input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    advanced: { useSecureCookies: appUrl().startsWith("https://") },
    plugins: [
      username(),
      admin({ defaultRole: "employee", adminRoles: ["admin"] }),
      sso({
        provisionUser: async ({ user }) => linkEmployee(db, user),
        provisionUserOnEveryLogin: true,
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof makeAuth>;

const g = globalThis as unknown as { __skillsAuth?: Promise<Auth> };

/** The auth instance, created once the database is ready. */
export function getAuth(): Promise<Auth> {
  g.__skillsAuth ??= getDb().then(makeAuth);
  return g.__skillsAuth;
}
