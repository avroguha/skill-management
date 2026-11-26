// Roles used to be one list for the whole organisation: a manager chose one for their team,
// people followed it, and a person could have one of their own. Roles now belong to a team.
// This turns the old picture into the new one, keeping for every person the role that counted
// for them, as a role of their manager's team with the same name and skills.
//
// Used where old data still arrives: the version-1 import and a backup made before the change.
// The database upgrade does the same in SQL (drizzle/0002_team_roles_requests.sql);
// test/legacy-roles.test.ts checks the two agree.
import { createHash } from "node:crypto";

export interface LegacyPerson { id: string; managerId: string | null; active: boolean; roleId: string | null; teamRoleId?: string | null; teamRoleCascade?: boolean | null }
export interface LegacyRole { id: string; name: string; description?: string | null }
export interface LegacyRoleSkill { roleId: string; gradeId?: string | null; skillId: string; target: number; mandatory: boolean }

export interface ConvertedRoles {
  roles: { id: string; managerId: string; name: string; description: string }[];
  members: { roleId: string; employeeId: string }[];
  skills: { roleId: string; skillId: string; target: number; mandatory: boolean }[];
}

/** The id the upgrade gives a team's copy of an old role: the same from SQL and from here. */
export const teamRoleId = (managerId: string, roleId: string) => createHash("md5").update(`${managerId}:${roleId}`).digest("hex");

export function convertLegacyRoles(people: LegacyPerson[], roles: LegacyRole[], roleSkills: LegacyRoleSkill[]): ConvertedRoles {
  const byId = new Map(people.map((p) => [p.id, p]));
  const roleById = new Map(roles.map((r) => [r.id, r]));
  // what a manager's people followed: the manager's own choice, else the nearest choice above
  // that was made "for everyone below"
  const followed = (managerId: string): string | null => {
    const m = byId.get(managerId);
    if (!m) return null;
    if (m.teamRoleId) return m.teamRoleId;
    const seen = new Set([m.id]);
    for (let up = m.managerId ? byId.get(m.managerId) : undefined; up && !seen.has(up.id); up = up.managerId ? byId.get(up.managerId) : undefined) {
      seen.add(up.id);
      if (up.teamRoleId && up.teamRoleCascade) return up.teamRoleId;
    }
    return null;
  };
  const out: ConvertedRoles = { roles: [], members: [], skills: [] };
  const made = new Map<string, string>(); // team role id -> old role id
  for (const p of people) {
    if (!p.active || !p.managerId || p.managerId === p.id || !byId.has(p.managerId)) continue;
    const old = p.roleId ?? p.teamRoleId ?? followed(p.managerId);
    const role = old ? roleById.get(old) : undefined;
    if (!role) continue;
    const id = teamRoleId(p.managerId, role.id);
    if (!made.has(id)) {
      made.set(id, role.id);
      out.roles.push({ id, managerId: p.managerId, name: role.name, description: role.description ?? "" });
    }
    out.members.push({ roleId: id, employeeId: p.id });
  }
  // one level per skill: the one for every grade when there is one, else the highest
  const perRole = new Map<string, Map<string, { general: number | null; max: number; mandatory: boolean }>>();
  for (const rs of roleSkills) {
    const m = perRole.get(rs.roleId) ?? new Map();
    const cur = m.get(rs.skillId) ?? { general: null, max: 0, mandatory: false };
    if (rs.gradeId == null) cur.general = Math.max(cur.general ?? 0, rs.target);
    cur.max = Math.max(cur.max, rs.target);
    cur.mandatory = cur.mandatory || rs.mandatory;
    m.set(rs.skillId, cur);
    perRole.set(rs.roleId, m);
  }
  for (const [id, old] of made) {
    for (const [skillId, k] of perRole.get(old) ?? []) out.skills.push({ roleId: id, skillId, target: k.general ?? k.max, mandatory: k.mandatory });
  }
  return out;
}
