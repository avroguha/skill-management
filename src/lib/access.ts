// Who may see what: the access part of a viewer, worked out from the engine alone (no
// framework or database imports, so test/access.test.ts checks it directly).
//
//   admin      everything, including setup
//   executive  reads the whole organisation; builds charts over any of it
//   operator   their own hierarchy (if they lead anyone) plus every hierarchy an administrator
//              assigned them: a leader (that person and everyone below) or a unit (and the
//              units under it). Reads those and builds charts over them. They validate and set
//              targets only for their OWN reports, and edit team needs only for units they
//              manage themselves: an assigned hierarchy is read-only.
//   manager    anyone who manages a unit or has reports (derived, never needs assigning)
//   employee   their own profile
import type { Employee, Engine } from "./engine/engine.ts";

export type AccessRole = "admin" | "executive" | "operator" | "manager" | "employee";
export const ACCESS_ROLES: { value: AccessRole; label: string; description: string }[] = [
  { value: "admin", label: "Administrator", description: "Everything, including setup and users." },
  { value: "executive", label: "Executive", description: "Reads the whole organisation and builds charts over it." },
  { value: "operator", label: "Operator", description: "Builds charts over their own hierarchy and any an administrator assigns; reads those, read-only." },
  { value: "manager", label: "Manager", description: "Their units and reports: view, validate, set targets." },
  { value: "employee", label: "Employee", description: "Their own profile and self-assessment." },
];

export function asRole(r: string | null | undefined): AccessRole {
  return r === "admin" || r === "executive" || r === "operator" || r === "manager" ? r : "employee";
}

/** A hierarchy: a leader and everyone below them, or a unit and the units under it. */
export interface Scope { kind: "leader" | "unit"; id: string }

export interface Access {
  role: AccessRole;
  allUnits: boolean;
  /** units whose data this viewer may read */
  unitIds: Set<string>;
  /** people this viewer may read */
  employeeIds: Set<string>;
  /** people whose ratings this viewer validates and whose targets they set */
  reportIds: Set<string>;
  /** units this viewer manages themselves (and those under them): where they edit team needs */
  manageUnitIds: Set<string>;
  homeUnitId: string | null;
  canSeeOrg: boolean;
  canBuildCharts: boolean;
  /** the hierarchies charts may be built over: "all" for executives and administrators */
  chartScopes: Scope[] | "all";
}

/** Scopes that still point at something: an active leader, or an existing unit. */
export function validScopes(engine: Engine, scopes: Scope[]): Scope[] {
  return scopes.filter((s) => (s.kind === "leader" ? !!engine.empById.get(s.id)?.active : s.kind === "unit" && engine.unitById.has(s.id)));
}

export function buildAccess(engine: Engine, assignedRole: AccessRole, employee: Employee | null, assigned: Scope[] = []): Access {
  const reports = employee ? engine.reportsOf(employee.id) : [];
  const managed = employee ? engine.managedUnitIds(employee.id) : [];
  let role = assignedRole;
  if (role === "employee" && (reports.length || managed.length)) role = "manager";

  const allUnits = role === "admin" || role === "executive";
  const manageUnitIds = new Set<string>();
  for (const m of managed) for (const id of engine.subtreeUnitIds(m)) manageUnitIds.add(id);

  const unitIds = new Set<string>();
  const employeeIds = new Set<string>(allUnits ? engine.empById.keys() : []);
  const scopes = role === "operator" ? validScopes(engine, assigned) : [];
  if (!allUnits) {
    if (role === "manager" || role === "operator") for (const id of manageUnitIds) unitIds.add(id);
    for (const s of scopes) {
      if (s.kind === "unit") {
        for (const id of engine.subtreeUnitIds(s.id)) unitIds.add(id);
      } else {
        employeeIds.add(s.id);
        for (const e of engine.reportsOf(s.id)) employeeIds.add(e.id);
        for (const m of engine.managedUnitIds(s.id)) for (const id of engine.subtreeUnitIds(m)) unitIds.add(id);
      }
    }
    for (const r of reports) employeeIds.add(r.id);
    for (const uid of unitIds) for (const e of engine.directMembers(uid)) employeeIds.add(e.id);
    if (employee) employeeIds.add(employee.id);
  }
  const reportIds = new Set<string>(role === "admin" ? [...engine.empById.keys()] : reports.map((r) => r.id));
  if (employee && role !== "admin") reportIds.delete(employee.id); // nobody validates themselves

  // Home scope: the whole organisation, or the highest unit this person manages, or the first
  // hierarchy they were given, or their own unit.
  const top = (ids: string[]) => ids.find((m) => !engine.ancestors(m).some((a) => ids.includes(a.id))) ?? ids[0];
  let homeUnitId: string | null = null;
  if (allUnits) homeUnitId = [...engine.roots].sort((a, b) => engine.membersOf(b.id).length - engine.membersOf(a.id).length)[0]?.id ?? null;
  else if (managed.length) homeUnitId = top(managed);
  else if (scopes.length) {
    const s = scopes[0];
    homeUnitId = s.kind === "unit" ? s.id : (top(engine.managedUnitIds(s.id)) ?? engine.empById.get(s.id)?.unitId ?? null);
  } else homeUnitId = employee?.unitId ?? null;

  let chartScopes: Scope[] | "all" = [];
  if (allUnits) chartScopes = "all";
  else if (role === "operator") {
    const own: Scope[] = employee && reports.length ? [{ kind: "leader", id: employee.id }] : [];
    const seen = new Set<string>();
    chartScopes = [...own, ...scopes].filter((s) => !seen.has(`${s.kind}:${s.id}`) && !!seen.add(`${s.kind}:${s.id}`));
  }

  return {
    role, allUnits, unitIds, employeeIds, reportIds, manageUnitIds, homeUnitId,
    canSeeOrg: allUnits || role === "manager" || role === "operator",
    canBuildCharts: allUnits || role === "operator",
    chartScopes,
  };
}

/** Whether a viewer may build or see a chart over this hierarchy: one of theirs, or a part of
 *  one (a unit, or a leader, inside what they may read). */
export function mayChart(a: Pick<Access, "chartScopes" | "canBuildCharts" | "unitIds" | "employeeIds">, s: Scope): boolean {
  if (!a.canBuildCharts) return false;
  if (a.chartScopes === "all") return true;
  if (a.chartScopes.some((x) => x.kind === s.kind && x.id === s.id)) return true;
  return s.kind === "unit" ? a.unitIds.has(s.id) : a.employeeIds.has(s.id);
}
