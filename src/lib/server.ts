// Per-request server helpers: the session, the mode (live or demo), the viewer (who is
// looking and what they may see), and the engine over the current data. Everything is
// memoised per request with React's cache(), so a page and its components share one load.
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { getDb, schema, setModeResolver, type Mode } from "@/db";
import { getAuth } from "@/lib/auth";
import { readViewAsCookie, readDemoCookie, VIEW_AS_COOKIE, DEMO_COOKIE } from "@/lib/view-as-cookie";
import { loadDatasetFrom } from "@/lib/dataset";
import { createEngine, type Basis, type Dataset, type Employee, type Engine } from "@/lib/engine/engine";
import { linkSignedInUser } from "@/lib/sso-gate";
import { asRole, buildAccess, type Access, type AccessRole } from "@/lib/access";

export { ACCESS_ROLES, type AccessRole } from "@/lib/access";
export type { Mode } from "@/db";

/** What a presenter can be in demo mode. */
export const DEMO_PERSONAS = [
  { key: "top", label: "Head of the organisation", description: "Sees every team: where the organisation is strong and short." },
  { key: "director", label: "Director", description: "Leads several teams through their managers." },
  { key: "manager", label: "Team manager", description: "Confirms ratings and sets what the team needs; has work waiting." },
  { key: "member", label: "Team member", description: "Rates their own skills and sends them to their manager." },
  { key: "admin", label: "Administrator", description: "Settings: the skills catalogue, roles, levels." },
] as const;
export type DemoPersona = (typeof DEMO_PERSONAS)[number]["key"];

export interface Viewer extends Access {
  userId: string;
  name: string;
  email: string;
  username: string | null;
  assignedRole: AccessRole;
  employee: Employee | null;
  isAdmin: boolean;
  mustChangePassword: boolean;
  /** set while an administrator is viewing the app as this person (read-only) */
  viewAs: { byUserId: string; byName: string; employeeId: string; expiresAt: number } | null;
  /** set in demo mode: the made-up person the presenter is, and the real account behind it */
  demo: { persona: DemoPersona; label: string; realName: string } | null;
  /** the signed-in account may switch this browser to demo mode */
  canDemo: boolean;
}

export const getSession = cache(async () => {
  const auth = await getAuth();
  return auth.api.getSession({ headers: await headers() });
});

/**
 * The database this request uses: demo while this browser's signed demo cookie belongs to
 * the account signed in, else live. Every getDb() without a mode follows it, so nothing a
 * presenter does in demo mode can reach the live database.
 */
export const currentMode = cache(async (): Promise<Mode> => {
  const raw = (await cookies()).get(DEMO_COOKIE)?.value;
  const c = readDemoCookie(raw);
  if (!c) return "live";
  const session = await getSession();
  return session?.user.id === c.u ? "demo" : "live";
});
setModeResolver(() => currentMode());

// ---- the computed picture, shared across requests -----------------------------------------
// Loading every person and rating and building the engine is the expensive part of a page.
// Each worker keeps it in memory (one per database) and rebuilds only when the data changed:
// database triggers bump data_version on every change, and a request reads that one number.
// Every 10 minutes it is rebuilt anyway, so "stale" (age of a rating) stays current.

type Shared = { factory: typeof createEngine; version: number; at: number; dataset: Promise<Dataset>; engines: Map<Basis, Promise<Engine>> };
const shared = globalThis as unknown as { __skillsShared2?: Partial<Record<Mode, Shared>> };
const REBUILD_MS = 10 * 60e3;

async function dataVersionNow(mode: Mode): Promise<number> {
  try {
    const r = (await (await getDb(mode)).execute(sql`select v from data_version where id = 1`)) as unknown as { rows: { v: number }[] };
    return Number(r.rows[0]?.v ?? -1);
  } catch { return -1; }
}

async function sharedState(mode: Mode): Promise<Shared> {
  const all = (shared.__skillsShared2 ??= {});
  const version = await dataVersionNow(mode);
  const cur = all[mode];
  if (cur && cur.factory === createEngine && version >= 0 && cur.version === version && Date.now() - cur.at < REBUILD_MS) return cur;
  const db = await getDb(mode);
  const next: Shared = { factory: createEngine, version, at: Date.now(), dataset: loadDatasetFrom(db), engines: new Map() };
  next.dataset.catch(() => { if (all[mode] === next) all[mode] = undefined; });
  all[mode] = next;
  return next;
}

/** Forget the shared picture (after a restore or a demo reset, which bypass the triggers). */
export function forgetSharedEngine(mode?: Mode) {
  if (!shared.__skillsShared2) return;
  if (mode) shared.__skillsShared2[mode] = undefined;
  else shared.__skillsShared2 = {};
}

async function engineFor(mode: Mode, basis: Basis): Promise<Engine> {
  const s = await sharedState(mode);
  let e = s.engines.get(basis);
  if (!e) {
    e = s.dataset.then((ds) => createEngine(ds, { basis }));
    s.engines.set(basis, e);
  }
  return e;
}

export const loadDataset = cache(async () => (await sharedState(await currentModeSafe())).dataset);

/** The engine over this request's database (demo in demo mode). */
export const getEngine = cache(async (basis: Basis = "validated"): Promise<Engine> => engineFor(await currentModeSafe(), basis));

async function currentModeSafe(): Promise<Mode> {
  try { return await currentMode(); } catch { return "live"; }
}

/**
 * Build the picture before anyone asks: called every few seconds by each worker, it notices
 * a new data version, loads the data, builds the engine and precomputes what every page
 * reads, so the first request after a change does not pay for it.
 */
export async function warmEngine(mode: Mode = "live"): Promise<boolean> {
  const before = shared.__skillsShared2?.[mode];
  const s = await sharedState(mode);
  if (s === before && s.engines.has("validated")) return false;
  (await engineFor(mode, "validated")).warm();
  return true;
}

// ---- who is looking ---------------------------------------------------------------------

interface Who { userId: string; name: string; email: string; username: string | null; role: AccessRole; mustChangePassword: boolean }

function buildViewer(engine: Engine, who: Who, employee: Employee | null): Viewer {
  const access = buildAccess(engine, who.role, employee);
  return {
    ...access,
    userId: who.userId,
    name: who.name,
    email: who.email,
    username: who.username,
    assignedRole: who.role,
    employee,
    isAdmin: access.role === "admin",
    mustChangePassword: who.mustChangePassword,
    viewAs: null,
    demo: null,
    canDemo: access.role !== "employee",
  };
}

/** The signed-in account's own viewer, over the LIVE data, whatever the mode or "view as". */
export const getRealViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getSession();
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: string | null; username?: string | null; mustChangePassword?: boolean };
  const engine = await engineFor("live", "validated");
  const db = await getDb("live");
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

/** The demo person a persona key stands for, in the demo database. */
async function demoViewer(real: Viewer, persona: string): Promise<Viewer> {
  const { demoPersonas } = await import("@/db/demo");
  const engine = await engineFor("demo", "validated");
  const ids = await demoPersonas(await getDb("demo"));
  const p = DEMO_PERSONAS.find((x) => x.key === persona) ?? DEMO_PERSONAS[0];
  const employee = p.key === "admin" ? null : engine.empById.get(ids?.[p.key] ?? "") ?? null;
  const role: AccessRole = p.key === "admin" ? "admin" : p.key === "top" ? "leader" : "employee";
  const v = buildViewer(engine, {
    userId: `demo:${p.key}`, name: employee?.name ?? "Demo administrator", email: employee?.email ?? "admin@avro.com",
    username: null, role, mustChangePassword: false,
  }, employee);
  return { ...v, demo: { persona: p.key, label: p.label, realName: real.name }, canDemo: true };
}

// ---- "view as": an administrator sees the app exactly as one person does -----------------
// A signed, http-only cookie names the administrator and the person and expires after an
// hour. It only counts while that administrator is signed in and still an administrator.
// Everything is read-only meanwhile and the audit log records the administrator.

export { VIEW_AS_COOKIE, VIEW_AS_MINUTES, viewAsCookie, DEMO_COOKIE, demoCookie } from "@/lib/view-as-cookie";

/** Whether an administrator may view as this person, and as whom. */
export async function viewAsTarget(employeeId: string, adminUserId: string): Promise<{ ok: true; employee: Employee; who: Who } | { ok: false; error: string }> {
  const engine = await engineFor("live", "validated");
  const employee = engine.empById.get(employeeId);
  if (!employee) return { ok: false, error: "That person no longer exists." };
  if (!employee.active) return { ok: false, error: `${employee.name} has left and cannot sign in, so there is nothing to see.` };
  const db = await getDb("live");
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

/** The viewer pages and actions see: a demo person in demo mode, the person an
 *  administrator is viewing as, or the account itself. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const real = await getRealViewer();
  if (!real) return null;
  const jar = await cookies();
  if ((await currentModeSafe()) === "demo" && real.canDemo) {
    const c = readDemoCookie(jar.get(DEMO_COOKIE)?.value);
    return demoViewer(real, c?.p ?? "top");
  }
  if (!real.isAdmin) return real;
  const va = readViewAsCookie(jar.get(VIEW_AS_COOKIE)?.value);
  if (!va || va.a !== real.userId) return real;
  const t = await viewAsTarget(va.e, real.userId);
  if (!t.ok) return real;
  const engine = await engineFor("live", "validated");
  return { ...buildViewer(engine, t.who, t.employee), viewAs: { byUserId: real.userId, byName: real.name, employeeId: t.employee.id, expiresAt: va.x } };
});

/** For pages: the viewer, or a redirect to sign in / to change the default password. */
export async function requireViewer(opts: { allowPasswordChange?: boolean } = {}): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.mustChangePassword && !opts.allowPasswordChange && !v.demo) redirect("/change-password");
  return v;
}

/** For the team and insight pages: managers, leaders and administrators. */
export async function requireTeamViewer(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.canSeeTeams) redirect(v.employee ? "/my-skills" : "/no-profile");
  return v;
}

export async function requireAdmin(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.isAdmin) redirect("/");
  return v;
}

export function canSeeEmployee(v: Viewer, employeeId: string): boolean {
  return v.allPeople || v.employeeIds.has(employeeId);
}

/**
 * For server actions: the viewer or an error (never a redirect mid-mutation). While an
 * administrator is viewing as someone, only reads ({ read: true }) are allowed. Actions that
 * touch what only exists for real - accounts, single sign-on, ServiceNow, e-mail, backups -
 * pass { live: true } and are refused in demo mode.
 */
export async function actionViewer(opts: { read?: boolean; live?: boolean } = {}): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new Error("Not signed in");
  if (v.mustChangePassword && !v.demo) throw new Error("Change the default password first");
  if (v.viewAs && !opts.read) throw new Error(`Read-only: you are viewing as ${v.name}. Stop viewing to make changes.`);
  if (v.demo && opts.live) throw new Error("Not in demo mode: this changes the real setup. Leave demo mode first.");
  return v;
}

/**
 * actionViewer for actions that answer { ok: false, error } rather than throwing: a refusal
 * comes back as that answer, so the page shows the message instead of an error screen.
 */
export async function guardAction(opts: { read?: boolean; live?: boolean } = {}): Promise<{ v: Viewer; fail?: undefined } | { v?: undefined; fail: { ok: false; error: string } }> {
  try { return { v: await actionViewer(opts) }; }
  catch (e) { return { fail: { ok: false, error: (e as Error).message } }; }
}

export async function audit(v: Viewer | null, action: string, entity: string, entityId: string | null, detail?: unknown) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({
    // viewing as someone: the administrator is the actor, never the person
    actorId: v?.viewAs ? v.viewAs.byUserId : v?.userId ?? null,
    actorName: v?.viewAs ? `${v.viewAs.byName} (viewing as ${v.name})` : v?.demo ? `${v.demo.realName} (demo, as ${v.name})` : v?.name ?? "system",
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
