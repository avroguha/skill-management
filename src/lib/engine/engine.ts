// The skills engine: every number the app shows is computed here, from a plain
// in-memory dataset. No database, no framework imports, so it is unit-tested
// directly (test/engine.test.ts) and every page agrees with every other page.
//
// v2: a TEAM is a manager and everyone below them. There are no units.
//
// Rules:
//  * Who assesses themselves: everyone except people who manage others (unless the
//    "managers assess too" setting is on) and the top of the organisation. A manager
//    may still add skills of their own: they count as capability, never as a gap.
//  * A role is a grouping inside one team, made by its manager. A person can be in several.
//  * Required level: the highest level any of the person's roles asks for in the skill.
//  * "Not assessed" (no level) is never treated as 0.
//  * Gap = target - level. 0 or less: meets. 1: minor. 2: significant.
//    3+: critical; also critical when the target is Proficient (3) or above and
//    the level is Awareness (1) or below.
//  * A rating older than settings.staleMonths is stale. It still shows, flagged;
//    settings.excludeStale decides whether it counts as on target.
//  * Roll-ups count (person, required skill) pairs at or above target. Levels are
//    never averaged across people: an average hides one expert and four novices.
//  * Team need: what a manager set ("N people at level L in skill S"), else an implicit
//    one for every mandatory skill at least two of the manager's direct reports need
//    (1 person at the lowest such target), unless the manager took it off the list.
//    Coverage = people in the team at or above L.
//  * Fit in another team: the share of a role's skills a person already holds at the level
//    the role asks for. Shown from settings.fitPercent upwards.
//  * Capability only: the engine reports what is short and where, and who elsewhere
//    already has it - never what to do about it, and never hiring.

export type Basis = "validated" | "self";
export type GapCategory = "meets" | "minor" | "significant" | "critical" | "unassessed" | "not_required";
export type TargetSource = "role";

import { tintsFor, type TintKey } from "../role-colors.ts";

export interface Settings {
  staleMonths: number;
  excludeStale: boolean;
  /** on-target % at or above which an aggregate cell is green */
  greenAt: number;
  /** on-target % at or above which an aggregate cell is amber (below: red) */
  amberAt: number;
  /** people who manage others are asked to assess themselves too */
  managersAssess: boolean;
  /** a person "fits" a role of another team when they hold at least this share of its skills (1-100) */
  fitPercent: number;
  /** people see for themselves which other teams they would fit in (off: only their managers do) */
  membersSeeFit: boolean;
}

export const DEFAULT_SETTINGS: Settings = { staleMonths: 12, excludeStale: false, greenAt: 85, amberAt: 60, managersAssess: false, fitPercent: 50, membersSeeFit: false };

/** The whole organisation, as a scope. */
export const ALL = "*";

export interface Employee {
  id: string; name: string; email: string; title: string; teamName?: string;
  gradeId: string | null; managerId: string | null; active: boolean; location?: string;
  /** the roles of their manager's team this person is in (none until the manager puts them in one) */
  roleIds: string[];
}
export interface Category { id: string; name: string; sort: number }
export interface Skill { id: string; name: string; categoryId: string; parentId: string | null; status: string; sort?: number }
/** A role of one team: a grouping its manager made. The name is unique in that team only. */
export interface Role { id: string; name: string; managerId: string; description?: string; sort?: number; /** its tint, "" = by its place in the team */ color?: string }
export interface Grade { id: string; name: string; rank: number }
export interface RoleSkill { roleId: string; skillId: string; target: number; mandatory: boolean }
export interface TeamNeed {
  managerId: string; skillId: string; minLevel: number; headcount: number;
  /** a need the roles imply that the manager took off the list */
  dismissed?: boolean;
}
export interface Rating {
  employeeId: string; skillId: string;
  selfLevel: number | null; selfAt: Date | null;
  validatedLevel: number | null; validatedAt: Date | null;
  interest: boolean; status: string;
}

export interface Dataset {
  now: number;
  settings: Settings;
  employees: Employee[];
  categories: Category[];
  skills: Skill[];
  roles: Role[];
  grades: Grade[];
  roleSkills: RoleSkill[];
  teamNeeds: TeamNeed[];
  ratings: Rating[];
}

export interface Target { target: number; mandatory: boolean; source: TargetSource }

export interface Cell {
  employeeId: string;
  skillId: string;
  target: number | null;
  mandatory: boolean;
  source: TargetSource | null;
  level: number | null;
  at: Date | null;
  stale: boolean;
  met: boolean;
  gap: number | null;
  category: GapCategory;
  selfLevel: number | null;
  validatedLevel: number | null;
  status: string | null;
  interest: boolean;
}

export interface Aggregate {
  people: number;
  required: number;
  met: number;
  assessed: number;
  stale: number;
  critical: number;
  /** met / required as a whole percentage, null when nothing is required */
  pct: number | null;
}

export interface TalentSkill {
  skillId: string;
  /** rated at level 1 or above */ holders: number;
  /** level 3 or above */ proficient: number;
  /** level 4 or above */ expert: number;
  /** people whose role asks for it */ needed: number;
  /** of those, at or above their target */ onTarget: number;
  /** level 3 or above without their role asking for it */ extra: number;
  interested: number;
}

export interface Talent {
  people: number;
  rated: number;
  skills: Map<string, TalentSkill>;
  byCategory: Map<string, number[]>;
}

export interface Demand {
  /** the manager whose team this is */
  managerId: string;
  skillId: string;
  level: number;
  headcount: number;
  /** set by the manager (true) or implied by the team's roles (false) */
  explicit: boolean;
}

export interface Coverage extends Demand {
  holders: string[];
  count: number;
  shortfall: number;
  /** exactly one person holds it */
  spof: boolean;
  /** nobody holds it */
  critical: boolean;
}

/** How well a person's skills match a role of another team. */
export interface RoleFit {
  roleId: string;
  /** the manager of the team the role belongs to: under whom they would be */
  managerId: string;
  /** skills of the role the person holds at the level it asks for */
  matched: { skillId: string; level: number; target: number }[];
  /** skills of the role they are below in, or have not rated */
  missing: { skillId: string; level: number | null; target: number }[];
  /** matched / all the role's skills, as a whole percentage */
  pct: number;
}

/** Someone outside a team who already has what the team is short of. */
export interface Fit {
  managerId: string;
  /** the short needs of that team this person meets */
  skills: { skillId: string; level: number; has: number }[];
}

const DAY = 86400e3;
/** Direct reports who must need a mandatory skill before the team as a whole is said to need it. */
export const MIN_REQUIRERS = 2;

export function gapCategory(target: number | null, level: number | null): GapCategory {
  if (target == null) return "not_required";
  if (level == null) return "unassessed";
  const d = target - level;
  if (d <= 0) return "meets";
  if (d >= 3 || (target >= 3 && level <= 1)) return "critical";
  return d === 1 ? "minor" : "significant";
}

export function pct(met: number, required: number): number | null {
  return required > 0 ? Math.round((met / required) * 100) : null;
}

export function createEngine(ds: Dataset, opts: { basis?: Basis } = {}) {
  const basis: Basis = opts.basis ?? "validated";
  const settings = { ...DEFAULT_SETTINGS, ...ds.settings };
  const staleBefore = ds.now - settings.staleMonths * 30.4375 * DAY;

  const activeEmployees = ds.employees.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name));
  const empById = new Map(ds.employees.map((e) => [e.id, e]));
  // Reporting lines, indexed once per data version: every page asks "who is below this
  // person", and scanning everyone per step was O(people²) at 10k.
  const directReports = new Map<string, Employee[]>();
  for (const e of activeEmployees) {
    if (!e.managerId || e.managerId === e.id) continue;
    const list = directReports.get(e.managerId) ?? [];
    list.push(e);
    directReports.set(e.managerId, list);
  }
  const isManager = (emp: Employee) => (directReports.get(emp.id)?.length ?? 0) > 0;

  const skillById = new Map(ds.skills.map((s) => [s.id, s]));
  const activeChildCount = new Map<string, number>();
  for (const s of ds.skills) {
    if (s.parentId && s.status === "active") activeChildCount.set(s.parentId, (activeChildCount.get(s.parentId) ?? 0) + 1);
  }
  /** Only active leaf skills are rated; a skill with active sub-skills is a heading. */
  const isRateable = (skillId: string) => {
    const s = skillById.get(skillId);
    return !!s && s.status === "active" && !activeChildCount.get(skillId);
  };
  const categoryById = new Map(ds.categories.map((c) => [c.id, c]));
  const gradeById = new Map(ds.grades.map((g) => [g.id, g]));
  const roleById = new Map(ds.roles.map((r) => [r.id, r]));
  const rolesByManager = new Map<string, Role[]>();
  for (const r of ds.roles) rolesByManager.set(r.managerId, [...(rolesByManager.get(r.managerId) ?? []), r]);
  for (const list of rolesByManager.values()) list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
  // each role's tint: the one chosen for it, else the next colour its team does not use yet
  const tintByRole = new Map<string, TintKey>();
  for (const list of rolesByManager.values()) for (const [id, t] of tintsFor(list)) tintByRole.set(id, t);
  const membersByRole = new Map<string, Employee[]>();
  for (const e of activeEmployees) for (const rid of e.roleIds) membersByRole.set(rid, [...(membersByRole.get(rid) ?? []), e]);

  const ratingByKey = new Map(ds.ratings.map((r) => [`${r.employeeId}|${r.skillId}`, r]));
  const ratingsByEmp = new Map<string, Rating[]>();
  const ratingsBySkill = new Map<string, Rating[]>();
  for (const r of ds.ratings) {
    ratingsByEmp.set(r.employeeId, [...(ratingsByEmp.get(r.employeeId) ?? []), r]);
    ratingsBySkill.set(r.skillId, [...(ratingsBySkill.get(r.skillId) ?? []), r]);
  }

  // role -> skill -> RoleSkill, and skill -> the roles that ask for it
  const roleIndex = new Map<string, Map<string, RoleSkill>>();
  const rolesBySkill = new Map<string, string[]>();
  for (const rs of ds.roleSkills) {
    if (!roleById.has(rs.roleId)) continue;
    const bySkill = roleIndex.get(rs.roleId) ?? new Map<string, RoleSkill>();
    bySkill.set(rs.skillId, rs);
    roleIndex.set(rs.roleId, bySkill);
    rolesBySkill.set(rs.skillId, [...(rolesBySkill.get(rs.skillId) ?? []), rs.roleId]);
  }
  const needsByManager = new Map<string, TeamNeed[]>();
  for (const n of ds.teamNeeds) needsByManager.set(n.managerId, [...(needsByManager.get(n.managerId) ?? []), n]);

  // ---- hierarchy ----------------------------------------------------------------

  /** Everyone below a person, recursively (not the person). ALL: everyone active. */
  const reportsMemo = new Map<string, Employee[]>();
  function reportsOf(leaderId: string): Employee[] {
    if (leaderId === ALL) return activeEmployees;
    const hit = reportsMemo.get(leaderId);
    if (hit) return hit;
    const out: Employee[] = [];
    const stack = [leaderId];
    const seen = new Set<string>([leaderId]);
    while (stack.length) {
      const id = stack.pop()!;
      for (const e of directReports.get(id) ?? []) {
        if (seen.has(e.id)) continue; // a cycle in bad data must not hang the app
        seen.add(e.id);
        out.push(e);
        stack.push(e.id);
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    reportsMemo.set(leaderId, out);
    return out;
  }

  /** The team of a manager: the manager and everyone below them. ALL: everyone active. */
  const membersMemo = new Map<string, Employee[]>();
  function membersOf(leaderId: string): Employee[] {
    if (leaderId === ALL) return activeEmployees;
    const hit = membersMemo.get(leaderId);
    if (hit) return hit;
    const leader = empById.get(leaderId);
    const out = leader?.active ? [leader, ...reportsOf(leaderId)] : reportsOf(leaderId);
    membersMemo.set(leaderId, out);
    return out;
  }

  /** The managers above a person, nearest last. */
  function chainOf(employeeId: string): Employee[] {
    const out: Employee[] = [];
    const seen = new Set<string>([employeeId]);
    let cur = empById.get(employeeId);
    while (cur?.managerId && !seen.has(cur.managerId)) {
      seen.add(cur.managerId);
      const m = empById.get(cur.managerId);
      if (!m) break;
      out.unshift(m);
      cur = m;
    }
    return out;
  }

  // The top of the organisation leads people and has nobody (active) above them.
  function isTop(emp: Employee): boolean {
    const mgr = emp.managerId ? empById.get(emp.managerId) : undefined;
    return (!mgr || !mgr.active || mgr.id === emp.id) && isManager(emp);
  }
  const tops = activeEmployees.filter(isTop).sort((a, b) => reportsOf(b.id).length - reportsOf(a.id).length || a.name.localeCompare(b.name));

  /** Whether a person is asked to assess themselves (and so has targets and gaps). */
  function assesses(emp: Employee): boolean {
    if (!emp.active || isTop(emp)) return false;
    return settings.managersAssess || !isManager(emp);
  }

  /** The managers in a scope (the leader included): each one's team is a team. */
  function managersIn(leaderId: string): Employee[] {
    return membersOf(leaderId).filter(isManager);
  }

  function teamLabel(managerId: string): string {
    const m = empById.get(managerId);
    if (!m) return "";
    return m.teamName?.trim() || `${m.name}'s team`;
  }

  // ---- targets and levels ------------------------------------------------------

  /** Ratings waiting for confirmation among these people: a count, no profiles built. */
  function submittedCount(employeeIds: Iterable<string>): number {
    let n = 0;
    for (const id of employeeIds) {
      if (!empById.get(id)?.active) continue;
      for (const r of ratingsByEmp.get(id) ?? []) if (r.status === "submitted") n += 1;
    }
    return n;
  }

  /** What a person's roles ask of them in a skill: the highest level any of them asks for; a must-have when any says so. */
  function targetFor(emp: Employee, skillId: string): Target | null {
    if (!assesses(emp)) return null;
    let out: Target | null = null;
    for (const rid of emp.roleIds) {
      const rs = roleIndex.get(rid)?.get(skillId);
      if (!rs) continue;
      out = out ? { target: Math.max(out.target, rs.target), mandatory: out.mandatory || rs.mandatory, source: "role" } : { target: rs.target, mandatory: rs.mandatory, source: "role" };
    }
    return out;
  }

  const requiredMemo = new Map<string, string[]>();
  /** Skill ids an employee is expected to have (rateable ones only). */
  function requiredSkillIds(emp: Employee): string[] {
    const hit = requiredMemo.get(emp.id);
    if (hit) return hit;
    if (!assesses(emp)) { requiredMemo.set(emp.id, []); return []; }
    const ids = new Set<string>();
    for (const rid of emp.roleIds) for (const id of roleIndex.get(rid)?.keys() ?? []) ids.add(id);
    const out = [...ids].filter(isRateable);
    requiredMemo.set(emp.id, out);
    return out;
  }

  function levelOf(r: Rating | undefined, b: Basis = basis): { level: number | null; at: Date | null; stale: boolean } {
    if (!r) return { level: null, at: null, stale: false };
    const level = b === "validated" ? r.validatedLevel : r.selfLevel;
    const at = b === "validated" ? r.validatedAt : r.selfAt;
    if (level == null) return { level: null, at: null, stale: false };
    return { level, at, stale: !!at && at.getTime() < staleBefore };
  }
  const counts = (r: Rating | undefined, level: number) => {
    const l = levelOf(r);
    return l.level != null && l.level >= level && !(l.stale && settings.excludeStale);
  };

  const cellMemo = new Map<string, Cell>();
  function cell(emp: Employee, skillId: string): Cell {
    const key = `${emp.id}|${skillId}`;
    const hit = cellMemo.get(key);
    if (hit) return hit;
    const t = isRateable(skillId) ? targetFor(emp, skillId) : null;
    const r = ratingByKey.get(key);
    const { level, at, stale } = levelOf(r);
    const target = t?.target ?? null;
    const met = target != null && level != null && level >= target && !(stale && settings.excludeStale);
    const c: Cell = {
      employeeId: emp.id, skillId, target,
      mandatory: t?.mandatory ?? false,
      source: t?.source ?? null,
      level, at, stale, met,
      gap: target != null && level != null ? target - level : null,
      category: gapCategory(target, level),
      selfLevel: r?.selfLevel ?? null,
      validatedLevel: r?.validatedLevel ?? null,
      status: r?.status ?? null,
      interest: r?.interest ?? false,
    };
    cellMemo.set(key, c);
    return c;
  }

  // ---- aggregates ----------------------------------------------------------------

  function aggregate(emps: Employee[], skillFilter?: (skillId: string) => boolean): Aggregate {
    let required = 0, met = 0, assessed = 0, stale = 0, critical = 0, people = 0;
    for (const e of emps) {
      if (!assesses(e)) continue;
      people += 1;
      for (const sid of requiredSkillIds(e)) {
        if (skillFilter && !skillFilter(sid)) continue;
        const c = cell(e, sid);
        required += 1;
        if (c.met) met += 1;
        if (c.level != null) assessed += 1;
        if (c.stale) stale += 1;
        if (c.category === "critical" && c.mandatory) critical += 1;
      }
    }
    return { people, required, met, assessed, stale, critical, pct: pct(met, required) };
  }

  /**
   * How far a person's self-assessment has got: required skills rated, sent, confirmed,
   * and whether something still waits for them (not started, drafts, sent back, missing).
   */
  /** A person's share of required skills on target; null while nothing of theirs is confirmed
   *  (0% would read as failing when they are only waiting for their manager). */
  function onTargetOf(emp: Employee): number | null {
    return progress(emp).confirmed ? aggregate([emp]).pct : null;
  }

  function progress(emp: Employee) {
    const req = requiredSkillIds(emp);
    const rs = ratingsByEmp.get(emp.id) ?? [];
    const byId = new Map(rs.map((r) => [r.skillId, r]));
    const rated = req.filter((sid) => byId.get(sid)?.selfLevel != null).length;
    const confirmed = req.filter((sid) => byId.get(sid)?.validatedLevel != null).length;
    const drafts = rs.filter((r) => r.status === "draft" && r.selfLevel != null).length;
    const returned = rs.filter((r) => r.status === "returned").length;
    const waiting = rs.filter((r) => r.status === "submitted").length;
    const started = rs.some((r) => r.selfLevel != null);
    let state: "not_asked" | "not_started" | "in_progress" | "sent_back" | "waiting" | "done";
    if (!assesses(emp)) state = "not_asked";
    else if (returned) state = "sent_back";
    else if (!started) state = "not_started";
    else if (drafts || rated < req.length) state = "in_progress";
    else if (waiting) state = "waiting";
    else state = "done";
    return {
      state, required: req.length, rated, confirmed, drafts, returned, waiting,
      missing: req.filter((sid) => byId.get(sid)?.selfLevel == null),
      /** something is left for the person to do */
      needsAction: state === "not_started" || state === "in_progress" || state === "sent_back",
    };
  }

  // ---- team needs and coverage ---------------------------------------------------

  /** What the team's roles imply it needs, whatever the manager set or took off: one person
   *  at the lowest level asked, for every must-have at least two direct reports' roles ask for. */
  function impliedDemands(managerId: string): Demand[] {
    const implicit = new Map<string, { level: number; requirers: number }>();
    for (const e of directReports.get(managerId) ?? []) {
      for (const sid of requiredSkillIds(e)) {
        const t = targetFor(e, sid);
        if (!t || !t.mandatory) continue;
        const prev = implicit.get(sid);
        implicit.set(sid, { level: prev ? Math.min(prev.level, t.target) : t.target, requirers: (prev?.requirers ?? 0) + 1 });
      }
    }
    const out: Demand[] = [];
    for (const [sid, d] of implicit) if (d.requirers >= MIN_REQUIRERS) out.push({ managerId, skillId: sid, level: d.level, headcount: 1, explicit: false });
    return out;
  }

  const demandMemo = new Map<string, Demand[]>();
  /** What a manager's team needs: the manager's own list, plus what the roles imply. */
  function demands(managerId: string): Demand[] {
    const hit = demandMemo.get(managerId);
    if (hit) return hit;
    const out = new Map<string, Demand>();
    const dismissed = new Set<string>();
    for (const n of needsByManager.get(managerId) ?? []) {
      if (n.dismissed) { dismissed.add(n.skillId); continue; }
      if (!isRateable(n.skillId)) continue;
      out.set(n.skillId, { managerId, skillId: n.skillId, level: n.minLevel, headcount: Math.max(1, n.headcount), explicit: true });
    }
    for (const d of impliedDemands(managerId)) if (!out.has(d.skillId) && !dismissed.has(d.skillId)) out.set(d.skillId, d);
    const list = [...out.values()];
    demandMemo.set(managerId, list);
    return list;
  }

  function holdersOf(emps: Employee[], skillId: string, level: number): Employee[] {
    return emps.filter((e) => counts(ratingByKey.get(`${e.id}|${skillId}`), level));
  }

  const coverageMemo = new Map<string, Coverage>();
  function coverage(d: Demand): Coverage {
    const key = `${d.managerId}|${d.skillId}|${d.level}|${d.headcount}|${d.explicit}`;
    const hit = coverageMemo.get(key);
    if (hit) return hit;
    const holders = holdersOf(membersOf(d.managerId), d.skillId, d.level);
    const count = holders.length;
    const c: Coverage = { ...d, holders: holders.map((h) => h.id), count, shortfall: Math.max(0, d.headcount - count), spof: count === 1 && d.headcount <= 1, critical: count === 0 };
    coverageMemo.set(key, c);
    return c;
  }

  const coverageInMemo = new Map<string, Coverage[]>();
  /** Every team need inside a scope (the leader's own team and every team below). */
  function coverageIn(leaderId: string): Coverage[] {
    let hit = coverageInMemo.get(leaderId);
    if (!hit) { hit = managersIn(leaderId).flatMap((m) => demands(m.id).map(coverage)); coverageInMemo.set(leaderId, hit); }
    return hit;
  }

  /** Team needs that are short or rest on one person, worst first: nobody holds it, then
   *  by how many people are missing, then a single holder. */
  function shortNeeds(leaderId: string): Coverage[] {
    const rank = (c: Coverage) => (c.critical ? 1000 : 0) + c.shortfall * 10 + (c.spof ? 1 : 0);
    return coverageIn(leaderId)
      .filter((c) => c.shortfall > 0 || c.spof)
      .sort((a, b) => rank(b) - rank(a) || skillLabel(a.skillId).localeCompare(skillLabel(b.skillId)));
  }

  /** People outside a team who hold a skill at a level (to strengthen it from elsewhere). */
  function holdersOutside(managerId: string, skillId: string, level: number): Employee[] {
    const inside = new Set(membersOf(managerId).map((e) => e.id));
    const out: Employee[] = [];
    for (const r of ratingsBySkill.get(skillId) ?? []) {
      const e = empById.get(r.employeeId);
      if (!e?.active || inside.has(e.id) || !counts(r, level)) continue;
      out.push(e);
    }
    return out.sort((a, b) => (levelOf(ratingByKey.get(`${b.id}|${skillId}`)).level ?? 0) - (levelOf(ratingByKey.get(`${a.id}|${skillId}`)).level ?? 0) || a.name.localeCompare(b.name));
  }

  /**
   * The other teams a person could strengthen: teams they are not in whose short needs
   * they already meet, the teams where they meet the most first.
   */
  // every short need in the organisation, by skill: built once, so "who could strengthen
  // another team" costs one look per rating a person has, not one per team
  let shortBySkill: Map<string, Coverage[]> | null = null;
  function shortIndex() {
    if (shortBySkill) return shortBySkill;
    shortBySkill = new Map();
    for (const c of coverageIn(ALL)) {
      if (!(c.shortfall > 0 || c.spof)) continue;
      shortBySkill.set(c.skillId, [...(shortBySkill.get(c.skillId) ?? []), c]);
    }
    return shortBySkill;
  }
  function fitsFor(emp: Employee, limit = 5): Fit[] {
    const idx = shortIndex();
    const mine = new Set([...chainOf(emp.id).map((m) => m.id), emp.id]);
    const byTeam = new Map<string, Fit["skills"]>();
    for (const r of ratingsByEmp.get(emp.id) ?? []) {
      for (const c of idx.get(r.skillId) ?? []) {
        if (mine.has(c.managerId) || !counts(r, c.level)) continue;
        byTeam.set(c.managerId, [...(byTeam.get(c.managerId) ?? []), { skillId: c.skillId, level: c.level, has: levelOf(r).level ?? 0 }]);
      }
    }
    return [...byTeam].map(([managerId, skills]) => ({ managerId, skills }))
      .sort((a, b) => b.skills.length - a.skills.length || teamLabel(a.managerId).localeCompare(teamLabel(b.managerId))).slice(0, limit);
  }

  /**
   * The roles of OTHER teams a person's skills match: the share of a role's skills they hold at
   * the level it asks for, from minPct upwards, best first. Their own team's roles (their
   * manager's, and the ones of a team they lead) are left out: this is about a different team.
   */
  function roleFits(emp: Employee, minPct: number = settings.fitPercent, limit = 20): RoleFit[] {
    const floor = Math.max(1, Math.min(100, minPct || 1));
    // only roles that ask for something the person has rated can match at all
    const candidates = new Set<string>();
    for (const r of ratingsByEmp.get(emp.id) ?? []) for (const rid of rolesBySkill.get(r.skillId) ?? []) candidates.add(rid);
    const out: RoleFit[] = [];
    for (const rid of candidates) {
      const role = roleById.get(rid);
      if (!role || role.managerId === emp.managerId || role.managerId === emp.id) continue;
      if (!empById.get(role.managerId)?.active) continue;
      const matched: RoleFit["matched"] = [];
      const missing: RoleFit["missing"] = [];
      for (const rs of roleIndex.get(rid)?.values() ?? []) {
        if (!isRateable(rs.skillId)) continue;
        const r = ratingByKey.get(`${emp.id}|${rs.skillId}`);
        const level = levelOf(r).level;
        if (counts(r, rs.target)) matched.push({ skillId: rs.skillId, level: level!, target: rs.target });
        else missing.push({ skillId: rs.skillId, level, target: rs.target });
      }
      const total = matched.length + missing.length;
      if (!total) continue;
      const p = Math.round((matched.length / total) * 100);
      if (p >= floor) out.push({ roleId: rid, managerId: role.managerId, matched, missing, pct: p });
    }
    return out.sort((a, b) => b.pct - a.pct || b.matched.length - a.matched.length || teamLabel(a.managerId).localeCompare(teamLabel(b.managerId))).slice(0, limit);
  }

  /** Individual gaps: each person below their own target, or not assessed yet. */
  function individualGaps(emps: Employee[]) {
    const out: { employeeId: string; skillId: string; target: number; level: number | null; gap: number; category: GapCategory; interest: boolean; mandatory: boolean }[] = [];
    for (const e of emps) {
      for (const sid of requiredSkillIds(e)) {
        const c = cell(e, sid);
        if (c.target == null || c.met) continue;
        out.push({ employeeId: e.id, skillId: sid, target: c.target, level: c.level, gap: c.level == null ? c.target : c.gap!, category: c.category, interest: c.interest, mandatory: c.mandatory });
      }
    }
    const rank: Record<string, number> = { critical: 4, significant: 3, minor: 2, unassessed: 1 };
    return out.filter((g) => g.gap > 0 || g.level == null)
      .sort((a, b) => (rank[b.category] ?? 0) - (rank[a.category] ?? 0) || Number(b.mandatory) - Number(a.mandatory) || b.gap - a.gap);
  }

  function kpis(leaderId: string) {
    const emps = membersOf(leaderId);
    const agg = aggregate(emps);
    const cov = coverageIn(leaderId);
    let pending = 0, notStarted = 0, done = 0, asked = 0;
    for (const e of emps) {
      for (const r of ratingsByEmp.get(e.id) ?? []) if (r.status === "submitted") pending += 1;
      if (!assesses(e)) continue;
      asked += 1;
      const p = progress(e);
      if (p.state === "not_started") notStarted += 1;
      if (p.state === "done" || p.state === "waiting") done += 1;
    }
    return {
      people: emps.length,
      asked,
      done,
      notStarted,
      required: agg.required,
      assessedPct: pct(agg.assessed, agg.required),
      onTargetPct: agg.pct,
      donePct: pct(done, asked),
      needs: cov.length,
      short: cov.filter((c) => c.shortfall > 0).length,
      nobody: cov.filter((c) => c.critical).length,
      spof: cov.filter((c) => c.spof).length,
      pendingConfirmation: pending,
    };
  }

  // ---- heatmaps ------------------------------------------------------------------

  type Column = { id: string; name: string; categoryId: string };

  function columnsFor(categoryId?: string | null): Column[] {
    if (!categoryId) {
      return [...ds.categories].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
        .map((c) => ({ id: c.id, name: c.name, categoryId: c.id }));
    }
    return ds.skills.filter((s) => s.categoryId === categoryId && isRateable(s.id))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
      .map((s) => ({ id: s.id, name: skillLabel(s.id), categoryId }));
  }

  /** Rows = the teams directly below a leader (plus their own direct reports who lead
   *  nobody, as one row); columns = categories, or the skills of one category. */
  function teamHeatmap(leaderId: string, o: { categoryId?: string | null } = {}) {
    const cols = columnsFor(o.categoryId);
    const colFilter = (col: Column) => (sid: string) => (o.categoryId ? sid === col.id : skillById.get(sid)?.categoryId === col.id);
    const inCat = o.categoryId ? (sid: string) => skillById.get(sid)?.categoryId === o.categoryId : undefined;
    // the whole organisation under one head opens one level down: one row saying "everyone" says nothing
    const below = leaderId === ALL ? (tops.length === 1 ? directReports.get(tops[0].id) ?? [] : tops) : (directReports.get(leaderId) ?? []);
    const rowDefs: { id: string; name: string; emps: Employee[]; drill: string | null }[] = [];
    const individuals: Employee[] = [];
    for (const d of below) {
      if (isManager(d)) rowDefs.push({ id: d.id, name: teamLabel(d.id), emps: membersOf(d.id), drill: d.id });
      else individuals.push(d);
    }
    if (leaderId === ALL) individuals.push(...activeEmployees.filter((e) => !isManager(e) && !(e.managerId && empById.get(e.managerId)?.active)));
    if (individuals.length) rowDefs.push({ id: `${leaderId}:direct`, name: leaderId === ALL ? "Not in a team" : `Reporting to ${empById.get(leaderId)?.name ?? ""} directly`, emps: individuals, drill: null });
    const rows = rowDefs.map((r) => ({
      id: r.id, name: r.name, drill: r.drill, people: r.emps.length,
      total: aggregate(r.emps, inCat),
      cells: Object.fromEntries(cols.map((c) => [c.id, aggregate(r.emps, colFilter(c))])) as Record<string, Aggregate>,
    })).filter((r) => r.people > 0);
    const all = rowDefs.flatMap((r) => r.emps);
    return { rows, columns: cols.map((c) => ({ ...c, total: aggregate(all, colFilter(c)) })), total: aggregate(all, inCat) };
  }

  /** Rows = people (a manager's direct reports, or everyone below), columns = skills. */
  function peopleHeatmap(leaderId: string, o: { everyone?: boolean; categoryId?: string | null; hideMet?: boolean; includeRated?: boolean } = {}) {
    const emps = o.everyone ? reportsOf(leaderId) : (directReports.get(leaderId) ?? []);
    const skillIds = new Set<string>();
    for (const e of emps) {
      for (const sid of requiredSkillIds(e)) skillIds.add(sid);
      if (o.includeRated) for (const r of ratingsByEmp.get(e.id) ?? []) if (isRateable(r.skillId) && levelOf(r).level != null) skillIds.add(r.skillId);
    }
    const covBySkill = new Map<string, Coverage>();
    if (leaderId !== ALL) for (const d of demands(leaderId)) { skillIds.add(d.skillId); covBySkill.set(d.skillId, coverage(d)); }
    let skills = [...skillIds].map((id) => skillById.get(id)!).filter(Boolean).filter((s) => !o.categoryId || s.categoryId === o.categoryId);
    if (o.hideMet) {
      skills = skills.filter((s) => emps.some((e) => { const c = cell(e, s.id); return c.target != null && !c.met; })
        || (covBySkill.get(s.id)?.shortfall ?? 0) > 0 || covBySkill.get(s.id)?.spof);
    }
    const catSort = new Map(ds.categories.map((c) => [c.id, c.sort]));
    skills.sort((a, b) => (catSort.get(a.categoryId) ?? 0) - (catSort.get(b.categoryId) ?? 0)
      || (categoryById.get(a.categoryId)?.name ?? "").localeCompare(categoryById.get(b.categoryId)?.name ?? "")
      || (a.sort ?? 0) - (b.sort ?? 0) || skillLabel(a.id).localeCompare(skillLabel(b.id)));
    const rows = emps.map((e) => {
      const cells = Object.fromEntries(skills.map((s) => [s.id, cell(e, s.id)])) as Record<string, Cell>;
      return { employee: e, cells, onTargetPct: onTargetOf(e), worst: Object.values(cells).filter((c) => c.target != null && !c.met).length };
    }).sort((a, b) => b.worst - a.worst || a.employee.name.localeCompare(b.employee.name));
    const columns = skills.map((s) => ({
      id: s.id, name: skillLabel(s.id), categoryId: s.categoryId,
      category: categoryById.get(s.categoryId)?.name ?? "",
      coverage: covBySkill.get(s.id) ?? null,
    }));
    return { rows, columns };
  }

  // ---- people and skills ------------------------------------------------------------

  const profileMemo = new Map<string, ReturnType<typeof buildProfile>>();
  function personProfile(emp: Employee) {
    const hit = profileMemo.get(emp.id);
    if (hit && empById.get(emp.id) === emp) return hit;
    const p = buildProfile(emp);
    if (empById.get(emp.id) === emp) profileMemo.set(emp.id, p);
    return p;
  }

  function buildProfile(emp: Employee) {
    const req = requiredSkillIds(emp);
    const rated = (ratingsByEmp.get(emp.id) ?? []).map((r) => r.skillId).filter(isRateable);
    const cells = [...new Set([...req, ...rated])].map((sid) => cell(emp, sid));
    const agg = aggregate([emp]);
    return { cells, fitPct: agg.pct, required: agg.required, met: agg.met };
  }

  /**
   * The talent a scope has, in one pass over its people: per skill, how many hold it and
   * how well, how many need it and how many of those are on target, who has it without
   * their role asking for it, and who wants it; levels by category.
   */
  const talentMemo = new Map<string, Talent>();
  function talent(leaderId: string): Talent {
    const hit = talentMemo.get(leaderId);
    if (hit) return hit;
    const emps = membersOf(leaderId);
    const skills = new Map<string, TalentSkill>();
    const at = (sid: string) => {
      let x = skills.get(sid);
      if (!x) { x = { skillId: sid, holders: 0, proficient: 0, expert: 0, needed: 0, onTarget: 0, extra: 0, interested: 0 }; skills.set(sid, x); }
      return x;
    };
    const byCategory = new Map<string, number[]>();
    let rated = 0;
    for (const e of emps) {
      const req = new Set(requiredSkillIds(e));
      for (const sid of req) {
        const x = at(sid);
        x.needed += 1;
        if (cell(e, sid).met) x.onTarget += 1;
      }
      let any = false;
      for (const r of ratingsByEmp.get(e.id) ?? []) {
        if (!isRateable(r.skillId)) continue;
        const x = at(r.skillId);
        if (r.interest) x.interested += 1;
        const lvl = levelOf(r).level;
        if (lvl == null) continue;
        any = true;
        if (lvl >= 1) x.holders += 1;
        if (lvl >= 3) { x.proficient += 1; if (!req.has(r.skillId)) x.extra += 1; }
        if (lvl >= 4) x.expert += 1;
        const cat = skillById.get(r.skillId)?.categoryId ?? "";
        const dist = byCategory.get(cat) ?? [0, 0, 0, 0, 0, 0];
        dist[Math.max(0, Math.min(5, lvl))] += 1;
        byCategory.set(cat, dist);
      }
      if (any) rated += 1;
    }
    const out: Talent = { people: emps.length, rated, skills, byCategory };
    talentMemo.set(leaderId, out);
    return out;
  }

  function skillStats(skillId: string, leaderId: string) {
    const emps = membersOf(leaderId);
    const distribution = [0, 0, 0, 0, 0, 0];
    let unassessed = 0;
    const people: Cell[] = [];
    for (const e of emps) {
      const c = cell(e, skillId);
      if (c.level == null && c.target == null) continue;
      if (c.level == null) unassessed += 1;
      else distribution[Math.max(0, Math.min(5, c.level))] += 1;
      people.push(c);
    }
    return { distribution, unassessed, people, coverage: coverageIn(leaderId).filter((c) => c.skillId === skillId) };
  }

  /** People finder: everyone in scope at or above a level in a skill, best first. */
  function find(leaderId: string, skillId: string, minLevel: number) {
    return membersOf(leaderId)
      .map((e) => ({ e, c: cell(e, skillId) }))
      .filter(({ c }) => c.level != null && c.level >= minLevel)
      .sort((a, b) => (b.c.level ?? 0) - (a.c.level ?? 0) || a.e.name.localeCompare(b.e.name));
  }

  function skillLabel(skillId: string): string {
    const s = skillById.get(skillId);
    if (!s) return "";
    const p = s.parentId ? skillById.get(s.parentId) : undefined;
    return p ? `${p.name} › ${s.name}` : s.name;
  }

  /** Precompute what most pages read, once per data version (see warmEngine). */
  function warm() {
    for (const id of directReports.keys()) membersOf(id);
    coverageIn(ALL);
    shortIndex();
    talent(ALL);
  }

  return {
    basis,
    settings,
    warm,
    tops,
    empById,
    skillById,
    categoryById,
    gradeById,
    roleById,
    roles: ds.roles,
    /** the roles of one team, in the manager's order */
    rolesOf: (managerId: string) => rolesByManager.get(managerId) ?? [],
    /** a role's tint (a key of role-colors.ts) */
    roleTint: (roleId: string): TintKey => tintByRole.get(roleId) ?? "slate",
    /** the people (active) in a role */
    roleMembers: (roleId: string) => membersByRole.get(roleId) ?? [],
    /** the skills a role asks for */
    roleSkillsOf: (roleId: string) => [...(roleIndex.get(roleId)?.values() ?? [])],
    roleFits,
    grades: ds.grades,
    categories: ds.categories,
    activeEmployees,
    directReportsOf: (employeeId: string) => directReports.get(employeeId) ?? [],
    reportsOf,
    membersOf,
    managersIn,
    chainOf,
    isManager,
    isTop,
    assesses,
    teamLabel,
    submittedCount,
    ratingsOf: (employeeId: string) => ratingsByEmp.get(employeeId) ?? [],
    isRateable,
    targetFor,
    requiredSkillIds,
    levelOf: (employeeId: string, skillId: string, b?: Basis) => levelOf(ratingByKey.get(`${employeeId}|${skillId}`), b),
    rating: (employeeId: string, skillId: string) => ratingByKey.get(`${employeeId}|${skillId}`),
    cell,
    aggregate,
    progress,
    onTargetOf,
    demands,
    impliedDemands,
    coverage,
    coverageIn,
    shortNeeds,
    holdersOutside,
    fitsFor,
    individualGaps,
    kpis,
    teamHeatmap,
    peopleHeatmap,
    personProfile,
    talent,
    skillStats,
    find,
    skillLabel,
  };
}

export type Engine = ReturnType<typeof createEngine>;
