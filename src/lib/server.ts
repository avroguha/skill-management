// Per-request server helpers: the session, the viewer (who is looking and what
// they may see), and the engine over the current data. Everything is memoised
// per request with React's cache(), so a page and its components share one load.
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getAuth } from "@/lib/auth";
import { loadDatasetFrom } from "@/lib/dataset";
import { createEngine, type Basis, type Employee, type Engine } from "@/lib/engine/engine";
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
}

export const getSession = cache(async () => {
  const auth = await getAuth();
  return auth.api.getSession({ headers: await headers() });
});

export const loadDataset = cache(async () => loadDatasetFrom(await getDb()));

export const getEngine = cache(async (basis: Basis = "validated"): Promise<Engine> =>
  createEngine(await loadDataset(), { basis }));

function asRole(r: string | null | undefined): AccessRole {
  return r === "admin" || r === "executive" || r === "manager" ? r : "employee";
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
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
    userId: u.id,
    name: u.name,
    email: u.email,
    username: u.username ?? null,
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
    mustChangePassword: !!u.mustChangePassword,
  };
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

/** For server actions: the viewer or an error (never a redirect mid-mutation). */
export async function actionViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new Error("Not signed in");
  if (v.mustChangePassword) throw new Error("Change the default password first");
  return v;
}

export async function audit(v: Viewer | null, action: string, entity: string, entityId: string | null, detail?: unknown) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({
    actorId: v?.userId ?? null,
    actorName: v?.name ?? "system",
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
