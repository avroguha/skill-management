// Single sign-on gate: who may sign in, and the test capture.
//
//  - Until an administrator activates SSO, every SSO sign-in is a TEST: the assertion's
//    attributes are captured for Admin › Single sign-on, and the sign-in is refused (no
//    user is created). The admin uses that to see what the identity provider sends.
//  - Once active, an attribute of the assertion (or the NameID) is matched against a
//    field of the people table (e-mail or login name). Only an ACTIVE person found that
//    way may sign in - service accounts and anyone outside the synced tree are refused.
//  - The new account is linked to that person right after sign-in (linkSignedInUser),
//    outside the auth transaction: linking inside it from another connection would wait
//    on the uncommitted user row.
//  - The gate itself reads NO database: it runs inside the auth transaction, where a
//    read from another connection can wait on that transaction (it deadlocks on the
//    embedded database). It works from an in-memory snapshot of the settings and the
//    active people, refreshed at start, every minute, and after anything that changes
//    who may sign in (refreshGate).
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";

export interface SsoSettings {
  active: boolean;
  /** "nameID" or an attribute name from the assertion */
  matchAttribute: string;
  /** the people-table field it must equal */
  matchField: "email" | "user_name";
}

export const DEFAULT_SSO: SsoSettings = { active: false, matchAttribute: "nameID", matchField: "email" };

export async function readSsoSettings(db: DB): Promise<SsoSettings> {
  const [row] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, "sso"));
  return { ...DEFAULT_SSO, ...((row?.value ?? {}) as Partial<SsoSettings>) };
}

export async function writeSsoSettings(db: DB, v: SsoSettings): Promise<void> {
  await db.insert(s.appSetting).values({ key: "sso", value: v })
    .onConflictDoUpdate({ target: s.appSetting.key, set: { value: v } });
  await refreshGate(db);
}

export interface GatePerson { id: string; name: string; title: string; userId: string | null }
interface GateSnapshot { settings: SsoSettings; byEmail: Map<string, GatePerson>; byUserName: Map<string, GatePerson>; at: number }
const gs = globalThis as unknown as { __skillsGate?: GateSnapshot };

/** Reloads the gate's snapshot. Call after anything that changes who may sign in. */
export async function refreshGate(db: DB): Promise<void> {
  const settings = await readSsoSettings(db);
  const people = await db.select({
    id: s.employee.id, name: s.employee.name, title: s.employee.title, userId: s.employee.userId,
    email: s.employee.email, userName: s.employee.userName,
  }).from(s.employee).where(eq(s.employee.active, true));
  const byEmail = new Map<string, GatePerson>();
  const byUserName = new Map<string, GatePerson>();
  for (const p of people) {
    const g: GatePerson = { id: p.id, name: p.name, title: p.title, userId: p.userId };
    byEmail.set(p.email.toLowerCase(), g);
    if (p.userName) byUserName.set(p.userName.toLowerCase(), g);
  }
  gs.__skillsGate = { settings, byEmail, byUserName, at: Date.now() };
}

export function gateSnapshot(): GateSnapshot | undefined {
  return gs.__skillsGate;
}

/** The active person a sign-in identifies, from the snapshot (no database). */
export function lookupPerson(field: SsoSettings["matchField"], value: string): GatePerson | undefined {
  const snap = gs.__skillsGate;
  if (!snap || !value) return undefined;
  return (field === "email" ? snap.byEmail : snap.byUserName).get(value.toLowerCase());
}

export interface SsoAttempt {
  at: string;
  providerId: string;
  nameId: string;
  email: string;
  name: string;
  attributes: Record<string, string[]>;
  outcome: "test" | "allowed" | "refused";
  reason: string;
  matchedPerson?: string;
}

// The last attempts, in memory: enough for the test pop-up, never persisted (they hold
// identity data an administrator only needs for a few minutes).
const g = globalThis as unknown as { __skillsSsoAttempts?: SsoAttempt[]; __skillsSsoPending?: Map<string, { employeeId: string; at: number }> };
const attempts = (g.__skillsSsoAttempts ??= []);
const pending = (g.__skillsSsoPending ??= new Map());

export function recordAttempt(a: SsoAttempt) {
  attempts.unshift(a);
  attempts.length = Math.min(attempts.length, 20);
}

export function recentAttempts(): SsoAttempt[] {
  return attempts.slice();
}

export function normaliseAttributes(raw: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    out[k] = Array.isArray(v) ? v.map(String) : [String(v)];
  }
  return out;
}

export function matchValue(settings: SsoSettings, nameId: string, attributes: Record<string, string[]>): string {
  return (settings.matchAttribute === "nameID" ? nameId : attributes[settings.matchAttribute]?.[0] ?? "").trim();
}

/** The active person a sign-in identifies, if any. */
export async function findPerson(db: DB, field: SsoSettings["matchField"], value: string) {
  if (!value) return undefined;
  const col = field === "email" ? s.employee.email : s.employee.userName;
  const [p] = await db.select().from(s.employee)
    .where(and(eq(s.employee.active, true), sql`lower(${col}) = lower(${value})`));
  return p;
}

/** Remembered between the gate (inside the auth transaction) and the first request after it. */
export function rememberPending(email: string, employeeId: string) {
  pending.set(email.toLowerCase(), { employeeId, at: Date.now() });
  for (const [k, v] of pending) if (Date.now() - v.at > 30 * 60e3) pending.delete(k);
}

/** Links a signed-in account to its person: the one the gate matched, else the same e-mail. */
export async function linkSignedInUser(db: DB, user: { id: string; email: string; role?: string | null }): Promise<string | null> {
  const [already] = await db.select({ id: s.employee.id }).from(s.employee).where(eq(s.employee.userId, user.id));
  if (already) return already.id;
  const p = pending.get(user.email.toLowerCase());
  let target: string | undefined = p?.employeeId;
  if (!target) {
    const [byEmail] = await db.select({ id: s.employee.id }).from(s.employee)
      .where(and(sql`lower(${s.employee.email}) = lower(${user.email})`, isNull(s.employee.userId)));
    target = byEmail?.id;
  }
  if (!target) return null;
  const done = await db.update(s.employee).set({ userId: user.id })
    .where(and(eq(s.employee.id, target), isNull(s.employee.userId))).returning({ id: s.employee.id });
  pending.delete(user.email.toLowerCase());
  if (!user.role) await db.update(s.user).set({ role: "employee" }).where(eq(s.user.id, user.id));
  if (done[0]) await refreshGate(db); // the next sign-in links straight to this account
  return done[0]?.id ?? null;
}
