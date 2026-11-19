// Which role each person has, and where it comes from. Pure (test/team-roles.test.ts).
//
// A manager chooses a role for their team; nobody is forced into it:
//  1. A person's OWN role wins, when they have one.
//  2. Else a manager holds the role they chose for their team.
//  3. Else the nearest manager above whose team role reaches them: the direct manager's
//     always does; one further up only when it was set "for everyone below" (cascade).
//     So a manager lower down changes it for their own team by choosing another role.
//  4. Else no role.

export interface RolePerson {
  id: string;
  managerId: string | null;
  /** their own role */
  roleId: string | null;
  /** the role they chose for their team */
  teamRoleId?: string | null;
  /** ... and for everyone further below */
  teamRoleCascade?: boolean | null;
}

export interface ResolvedRole {
  roleId: string | null;
  /** null = their own role (or none); else the manager whose team role they follow (themselves for a manager's own team role) */
  from: string | null;
}

export function resolveRoles<P extends RolePerson>(people: P[]): Map<string, ResolvedRole> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const out = new Map<string, ResolvedRole>();
  for (const p of people) {
    if (p.roleId) { out.set(p.id, { roleId: p.roleId, from: null }); continue; }
    if (p.teamRoleId) { out.set(p.id, { roleId: p.teamRoleId, from: p.id }); continue; }
    let found: ResolvedRole = { roleId: null, from: null };
    const seen = new Set<string>([p.id]);
    let m = p.managerId ? byId.get(p.managerId) : undefined;
    let direct = true;
    while (m && !seen.has(m.id)) {
      if (m.teamRoleId && (direct || m.teamRoleCascade)) { found = { roleId: m.teamRoleId, from: m.id }; break; }
      seen.add(m.id);
      direct = false;
      m = m.managerId ? byId.get(m.managerId) : undefined;
    }
    out.set(p.id, found);
  }
  return out;
}

/**
 * Who a manager's team role reaches (or would reach, were it set): their direct reports, and
 * with cascade everyone further below until a manager who chose a role of their own. People
 * with a role of their own are listed apart: they keep it unless the manager replaces it.
 */
export function teamRoleReach<P extends RolePerson>(people: P[], managerId: string, cascade: boolean): { follow: P[]; own: P[] } {
  // by the same rules as above: set it, ignore everyone's own role, and see who follows it
  const MARK = "\u0000reach";
  const as = people.map((p) => ({ ...p, roleId: null, ...(p.id === managerId ? { teamRoleId: MARK, teamRoleCascade: cascade } : {}) }));
  const resolved = resolveRoles(as);
  const follow: P[] = [];
  const own: P[] = [];
  for (const p of people) {
    if (p.id === managerId || resolved.get(p.id)?.from !== managerId) continue;
    (p.roleId ? own : follow).push(p);
  }
  return { follow, own };
}
