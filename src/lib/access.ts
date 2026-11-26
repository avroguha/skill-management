// Who may see what: the access part of a viewer, worked out from the engine alone (no
// framework or database imports, so test/access.test.ts checks it directly).
//
//   admin      everything, including Settings
//   leader     reads the whole organisation (an executive, HR, a programme lead)
//   coordinator  approves requests for new skills and categories (Requests); otherwise
//              they are who they are: a manager when people report to them, else an employee
//   manager    anyone with people reporting to them (derived, never assigned): they see
//              everyone below them, confirm their direct reports' ratings and set what
//              their team needs
//   employee   what is their own and nothing else: their skills and ratings, the roles they
//              are in, their own requests, and the catalogue (which is the same for everyone).
//              No other person's details, not even a team mate's: only a person's managers
//              (and leaders and administrators) see those.
import type { Employee, Engine } from "./engine/engine.ts";
import { ALL } from "./engine/engine.ts";

export type AccessRole = "admin" | "leader" | "coordinator" | "manager" | "employee";
export const ACCESS_ROLES: { value: AccessRole; label: string; description: string }[] = [
  { value: "admin", label: "Administrator", description: "Everything, including Settings." },
  { value: "leader", label: "Leader", description: "Sees the whole organisation, read-only beyond their own people." },
  { value: "coordinator", label: "Coordinator", description: "Approves requests for new skills and categories, sends them back or says no. Otherwise sees what a manager or employee sees." },
  { value: "manager", label: "Manager", description: "Anyone with people reporting to them gets this by themselves: they see everyone below them and confirm their direct reports' ratings." },
  { value: "employee", label: "Employee", description: "Only what is their own: their skills and ratings, the roles they are in, their requests, and the catalogue. Nobody else's details." },
];

/** v1 names map onto v2's: an executive or operator becomes a leader. */
export function asRole(r: string | null | undefined): AccessRole {
  if (r === "admin") return "admin";
  if (r === "leader" || r === "executive" || r === "operator") return "leader";
  if (r === "coordinator") return "coordinator";
  if (r === "manager") return "manager";
  return "employee";
}

export interface Access {
  /** what they are for seeing people: never "coordinator" (that is the flag below) */
  role: AccessRole;
  /** may approve requests for new skills and categories: coordinators and administrators */
  coordinator: boolean;
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
  const coordinator = assignedRole === "coordinator" || assignedRole === "admin";
  let role: AccessRole = assignedRole === "coordinator" ? "employee" : assignedRole;
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
  return { role, coordinator, allPeople, employeeIds, reportIds, manageIds, homeScope, canSeeTeams: homeScope != null };
}

/** Whether a viewer may look at a scope (a manager's team, or the whole organisation). */
export function maySeeScope(a: Pick<Access, "allPeople" | "employeeIds">, scope: string): boolean {
  if (scope === ALL) return a.allPeople;
  return a.allPeople || a.employeeIds.has(scope);
}

/**
 * Whether a viewer sees the whole of a team's roles, with who is in each: those who manage
 * the team (its manager and the managers above), leaders and administrators. A member of
 * the team sees the roles they are in themselves, and not who else is in them.
 */
export function maySeeTeamRoles(a: Pick<Access, "allPeople" | "manageIds">, managerId: string): boolean {
  return a.allPeople || a.manageIds.has(managerId);
}

/**
 * Whether a viewer sees which other teams a person would fit in. For someone else: whoever
 * may see that person at all (their managers, leaders, administrators). For themselves: only
 * when an administrator switched that on (Settings, Levels & rules); it is off by default.
 */
export function maySeeFit(a: Pick<Access, "allPeople" | "canSeeTeams">, self: boolean, membersSeeFit: boolean): boolean {
  return self ? membersSeeFit || a.allPeople : a.canSeeTeams;
}
