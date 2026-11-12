// The skills engine: every number the app shows is computed here, from a plain
// in-memory dataset. No database, no framework imports, so it is unit-tested
// directly (test/engine.test.ts) and every page agrees with every other page.
//
// Rules (IDEAS.md sections 1, 3, 4, 5):
//  * Required level precedence: a manager's per-person target > the role's
//    grade-specific target > the role's all-grades target. The source is reported.
//  * "Not assessed" (no level) is never treated as 0.
//  * Gap = target - level. 0 or less: meets. 1: minor. 2: significant.
//    3+: critical; also critical when the target is Proficient (3) or above and
//    the level is Awareness (1) or below.
//  * A rating older than settings.staleMonths is stale. It still shows, flagged;
//    settings.excludeStale decides whether it counts as on target.
//  * Roll-ups count (person, required skill) pairs at or above target. Levels are
//    never averaged across people: an average hides one expert and four novices.
//  * Team demand: an explicit unit requirement (N people at level L), else an
//    implicit one for every mandatory skill a direct member's role needs:
//    1 person at the role baseline (the lowest such target in the team), and only
//    when at least two members need it - a skill one person alone is expected to
//    have is that person's gap, not a team bus-factor risk. A stricter or
//    different need is what an explicit requirement is for. Coverage = members at or above L.
//  * Capability only: the engine reports what is short and where, never what to
//    do about it (no hire / train suggestions - owner, 2026-11-12).

export type Basis = "validated" | "self";
export type GapCategory = "meets" | "minor" | "significant" | "critical" | "unassessed" | "not_required";
export type TargetSource = "person" | "grade" | "role";

export interface Settings {
  staleMonths: number;
  excludeStale: boolean;
  /** on-target % at or above which an aggregate cell is green */
  greenAt: number;
  /** on-target % at or above which an aggregate cell is amber (below: red) */
  amberAt: number;
}

export const DEFAULT_SETTINGS: Settings = { staleMonths: 12, excludeStale: false, greenAt: 85, amberAt: 60 };

export interface Unit { id: string; name: string; kind: string; parentId: string | null; managerId: string | null; sort?: number }
export interface Employee {
  id: string; name: string; email: string; title: string; unitId: string | null;
  roleId: string | null; gradeId: string | null; managerId: string | null; active: boolean; location?: string;
}
export interface Category { id: string; name: string; sort: number }
export interface Skill { id: string; name: string; categoryId: string; parentId: string | null; status: string; sort?: number }
export interface Role { id: string; name: string }
export interface Grade { id: string; name: string; rank: number }
export interface RoleSkill { roleId: string; gradeId: string | null; skillId: string; target: number; mandatory: boolean }
export interface UnitRequirement { unitId: string; skillId: string; minLevel: number; headcount: number }
export interface EmployeeTarget { employeeId: string; skillId: string; target: number; reason: string }
export interface Rating {
  employeeId: string; skillId: string;
  selfLevel: number | null; selfAt: Date | null;
  validatedLevel: number | null; validatedAt: Date | null;
  interest: boolean; status: string;
}

export interface Dataset {
  now: number;
  settings: Settings;
  units: Unit[];
  employees: Employee[];
  categories: Category[];
  skills: Skill[];
  roles: Role[];
  grades: Grade[];
  roleSkills: RoleSkill[];
  unitRequirements: UnitRequirement[];
  employeeTargets: EmployeeTarget[];
  ratings: Rating[];
}

export interface Target { target: number; mandatory: boolean; source: TargetSource; reason?: string }

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

export interface Demand {
  unitId: string;
  skillId: string;
  level: number;
  headcount: number;
  explicit: boolean;
}

export interface Coverage extends Demand {
  holders: string[];
  count: number;
  shortfall: number;
  spof: boolean;
  critical: boolean;
}

const DAY = 86400e3;
/** Members who must need a mandatory skill before the team as a whole is said to need it. */
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
  const settings = ds.settings;
  const staleBefore = ds.now - settings.staleMonths * 30.4375 * DAY;

  const unitById = new Map(ds.units.map((u) => [u.id, u]));
  const children = new Map<string, Unit[]>();
  for (const u of ds.units) {
    if (u.parentId && unitById.has(u.parentId)) {
      const list = children.get(u.parentId) ?? [];
      list.push(u);
      children.set(u.parentId, list);
    }
  }
  for (const list of children.values()) list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));

  const roots = ds.units.filter((u) => !u.parentId || !unitById.has(u.parentId));
  const activeEmployees = ds.employees.filter((e) => e.active);
  const empById = new Map(ds.employees.map((e) => [e.id, e]));
  const directMembers = new Map<string, Employee[]>();
  for (const e of activeEmployees) {
    if (!e.unitId) continue;
    const list = directMembers.get(e.unitId) ?? [];
    list.push(e);
    directMembers.set(e.unitId, list);
  }
  for (const list of directMembers.values()) list.sort((a, b) => a.name.localeCompare(b.name));

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

  const ratingByKey = new Map(ds.ratings.map((r) => [`${r.employeeId}|${r.skillId}`, r]));
  const ratingsByEmp = new Map<string, Rating[]>();
  for (const r of ds.ratings) {
    const list = ratingsByEmp.get(r.employeeId) ?? [];
    list.push(r);
    ratingsByEmp.set(r.employeeId, list);
  }

  // role -> grade ("" = all grades) -> skill -> RoleSkill
  const roleIndex = new Map<string, Map<string, Map<string, RoleSkill>>>();
  for (const rs of ds.roleSkills) {
    const byGrade = roleIndex.get(rs.roleId) ?? new Map();
    const g = rs.gradeId ?? "";
    const bySkill = byGrade.get(g) ?? new Map();
    bySkill.set(rs.skillId, rs);
    byGrade.set(g, bySkill);
    roleIndex.set(rs.roleId, byGrade);
  }
  const personTargets = new Map<string, Map<string, EmployeeTarget>>();
  for (const t of ds.employeeTargets) {
    const m = personTargets.get(t.employeeId) ?? new Map();
    m.set(t.skillId, t);
    personTargets.set(t.employeeId, m);
  }
  const unitReqs = new Map<string, UnitRequirement[]>();
  for (const r of ds.unitRequirements) {
    const list = unitReqs.get(r.unitId) ?? [];
    list.push(r);
    unitReqs.set(r.unitId, list);
  }

  // ---- hierarchy ----------------------------------------------------------------

  const subtreeMemo = new Map<string, string[]>();
  function subtreeUnitIds(unitId: string): string[] {
    const hit = subtreeMemo.get(unitId);
    if (hit) return hit;
    const out: string[] = [];
    const stack = [unitId];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue; // a cycle in bad data must not hang the app
      seen.add(id);
      out.push(id);
      for (const c of children.get(id) ?? []) stack.push(c.id);
    }
    subtreeMemo.set(unitId, out);
    return out;
  }

  const membersMemo = new Map<string, Employee[]>();
  function membersOf(unitId: string): Employee[] {
    const hit = membersMemo.get(unitId);
    if (hit) return hit;
    const out = subtreeUnitIds(unitId).flatMap((id) => directMembers.get(id) ?? []);
    membersMemo.set(unitId, out);
    return out;
  }

  function ancestors(unitId: string): Unit[] {
    const out: Unit[] = [];
    const seen = new Set<string>();
    let u = unitById.get(unitId);
    while (u && u.parentId && !seen.has(u.parentId)) {
      seen.add(u.parentId);
      const p = unitById.get(u.parentId);
      if (!p) break;
      out.unshift(p);
      u = p;
    }
    return out;
  }

  /** Units managed by an employee, either as unit manager or through direct reports' units. */
  function managedUnitIds(employeeId: string): string[] {
    return ds.units.filter((u) => u.managerId === employeeId).map((u) => u.id);
  }

  /** Everyone an employee may see and validate: their managed units' members plus reports, recursively. */
  function reportsOf(employeeId: string): Employee[] {
    const out = new Map<string, Employee>();
    for (const uid of managedUnitIds(employeeId)) for (const e of membersOf(uid)) if (e.id !== employeeId) out.set(e.id, e);
    const stack = [employeeId];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const e of activeEmployees) {
        if (e.managerId === id && e.id !== employeeId) {
          out.set(e.id, e);
          stack.push(e.id);
        }
      }
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---- targets and levels ------------------------------------------------------

  // The top of the organisation is not asked for skills: nobody above them (no manager, or
  // one who has left) and people below them (direct reports, or the top unit they lead).
  // No targets, nothing required, so they count in no roll-up, gap or implied team need.
  const leadsPeople = new Set(ds.employees.filter((e) => e.active && e.managerId).map((e) => e.managerId!));
  const leadsTopUnit = new Set(ds.units.filter((u) => !u.parentId && u.managerId).map((u) => u.managerId!));
  function isTop(emp: Employee): boolean {
    const mgr = emp.managerId ? empById.get(emp.managerId) : undefined;
    return (!mgr || !mgr.active) && (leadsPeople.has(emp.id) || leadsTopUnit.has(emp.id));
  }

  function targetFor(emp: Employee, skillId: string): Target | null {
    if (isTop(emp)) return null;
    const byGrade = emp.roleId ? roleIndex.get(emp.roleId) : undefined;
    const graded = emp.gradeId ? byGrade?.get(emp.gradeId)?.get(skillId) : undefined;
    const general = byGrade?.get("")?.get(skillId);
    const roleRow = graded ?? general;
    const person = personTargets.get(emp.id)?.get(skillId);
    if (person) {
      return { target: person.target, mandatory: roleRow?.mandatory ?? true, source: "person", reason: person.reason };
    }
    if (graded) return { target: graded.target, mandatory: graded.mandatory, source: "grade" };
    if (general) return { target: general.target, mandatory: general.mandatory, source: "role" };
    return null;
  }

  const requiredMemo = new Map<string, string[]>();
  /** Skill ids an employee is expected to have (rateable ones only). */
  function requiredSkillIds(emp: Employee): string[] {
    const hit = requiredMemo.get(emp.id);
    if (hit) return hit;
    if (isTop(emp)) { requiredMemo.set(emp.id, []); return []; }
    const ids = new Set<string>();
    const byGrade = emp.roleId ? roleIndex.get(emp.roleId) : undefined;
    for (const id of byGrade?.get("")?.keys() ?? []) ids.add(id);
    if (emp.gradeId) for (const id of byGrade?.get(emp.gradeId)?.keys() ?? []) ids.add(id);
    for (const id of personTargets.get(emp.id)?.keys() ?? []) ids.add(id);
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
      employeeId: emp.id,
      skillId,
      target,
      mandatory: t?.mandatory ?? false,
      source: t?.source ?? null,
      level,
      at,
      stale,
      met,
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
    let required = 0, met = 0, assessed = 0, stale = 0, critical = 0;
    for (const e of emps) {
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
    return { people: emps.length, required, met, assessed, stale, critical, pct: pct(met, required) };
  }

  // ---- team demand and coverage ---------------------------------------------------

  const demandMemo = new Map<string, Demand[]>();
  function demands(unitId: string): Demand[] {
    const hit = demandMemo.get(unitId);
    if (hit) return hit;
    const out = new Map<string, Demand>();
    for (const r of unitReqs.get(unitId) ?? []) {
      if (!isRateable(r.skillId)) continue;
      out.set(r.skillId, { unitId, skillId: r.skillId, level: r.minLevel, headcount: Math.max(1, r.headcount), explicit: true });
    }
    const implicit = new Map<string, { level: number; requirers: number }>();
    for (const e of directMembers.get(unitId) ?? []) {
      for (const sid of requiredSkillIds(e)) {
        if (out.get(sid)?.explicit) continue;
        const t = targetFor(e, sid);
        if (!t || !t.mandatory) continue;
        const prev = implicit.get(sid);
        implicit.set(sid, { level: prev ? Math.min(prev.level, t.target) : t.target, requirers: (prev?.requirers ?? 0) + 1 });
      }
    }
    for (const [sid, d] of implicit) {
      if (d.requirers >= MIN_REQUIRERS) out.set(sid, { unitId, skillId: sid, level: d.level, headcount: 1, explicit: false });
    }
    const list = [...out.values()];
    demandMemo.set(unitId, list);
    return list;
  }

  function holdersOf(emps: Employee[], skillId: string, level: number): Employee[] {
    return emps.filter((e) => {
      const { level: l, stale } = levelOf(ratingByKey.get(`${e.id}|${skillId}`));
      return l != null && l >= level && !(stale && settings.excludeStale);
    });
  }

  function coverage(d: Demand): Coverage {
    const holders = holdersOf(membersOf(d.unitId), d.skillId, d.level);
    const count = holders.length;
    return {
      ...d,
      holders: holders.map((h) => h.id),
      count,
      shortfall: Math.max(0, d.headcount - count),
      spof: count === 1,
      critical: count === 0,
    };
  }

  function coverageIn(scopeUnitId: string): Coverage[] {
    return subtreeUnitIds(scopeUnitId).flatMap((uid) => demands(uid).map(coverage));
  }

  /** Team needs that are short or rest on one person, worst first: nobody holds it,
   *  then by how many people are missing, then a single holder. Capability only. */
  function shortNeeds(scopeUnitId: string): Coverage[] {
    const rank = (c: Coverage) => (c.critical ? 1000 : 0) + c.shortfall * 10 + (c.spof ? 1 : 0);
    return coverageIn(scopeUnitId)
      .filter((c) => c.shortfall > 0 || c.spof)
      .sort((a, b) => rank(b) - rank(a)
        || (skillById.get(a.skillId)?.name ?? "").localeCompare(skillById.get(b.skillId)?.name ?? ""));
  }

  /** Individual gaps: each person below their own target, or not assessed yet. */
  function individualGaps(emps: Employee[]) {
    const out: { employeeId: string; skillId: string; target: number; level: number | null; gap: number; category: GapCategory; interest: boolean; mandatory: boolean }[] = [];
    for (const e of emps) {
      for (const sid of requiredSkillIds(e)) {
        const c = cell(e, sid);
        if (c.target == null || c.met) continue;
        if (c.level == null) {
          out.push({ employeeId: e.id, skillId: sid, target: c.target, level: null, gap: c.target, category: c.category, interest: c.interest, mandatory: c.mandatory });
        } else if (c.gap! > 0) {
          out.push({ employeeId: e.id, skillId: sid, target: c.target, level: c.level, gap: c.gap!, category: c.category, interest: c.interest, mandatory: c.mandatory });
        }
      }
    }
    const rank: Record<string, number> = { critical: 4, significant: 3, minor: 2, unassessed: 1 };
    return out.sort((a, b) => (rank[b.category] ?? 0) - (rank[a.category] ?? 0) || Number(b.mandatory) - Number(a.mandatory) || b.gap - a.gap);
  }

  /** Self minus validated, per team: a delta above 1 means the scale is read two ways.
   *  Only units with two or more people of their own: one person is not a team average. */
  function calibration(scopeUnitId: string) {
    const out: { unitId: string; n: number; delta: number }[] = [];
    for (const uid of subtreeUnitIds(scopeUnitId)) {
      if ((directMembers.get(uid) ?? []).length < 2) continue;
      let n = 0, sum = 0;
      for (const e of directMembers.get(uid) ?? []) {
        for (const r of ratingsByEmp.get(e.id) ?? []) {
          if (r.selfLevel == null || r.validatedLevel == null) continue;
          n += 1;
          sum += r.selfLevel - r.validatedLevel;
        }
      }
      if (n >= 3) out.push({ unitId: uid, n, delta: Math.round((sum / n) * 100) / 100 });
    }
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  function kpis(scopeUnitId: string, emps: Employee[] = membersOf(scopeUnitId)) {
    const agg = aggregate(emps);
    const cov = coverageIn(scopeUnitId);
    const empIds = new Set(emps.map((e) => e.id));
    let validated = 0, staleValidated = 0, pending = 0;
    for (const r of ds.ratings) {
      if (!empIds.has(r.employeeId)) continue;
      if (r.status === "submitted") pending += 1;
      if (r.validatedLevel != null && r.validatedAt) {
        validated += 1;
        if (r.validatedAt.getTime() < staleBefore) staleValidated += 1;
      }
    }
    return {
      people: emps.length,
      required: agg.required,
      assessedPct: pct(agg.assessed, agg.required),
      onTargetPct: agg.pct,
      criticalGaps: cov.filter((c) => c.critical).length,
      spof: cov.filter((c) => c.spof).length,
      stalePct: pct(staleValidated, validated),
      pendingValidation: pending,
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

  /** Rows = child units (plus the scope's own direct members as one row), columns = categories or skills. */
  function unitHeatmap(scopeUnitId: string, o: { categoryId?: string | null; roleId?: string | null } = {}) {
    const cols = columnsFor(o.categoryId);
    const keep = (e: Employee) => !o.roleId || e.roleId === o.roleId;
    const colFilter = (col: Column) => (sid: string) =>
      o.categoryId ? sid === col.id : skillById.get(sid)?.categoryId === col.id;
    const rowDefs: { id: string; name: string; kind: string; emps: Employee[]; drill: string | null }[] = [];
    for (const u of children.get(scopeUnitId) ?? []) {
      rowDefs.push({ id: u.id, name: u.name, kind: u.kind, emps: membersOf(u.id).filter(keep), drill: u.id });
    }
    const direct = (directMembers.get(scopeUnitId) ?? []).filter(keep);
    if (direct.length) rowDefs.push({ id: `${scopeUnitId}:direct`, name: "Direct members", kind: "direct", emps: direct, drill: null });
    const rows = rowDefs.filter((r) => r.emps.length > 0).map((r) => ({
      id: r.id, name: r.name, kind: r.kind, drill: r.drill, people: r.emps.length,
      total: aggregate(r.emps, o.categoryId ? (sid) => skillById.get(sid)?.categoryId === o.categoryId : undefined),
      cells: Object.fromEntries(cols.map((c) => [c.id, aggregate(r.emps, colFilter(c))])) as Record<string, Aggregate>,
    }));
    const all = rowDefs.flatMap((r) => r.emps);
    const columns = cols.map((c) => ({ ...c, total: aggregate(all, colFilter(c)) }));
    return { rows, columns, total: aggregate(all, o.categoryId ? (sid) => skillById.get(sid)?.categoryId === o.categoryId : undefined) };
  }

  /** Rows = people in the unit's subtree, columns = skills they are expected to have. */
  function peopleHeatmap(unitId: string, o: { categoryId?: string | null; roleId?: string | null; hideMet?: boolean; includeRated?: boolean } = {}) {
    const emps = membersOf(unitId).filter((e) => !o.roleId || e.roleId === o.roleId);
    const skillIds = new Set<string>();
    for (const e of emps) {
      for (const sid of requiredSkillIds(e)) skillIds.add(sid);
      if (o.includeRated) for (const r of ratingsByEmp.get(e.id) ?? []) if (isRateable(r.skillId)) skillIds.add(r.skillId);
    }
    for (const d of demands(unitId)) skillIds.add(d.skillId);
    let skills = [...skillIds].map((id) => skillById.get(id)!).filter(Boolean)
      .filter((s) => !o.categoryId || s.categoryId === o.categoryId);
    const covByUnitSkill = new Map<string, Coverage>();
    for (const d of demands(unitId)) covByUnitSkill.set(d.skillId, coverage(d));
    if (o.hideMet) {
      skills = skills.filter((s) => emps.some((e) => {
        const c = cell(e, s.id);
        return c.target != null && !c.met;
      }) || (covByUnitSkill.get(s.id)?.shortfall ?? 0) > 0 || covByUnitSkill.get(s.id)?.spof);
    }
    const catSort = new Map(ds.categories.map((c) => [c.id, c.sort]));
    skills.sort((a, b) => (catSort.get(a.categoryId) ?? 0) - (catSort.get(b.categoryId) ?? 0)
      || (categoryById.get(a.categoryId)?.name ?? "").localeCompare(categoryById.get(b.categoryId)?.name ?? "")
      || (a.sort ?? 0) - (b.sort ?? 0) || skillLabel(a.id).localeCompare(skillLabel(b.id)));
    const rows = emps.map((e) => {
      const cells = Object.fromEntries(skills.map((s) => [s.id, cell(e, s.id)])) as Record<string, Cell>;
      const agg = aggregate([e]);
      return { employee: e, cells, onTargetPct: agg.pct, worst: Object.values(cells).filter((c) => c.target != null && !c.met).length };
    }).sort((a, b) => b.worst - a.worst || a.employee.name.localeCompare(b.employee.name));
    const columns = skills.map((s) => ({
      id: s.id,
      name: skillLabel(s.id),
      categoryId: s.categoryId,
      category: categoryById.get(s.categoryId)?.name ?? "",
      coverage: covByUnitSkill.get(s.id) ?? null,
    }));
    return { rows, columns };
  }

  // ---- people and skills ------------------------------------------------------------

  function personProfile(emp: Employee) {
    const req = requiredSkillIds(emp);
    const rated = (ratingsByEmp.get(emp.id) ?? []).map((r) => r.skillId).filter(isRateable);
    const ids = [...new Set([...req, ...rated])];
    const cells = ids.map((sid) => cell(emp, sid));
    const agg = aggregate([emp]);
    const grade = emp.gradeId ? gradeById.get(emp.gradeId) : undefined;
    const next = grade ? [...ds.grades].filter((g) => g.rank > grade.rank).sort((a, b) => a.rank - b.rank)[0] : undefined;
    let nextGrade: { grade: Grade; missing: { skillId: string; target: number; level: number | null }[] } | null = null;
    if (next && emp.roleId) {
      const probe: Employee = { ...emp, id: `${emp.id}#next`, gradeId: next.id };
      const missing: { skillId: string; target: number; level: number | null }[] = [];
      const byGrade = roleIndex.get(emp.roleId);
      const nextIds = new Set([...(byGrade?.get("")?.keys() ?? []), ...(byGrade?.get(next.id)?.keys() ?? [])]);
      for (const sid of nextIds) {
        if (!isRateable(sid)) continue;
        const t = targetFor(probe, sid);
        if (!t) continue;
        const { level } = levelOf(ratingByKey.get(`${emp.id}|${sid}`));
        if (level == null || level < t.target) missing.push({ skillId: sid, target: t.target, level });
      }
      nextGrade = { grade: next, missing };
    }
    const byCategory = ds.categories.map((c) => {
      const inCat = cells.filter((x) => x.target != null && skillById.get(x.skillId)?.categoryId === c.id);
      if (!inCat.length) return null;
      const avg = (f: (x: Cell) => number | null) => {
        const v = inCat.map(f).filter((n): n is number => n != null);
        return v.length ? Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10 : 0;
      };
      return { categoryId: c.id, name: c.name, target: avg((x) => x.target), level: avg((x) => x.level ?? 0), self: avg((x) => x.selfLevel ?? 0) };
    }).filter((x): x is NonNullable<typeof x> => !!x);
    return {
      cells,
      roleFitPct: agg.pct,
      required: agg.required,
      met: agg.met,
      nextGrade,
      byCategory,
      overqualified: cells.filter((c) => c.target != null && c.level != null && c.level - c.target >= 2),
    };
  }

  function skillStats(skillId: string, scopeUnitId: string) {
    const emps = membersOf(scopeUnitId);
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
    const cov = coverageIn(scopeUnitId).filter((c) => c.skillId === skillId);
    return { distribution, unassessed, people, coverage: cov };
  }

  /** People finder: everyone in scope at or above a level in a skill. */
  function find(scopeUnitId: string, skillId: string, minLevel: number) {
    return membersOf(scopeUnitId)
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

  /** Monthly roll-up rows for every unit (written to the snapshot table). */
  function snapshotRows() {
    return ds.units.map((u) => {
      const emps = membersOf(u.id);
      const agg = aggregate(emps);
      let sum = 0, n = 0;
      for (const e of emps) for (const sid of requiredSkillIds(e)) {
        const { level } = levelOf(ratingByKey.get(`${e.id}|${sid}`), "validated");
        if (level != null) { sum += level; n += 1; }
      }
      return { unitId: u.id, required: agg.required, met: agg.met, assessed: agg.assessed, people: emps.length, avgLevel: n ? Math.round((sum / n) * 100) / 100 : null };
    });
  }

  return {
    basis,
    settings,
    roots,
    unitById,
    empById,
    skillById,
    categoryById,
    gradeById,
    children: (id: string) => children.get(id) ?? [],
    directMembers: (id: string) => directMembers.get(id) ?? [],
    subtreeUnitIds,
    membersOf,
    ancestors,
    reportsOf,
    managedUnitIds,
    isTop,
    isRateable,
    targetFor,
    requiredSkillIds,
    levelOf: (employeeId: string, skillId: string, b?: Basis) => levelOf(ratingByKey.get(`${employeeId}|${skillId}`), b),
    rating: (employeeId: string, skillId: string) => ratingByKey.get(`${employeeId}|${skillId}`),
    cell,
    aggregate,
    demands,
    coverage,
    coverageIn,
    shortNeeds,
    individualGaps,
    calibration,
    kpis,
    unitHeatmap,
    peopleHeatmap,
    personProfile,
    skillStats,
    find,
    skillLabel,
    snapshotRows,
  };
}

export type Engine = ReturnType<typeof createEngine>;
