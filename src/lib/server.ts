// Per-request server helpers: the session, the viewer (who is looking and what
// they may see), and the engine over the current data. Everything is memoised
// per request with React's cache(), so a page and its components share one load.
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getAuth } from "@/lib/auth";
import { readViewAsCookie, VIEW_AS_COOKIE as COOKIE } from "@/lib/view-as-cookie";
import { loadDatasetFrom } from "@/lib/dataset";
import { createEngine, type Basis, type Dataset, type Employee, type Engine } from "@/lib/engine/engine";
import { linkSignedInUser } from "@/lib/sso-gate";

export type AccessRole = "admin" | "executive" | "manager" | "employee";
export const ACCESS_ROLES: { value: AccessRole; label: string; description: string }[] = [
  { value: "admin", label: "Administrator", description: "Everything, including setup and users." },
  { value: "executive", label: "Executive", description: "Reads the whole organisation." },
  { value: "manager", label: "Manager", description: "Their units and reports: view, validate, set targets." },
  { value: "employee", label: "Employee", description: "Their own profile and self-assessment." },
];

export interface Viewer {
  userId: string;
  name: string;
  email: string;
  username: string | null;
  assignedRole: AccessRole;
  /** assigned role, raised to manager when the person actually manages someone */
  role: AccessRole;
  employee: Employee | null;
  allUnits: boolean;
  unitIds: Set<string>;
  employeeIds: Set<string>;
  /** people whose ratings this viewer may validate and whose targets they may set */
  reportIds: Set<string>;
  homeUnitId: string | null;
  isAdmin: boolean;
  canSeeOrg: boolean;
  mustChangePassword: boolean;
  /** set while an administrator is viewing the app as this person (read-only) */
  viewAs: { byUserId: string; byName: string; employeeId: string; expiresAt: number } | null;
}

export const getSession = cache(async () => {
  const auth = await getAuth();
  return auth.api.getSession({ headers: await headers() });
});

// ---- the computed picture, shared across requests -----------------------------------------
// Loading every person and rating and building the engine is the expensive part of a page.
// Each worker keeps it in memory and rebuilds only when the data changed: database triggers
// bump data_version on every change (migration 0002), and a request reads that one number.
// Every 10 minutes it is rebuilt anyway, so "stale" (age of a rating) stays current.

type Shared = { version: number; at: number; dataset: Promise<Dataset>; engines: Map<Basis, Promise<Engine>> };
const shared = globalThis as unknown as { __skillsShared?: Shared };
const REBUILD_MS = 10 * 60e3;

async function dataVersionNow(): Promise<number> {
  try {
    const r = (await (await getDb()).execute(sql`select v from data_version where id = 1`)) as unknown as { rows: { v: number }[] };
    return Number(r.rows[0]?.v ?? -1);
  } catch { return -1; } // before the migration: no caching
}

async function sharedState(): Promise<Shared> {
  const version = await dataVersionNow();
  const cur = shared.__skillsShared;
  if (cur && version >= 0 && cur.version === version && Date.now() - cur.at < REBUILD_MS) return cur;
  const db = await getDb();
  const next: Shared = { version, at: Date.now(), dataset: loadDatasetFrom(db), engines: new Map() };
  next.dataset.catch(() => { if (shared.__skillsShared === next) shared.__skillsShared = undefined; });
  shared.__skillsShared = next;
  return next;
}

/** Forget the shared picture (after a restore, which loads data with triggers off). */
export function forgetSharedEngine() { shared.__skillsShared = undefined; }

export const loadDataset = cache(async () => (await sharedState()).dataset);

export const getEngine = cache(async (basis: Basis = "validated"): Promise<Engine> => {
  const s = await sharedState();
  let e = s.engines.get(basis);
  if (!e) {
    e = s.dataset.then((ds) => createEngine(ds, { basis }));
    s.engines.set(basis, e);
  }
  return e;
});

/**
 * Build the picture before anyone asks: called every few seconds by each worker, it notices a
 * new data version, loads the data, builds the engine and precomputes what every page reads
 * (reporting lines, unit members, the organisation's coverage), so the first request after a
 * change does not pay for it. Does nothing while the picture is current.
 */
export async function warmEngine(): Promise<boolean> {
  const before = shared.__skillsShared;
  const s = await sharedState();
  if (s === before && s.engines.has("validated")) return false;
  let e = s.engines.get("validated");
  if (!e) { e = s.dataset.then((ds) => createEngine(ds, { basis: "validated" })); s.engines.set("validated", e); }
  (await e).warm();
  return true;
}

function asRole(r: string | null | undefined): AccessRole {
  return r === "admin" || r === "executive" || r === "manager" ? r : "employee";
}

/** Who a viewer is built for: a signed-in account, or (viewing as) a person's record. */
interface Who { userId: string; name: string; email: string; username: string | null; role: AccessRole; mustChangePassword: boolean }

function buildViewer(engine: Engine, who: Who, employee: Employee | null): Viewer {
  const assignedRole = who.role;
  const reports = employee ? engine.reportsOf(employee.id) : [];
  const managed = employee ? engine.managedUnitIds(employee.id) : [];
  let role = assignedRole;
  if (role === "employee" && (reports.length || managed.length)) role = "manager";

  const allUnits = role === "admin" || role === "executive";
  const unitIds = new Set<string>();
  if (!allUnits && role === "manager") for (const m of managed) for (const id of engine.subtreeUnitIds(m)) unitIds.add(id);
  const employeeIds = new Set<string>(allUnits ? engine.empById.keys() : []);
  if (!allUnits) {
    for (const r of reports) employeeIds.add(r.id);
    for (const uid of unitIds) for (const e of engine.directMembers(uid)) employeeIds.add(e.id);
    if (employee) employeeIds.add(employee.id);
  }
  const reportIds = new Set<string>(
    role === "admin" ? [...engine.empById.keys()] : reports.map((r) => r.id),
  );
  if (employee && role !== "admin") reportIds.delete(employee.id); // nobody validates themselves

  // Home scope: the whole organisation, or the highest unit this person manages, or their own unit.
  let homeUnitId: string | null = null;
  if (allUnits) homeUnitId = [...engine.roots].sort((a, b) => engine.membersOf(b.id).length - engine.membersOf(a.id).length)[0]?.id ?? null;
  else if (managed.length) homeUnitId = managed.find((m) => !engine.ancestors(m).some((a) => managed.includes(a.id))) ?? managed[0];
  else homeUnitId = employee?.unitId ?? null;

  return {
    userId: who.userId,
    name: who.name,
    email: who.email,
    username: who.username,
    assignedRole,
    role,
    employee,
    allUnits,
    unitIds,
    employeeIds,
    reportIds,
    homeUnitId,
    isAdmin: role === "admin",
    canSeeOrg: allUnits || role === "manager",
    mustChangePassword: who.mustChangePassword,
    viewAs: null,
  };
}

/** The signed-in account's own viewer, whatever "view as" is set. */
export const getRealViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getSession();
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: string | null; username?: string | null; mustChangePassword?: boolean };
  const engine = await getEngine();
  const db = await getDb();
  // First request after an SSO sign-in: link the new account to the person the gate matched.
  let [row] = await db.select({ id: schema.employee.id }).from(schema.employee).where(eq(schema.employee.userId, u.id));
  if (!row) {
    const linked = await linkSignedInUser(db, u);
    if (linked) row = { id: linked };
  }
  const employee = row ? engine.empById.get(row.id) ?? null : null;
  const assignedRole = asRole(u.role);
  // Someone who left (deactivated by the directory sync) keeps no access, unless an administrator.
  if (employee && !employee.active && assignedRole !== "admin") return null;
  return buildViewer(engine, {
    userId: u.id, name: u.name, email: u.email, username: u.username ?? null, role: assignedRole, mustChangePassword: !!u.mustChangePassword,
  }, employee);
});

// ---- "view as": an administrator sees the app exactly as one person does -----------------
// A signed, http-only cookie names the administrator and the person and expires after an
// hour. It only counts while that administrator is signed in and still an administrator.
// Everything is read-only meanwhile (actionViewer refuses changes) and the audit log
// records the administrator, never the person.

export { VIEW_AS_COOKIE, VIEW_AS_MINUTES, viewAsCookie } from "@/lib/view-as-cookie";

/** Whether an administrator may view as this person, and as whom (their account's role, or "employee"). */
export async function viewAsTarget(employeeId: string, adminUserId: string): Promise<{ ok: true; employee: Employee; who: Who } | { ok: false; error: string }> {
  const engine = await getEngine();
  const employee = engine.empById.get(employeeId);
  if (!employee) return { ok: false, error: "That person no longer exists." };
  if (!employee.active) return { ok: false, error: `${employee.name} has left and cannot sign in, so there is nothing to see.` };
  const db = await getDb();
  const [row] = await db.select({ userId: schema.employee.userId, userName: schema.employee.userName }).from(schema.employee).where(eq(schema.employee.id, employeeId));
  const [user] = row?.userId ? await db.select().from(schema.user).where(eq(schema.user.id, row.userId)) : [];
  if (user?.id === adminUserId) return { ok: false, error: "That is you." };
  if (user?.role === "admin") return { ok: false, error: `${employee.name} is an administrator and sees what you see.` };
  return {
    ok: true, employee,
    who: {
      userId: user?.id ?? `person:${employee.id}`, name: employee.name, email: employee.email,
      username: (user as { username?: string | null } | undefined)?.username ?? row?.userName ?? null,
      role: asRole(user?.role), mustChangePassword: false,
    },
  };
}

/** The viewer pages and actions see: the person an administrator is viewing as, or the account itself. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const real = await getRealViewer();
  if (!real || !real.isAdmin) return real;
  const va = readViewAsCookie((await cookies()).get(COOKIE)?.value);
  if (!va || va.a !== real.userId) return real;
  const t = await viewAsTarget(va.e, real.userId);
  if (!t.ok) return real;
  const engine = await getEngine();
  return { ...buildViewer(engine, t.who, t.employee), viewAs: { byUserId: real.userId, byName: real.name, employeeId: t.employee.id, expiresAt: va.x } };
});

/** For pages: the viewer, or a redirect to sign in / to change the default password. */
export async function requireViewer(opts: { allowPasswordChange?: boolean } = {}): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.mustChangePassword && !opts.allowPasswordChange) redirect("/change-password");
  return v;
}

export async function requireOrgViewer(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.canSeeOrg) redirect(v.employee ? `/people/${v.employee.id}` : "/no-profile");
  return v;
}

export async function requireAdmin(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.isAdmin) redirect("/");
  return v;
}

export function canSeeUnit(v: Viewer, unitId: string): boolean {
  return v.allUnits || v.unitIds.has(unitId);
}

export function canSeeEmployee(v: Viewer, employeeId: string): boolean {
  return v.allUnits || v.employeeIds.has(employeeId);
}

/** The unit a page should show: the requested one if allowed, else the viewer's home. */
export function scopeUnit(v: Viewer, requested: string | undefined | null): string | null {
  if (requested && canSeeUnit(v, requested)) return requested;
  return v.homeUnitId;
}

/**
 * For server actions: the viewer or an error (never a redirect mid-mutation). While an
 * administrator is viewing as someone, only reads ({ read: true }) are allowed.
 */
export async function actionViewer(opts: { read?: boolean } = {}): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new Error("Not signed in");
  if (v.mustChangePassword) throw new Error("Change the default password first");
  if (v.viewAs && !opts.read) throw new Error(`Read-only: you are viewing as ${v.name}. Stop viewing to make changes.`);
  return v;
}

/**
 * actionViewer for actions that answer { ok: false, error } rather than throwing: a refusal
 * (not signed in, read-only while viewing as someone) comes back as that answer, so the
 * page shows the message instead of an error screen.
 */
export async function guardAction(opts: { read?: boolean } = {}): Promise<{ v: Viewer; fail?: undefined } | { v?: undefined; fail: { ok: false; error: string } }> {
  try { return { v: await actionViewer(opts) }; }
  catch (e) { return { fail: { ok: false, error: (e as Error).message } }; }
}

export async function audit(v: Viewer | null, action: string, entity: string, entityId: string | null, detail?: unknown) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({
    // viewing as someone: the administrator is the actor, never the person
    actorId: v?.viewAs ? v.viewAs.byUserId : v?.userId ?? null,
    actorName: v?.viewAs ? `${v.viewAs.byName} (viewing as ${v.name})` : v?.name ?? "system",
    action,
    entity,
    entityId,
    detail: (detail ?? null) as never,
  });
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}
