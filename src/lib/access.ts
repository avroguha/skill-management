// Who may see what: the access part of a viewer, worked out from the engine alone (no
// framework or database imports, so test/access.test.ts checks it directly).
//
//   admin      everything, including Settings
//   leader     reads the whole organisation (an executive, HR, a programme lead)
//   manager    anyone with people reporting to them (derived, never assigned): they see
//              everyone below them, confirm their direct reports' ratings and set what
//              their team needs
//   employee   their own skills, the skills catalogue and people search
import type { Employee, Engine } from "./engine/engine.ts";
import { ALL } from "./engine/engine.ts";

export type AccessRole = "admin" | "leader" | "manager" | "employee";
export const ACCESS_ROLES: { value: AccessRole; label: string; description: string }[] = [
  { value: "admin", label: "Administrator", description: "Everything, including Settings." },
  { value: "leader", label: "Leader", description: "Sees the whole organisation, read-only beyond their own people." },
  { value: "manager", label: "Manager", description: "Anyone with people reporting to them gets this by themselves: they see everyone below them and confirm their direct reports' ratings." },
  { value: "employee", label: "Employee", description: "Their own skills, the catalogue and people search." },
];

/** v1 names map onto v2's: an executive or operator becomes a leader. */
export function asRole(r: string | null | undefined): AccessRole {
  if (r === "admin") return "admin";
  if (r === "leader" || r === "executive" || r === "operator") return "leader";
  if (r === "manager") return "manager";
  return "employee";
}

export interface Access {
  role: AccessRole;
  /** reads every person (admin and leader) */
  allPeople: boolean;
  /** the people this viewer may read */
  employeeIds: Set<string>;
  /** the people whose ratings this viewer confirms: their direct reports (admins: anyone) */
  reportIds: Set<string>;
  /** the managers whose team needs this viewer may change: themselves and every manager below */
  manageIds: Set<string>;
  /** where the team and insight pages open: their own team, or the whole organisation */
  homeScope: string | null;
  /** sees team pages and insights (manages people, or reads the whole organisation) */
  canSeeTeams: boolean;
}

export function buildAccess(engine: Engine, assignedRole: AccessRole, employee: Employee | null): Access {
  const below = employee ? engine.reportsOf(employee.id) : [];
  let role = assignedRole;
  if (role === "employee" && below.length) role = "manager";
  const allPeople = role === "admin" || role === "leader";

  const employeeIds = new Set<string>(allPeople ? engine.empById.keys() : below.map((e) => e.id));
  if (employee) employeeIds.add(employee.id);

  // Confirming ratings is the direct manager's job; an administrator may step in for anyone.
  const reportIds = new Set<string>(role === "admin" ? engine.empById.keys() : employee ? engine.directReportsOf(employee.id).map((e) => e.id) : []);
  if (employee && role !== "admin") reportIds.delete(employee.id); // nobody confirms their own

  const manageIds = new Set<string>();
  if (role === "admin") {
    for (const e of engine.activeEmployees) if (engine.isManager(e)) manageIds.add(e.id);
  } else if (employee && below.length) {
    for (const m of engine.managersIn(employee.id)) manageIds.add(m.id);
  }

  const homeScope = allPeople ? ALL : employee && below.length ? employee.id : null;
  return { role, allPeople, employeeIds, reportIds, manageIds, homeScope, canSeeTeams: homeScope != null };
}

/** Whether a viewer may look at a scope (a manager's team, or the whole organisation). */
export function maySeeScope(a: Pick<Access, "allPeople" | "employeeIds">, scope: string): boolean {
  if (scope === ALL) return a.allPeople;
  return a.allPeople || a.employeeIds.has(scope);
}
