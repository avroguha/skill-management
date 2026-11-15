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
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";
import { isLocalAdmin, LOCAL_ADMIN_USERNAME } from "./local-admin.ts";

/** Which value of the sign-in fills each account field ("" = leave it as it is; "nameID" = the NameID). */
export interface ProfileMap { name: string; email: string; userName: string }

/**
 * Who may sign in, on top of "an active person of the organisation":
 *  - people: every active person (synced from ServiceNow or added by an administrator)
 *  - groups: only members of one of these ServiceNow groups (sys_ids), or people whose sign-in
 *    carries one of these values in the groups attribute. Administrators are always let in, so
 *    a wrong rule cannot lock out the people who would fix it.
 */
export interface AccessRule { mode: "people" | "groups"; snGroups: string[]; claimAttribute: string; claimValues: string[] }

export interface SsoSettings {
  active: boolean;
  /** "nameID" or an attribute name from the assertion */
  matchAttribute: string;
  /** the people-table field it must equal */
  matchField: "email" | "user_name";
  profile: ProfileMap;
  access: AccessRule;
}

export const DEFAULT_SSO: SsoSettings = {
  active: false, matchAttribute: "nameID", matchField: "email",
  profile: { name: "", email: "", userName: "" },
  access: { mode: "people", snGroups: [], claimAttribute: "", claimValues: [] },
};

export async function readSsoSettings(db: DB): Promise<SsoSettings> {
  const [row] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, "sso"));
  const v = (row?.value ?? {}) as Partial<SsoSettings>;
  return {
    ...DEFAULT_SSO, ...v,
    profile: { ...DEFAULT_SSO.profile, ...(v.profile ?? {}) },
    access: { ...DEFAULT_SSO.access, ...(v.access ?? {}) },
  };
}

export async function writeSsoSettings(db: DB, v: SsoSettings): Promise<void> {
  await db.insert(s.appSetting).values({ key: "sso", value: v })
    .onConflictDoUpdate({ target: s.appSetting.key, set: { value: v } });
  await refreshGate(db);
}

export interface GatePerson { id: string; name: string; email: string; title: string; userId: string | null; groups: string[]; isAdmin: boolean }
interface GateSnapshot { settings: SsoSettings; byEmail: Map<string, GatePerson>; byUserName: Map<string, GatePerson>; groupNames: Map<string, string>; accountByEmail: Map<string, string>; localAdminEmails: Set<string>; at: number }
const gs = globalThis as unknown as { __skillsGate?: GateSnapshot };

/** Reloads the gate's snapshot. Call after anything that changes who may sign in. */
export async function refreshGate(db: DB): Promise<void> {
  const settings = await readSsoSettings(db);
  const people = await db.select({
    id: s.employee.id, name: s.employee.name, title: s.employee.title, userId: s.employee.userId,
    email: s.employee.email, userName: s.employee.userName,
  }).from(s.employee).where(eq(s.employee.active, true));
  // each person's ServiceNow groups (by sys_id), and which accounts are administrators
  const memberships = await db.select({ employeeId: s.groupMember.employeeId, ext: s.snGroup.externalId, name: s.snGroup.name })
    .from(s.groupMember).innerJoin(s.snGroup, eq(s.snGroup.id, s.groupMember.groupId)).where(eq(s.snGroup.active, true));
  const groupsOf = new Map<string, string[]>();
  const groupNames = new Map<string, string>();
  for (const m of memberships) {
    groupsOf.set(m.employeeId, [...(groupsOf.get(m.employeeId) ?? []), m.ext]);
    groupNames.set(m.ext, m.name);
  }
  const all = await db.select({ id: s.user.id, email: s.user.email, role: s.user.role, username: s.user.username }).from(s.user);
  // single sign-on never lands in the local admin account (src/lib/local-admin.ts), even
  // when its e-mail is a person's or an old link ties it to one
  const localAdmin = new Set(all.filter((u) => isLocalAdmin(u)).map((u) => u.id));
  const accounts = all.filter((u) => !localAdmin.has(u.id));
  const admins = new Set(accounts.filter((u) => u.role === "admin").map((u) => u.id));
  // an account that already carries a person's e-mail (made by an administrator, or by an
  // earlier sign-in whose link step never ran) is that person's account
  const accountByEmail = new Map(accounts.map((u) => [u.email.toLowerCase(), u.id]));
  const byEmail = new Map<string, GatePerson>();
  const byUserName = new Map<string, GatePerson>();
  for (const p of people) {
    const userId = p.userId && !localAdmin.has(p.userId) ? p.userId : null;
    const own = userId ?? accountByEmail.get(p.email.toLowerCase()) ?? null;
    const g: GatePerson = { id: p.id, name: p.name, email: p.email, title: p.title, userId, groups: groupsOf.get(p.id) ?? [], isAdmin: !!own && admins.has(own) };
    byEmail.set(p.email.toLowerCase(), g);
    if (p.userName) byUserName.set(p.userName.toLowerCase(), g);
  }
  const localAdminEmails = new Set(all.filter((u) => localAdmin.has(u.id)).map((u) => u.email.toLowerCase()));
  gs.__skillsGate = { settings, byEmail, byUserName, groupNames, accountByEmail, localAdminEmails, at: Date.now() };
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

// The last attempts and the pending matches. Kept in memory for the worker that handled the
// sign-in, and written to the database AFTER the sign-in step (never inside it: that runs
// in the auth transaction, and a write there would wait on itself), so every worker sees
// them. Only the newest 20 attempts are kept; a pending match lasts 30 minutes.
const g = globalThis as unknown as { __skillsSsoAttempts?: SsoAttempt[]; __skillsSsoPending?: Map<string, { employeeId: string; profile?: { name?: string; email?: string; userName?: string }; at: number }> };
const attempts = (g.__skillsSsoAttempts ??= []);
const pending = (g.__skillsSsoPending ??= new Map());

/** Runs a database write once the current request's auth step is over; failures only log. */
function later(write: (db: DB) => Promise<unknown>) {
  setTimeout(() => {
    import("../db/index.ts").then(({ getDb }) => getDb()).then(write)
      .catch((e: Error) => console.error(`[sso] could not save: ${e.message}`));
  }, 0);
}

export function recordAttempt(a: SsoAttempt) {
  attempts.unshift(a);
  attempts.length = Math.min(attempts.length, 20);
  later(async (db) => {
    await db.insert(s.ssoAttempt).values({ at: new Date(a.at), payload: a });
    await db.execute(sql`delete from sso_attempt where id not in (select id from sso_attempt order by at desc limit 20)`);
  });
}

/** This worker's attempts (in memory). */
export function recentAttempts(): SsoAttempt[] {
  return attempts.slice();
}

/** Every worker's attempts, newest first. */
export async function loadAttempts(db: DB): Promise<SsoAttempt[]> {
  try {
    const rows = await db.select().from(s.ssoAttempt).orderBy(desc(s.ssoAttempt.at)).limit(20);
    return rows.length ? rows.map((r) => r.payload as SsoAttempt) : attempts.slice();
  } catch { return attempts.slice(); }
}

export function normaliseAttributes(raw: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    out[k] = Array.isArray(v) ? v.map(String) : [String(v)];
  }
  return out;
}

export function matchValue(settings: Pick<SsoSettings, "matchAttribute">, nameId: string, attributes: Record<string, string[]>): string {
  return (settings.matchAttribute === "nameID" ? nameId : attributes[settings.matchAttribute]?.[0] ?? "").trim();
}

/** The account fields the mapping takes from a sign-in (only the mapped, non-empty ones). */
export function profileFrom(map: ProfileMap, nameId: string, attributes: Record<string, string[]>): { name?: string; email?: string; userName?: string } {
  const pick = (a: string) => (!a ? "" : (a === "nameID" ? nameId : attributes[a]?.[0] ?? "").trim());
  const out: { name?: string; email?: string; userName?: string } = {};
  const name = pick(map.name), email = pick(map.email), userName = pick(map.userName);
  if (name) out.name = name.slice(0, 200);
  if (email && /^[^\s@]+@[^\s@]+$/.test(email)) out.email = email.toLowerCase();
  if (userName) out.userName = userName.slice(0, 100);
  return out;
}

/** Whether the access rule lets this person in, and why (for the attempt log and the preview). */
export function checkAccess(rule: AccessRule, person: Pick<GatePerson, "groups" | "isAdmin">, attributes: Record<string, string[]>, groupNames: Map<string, string> = new Map()): { ok: boolean; reason: string } {
  if (rule.mode !== "groups") return { ok: true, reason: "everyone in the organisation may sign in" };
  if (person.isAdmin) return { ok: true, reason: "administrators are always let in" };
  const inGroup = person.groups.find((g) => rule.snGroups.includes(g));
  if (inGroup) return { ok: true, reason: `member of ${groupNames.get(inGroup) ?? "an allowed group"}` };
  const sent = (rule.claimAttribute ? attributes[rule.claimAttribute] ?? [] : []).map((v) => v.trim().toLowerCase());
  const wanted = rule.claimValues.map((v) => v.trim().toLowerCase()).filter(Boolean);
  const hit = sent.find((v) => wanted.includes(v));
  if (hit) return { ok: true, reason: `the sign-in carries ${rule.claimAttribute} "${hit}"` };
  return { ok: false, reason: "not in any group allowed to sign in" };
}

/** Writes mapped account fields; a value another account already uses is skipped, not an error. */
export async function applyProfile(db: DB, userId: string, p: { name?: string; email?: string; userName?: string }): Promise<void> {
  const [target] = await db.select({ username: s.user.username }).from(s.user).where(eq(s.user.id, userId));
  if (isLocalAdmin(target)) return; // its name, e-mail and login stay as they are
  const set: Partial<typeof s.user.$inferInsert> = {};
  if (p.name) set.name = p.name;
  if (p.email) {
    const [other] = await db.select({ id: s.user.id }).from(s.user).where(and(sql`lower(${s.user.email}) = ${p.email}`, sql`${s.user.id} <> ${userId}`));
    if (!other) set.email = p.email;
  }
  if (p.userName) {
    const u = p.userName.toLowerCase();
    const [other] = await db.select({ id: s.user.id }).from(s.user).where(and(eq(s.user.username, u), sql`${s.user.id} <> ${userId}`));
    if (!other) { set.username = u; set.displayUsername = p.userName; }
  }
  if (Object.keys(set).length) await db.update(s.user).set(set).where(eq(s.user.id, userId));
}

/** After the sign-in step (outside the auth transaction): update an already-linked account. */
export function applyProfileLater(userId: string, p: { name?: string; email?: string; userName?: string }) {
  if (!Object.keys(p).length) return;
  later((db) => applyProfile(db, userId, p));
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
export function rememberPending(email: string, employeeId: string, profile: { name?: string; email?: string; userName?: string } = {}) {
  const key = email.toLowerCase();
  pending.set(key, { employeeId, profile, at: Date.now() });
  for (const [k, v] of pending) if (Date.now() - v.at > 30 * 60e3) pending.delete(k);
  later((db) => db.insert(s.ssoPending).values({ email: key, employeeId, profile }).onConflictDoUpdate({ target: s.ssoPending.email, set: { employeeId, profile, at: new Date() } }));
}

async function pendingFor(db: DB, email: string): Promise<{ employeeId: string; profile: { name?: string; email?: string; userName?: string } } | undefined> {
  const key = email.toLowerCase();
  const mem = pending.get(key);
  if (mem) return { employeeId: mem.employeeId, profile: mem.profile ?? {} };
  const [row] = await db.select().from(s.ssoPending).where(and(eq(s.ssoPending.email, key), sql`${s.ssoPending.at} > now() - interval '30 minutes'`));
  return row ? { employeeId: row.employeeId, profile: row.profile ?? {} } : undefined;
}

/** Links a signed-in account to its person: the one the gate matched, else the same e-mail. */
export async function linkSignedInUser(db: DB, user: { id: string; email: string; role?: string | null }): Promise<string | null> {
  const [me] = await db.select({ username: s.user.username }).from(s.user).where(eq(s.user.id, user.id));
  if (isLocalAdmin(me)) return null; // the local admin is not a person (src/lib/local-admin.ts)
  const [already] = await db.select({ id: s.employee.id }).from(s.employee).where(eq(s.employee.userId, user.id));
  if (already) return already.id;
  const found = await pendingFor(db, user.email);
  let target: string | undefined = found?.employeeId;
  if (!target) {
    const [byEmail] = await db.select({ id: s.employee.id }).from(s.employee)
      .where(and(sql`lower(${s.employee.email}) = lower(${user.email})`, isNull(s.employee.userId)));
    target = byEmail?.id;
  }
  if (!target) return null;
  // a person an older version tied to the local admin is released to their own account
  await db.update(s.employee).set({ userId: null }).where(and(eq(s.employee.id, target),
    inArray(s.employee.userId, db.select({ id: s.user.id }).from(s.user).where(eq(s.user.username, LOCAL_ADMIN_USERNAME)))));
  const done = await db.update(s.employee).set({ userId: user.id })
    .where(and(eq(s.employee.id, target), isNull(s.employee.userId))).returning({ id: s.employee.id });
  pending.delete(user.email.toLowerCase());
  await db.delete(s.ssoPending).where(eq(s.ssoPending.email, user.email.toLowerCase()));
  if (!user.role) await db.update(s.user).set({ role: "employee" }).where(eq(s.user.id, user.id));
  if (done[0] && found?.profile) await applyProfile(db, user.id, found.profile).catch((e: Error) => console.error(`[sso] account fields not applied: ${e.message}`));
  if (done[0]) await refreshGate(db); // the next sign-in links straight to this account
  return done[0]?.id ?? null;
}
