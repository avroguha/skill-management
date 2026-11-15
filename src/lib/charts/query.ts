// Charts an operator builds: what to measure, how to group it, what to split it by, over one
// hierarchy. Worked out from the engine every time (no database, so test/charts.test.ts checks
// it directly): a chart is a definition, never a copy of the data, which is why the data never
// has to leave the app to be charted.
//
// Rules carried over from the engine: "not assessed" is never 0; levels are never averaged
// across people (a level chart counts ratings at each level instead); a percentage is a share
// of (person, required skill) pairs, so a split adds up exactly like the heatmaps.
import type { Engine, Employee } from "../engine/engine.ts";
import type { Scope } from "../access.ts";

export type Measure = "on_target" | "assessed" | "below_target" | "critical" | "people" | "holders" | "ratings" | "wanted";
export type Dimension = "team" | "role" | "grade" | "person" | "category" | "skill" | "level" | "month";
export type ChartType = "bar" | "hbar" | "stacked" | "line" | "area" | "pie" | "radar" | "heatmap" | "kpi";

/** what each measure counts: required (person, skill) pairs, people, or ratings people hold */
export const MEASURES: Record<Measure, { label: string; unit: "%" | "count"; over: "pairs" | "people" | "ratings"; hint: string }> = {
  on_target: { label: "On target %", unit: "%", over: "pairs", hint: "Share of required skill ratings at or above target." },
  assessed: { label: "Assessed %", unit: "%", over: "pairs", hint: "Share of required skills that have a rating at all." },
  below_target: { label: "Below target", unit: "count", over: "pairs", hint: "Required skill ratings below their target (rated ones only)." },
  critical: { label: "Critical gaps", unit: "count", over: "pairs", hint: "Required skills three or more levels short, or Awareness where Proficient is needed." },
  people: { label: "People", unit: "count", over: "people", hint: "Head count." },
  holders: { label: "People at a level or above", unit: "count", over: "ratings", hint: "People holding the skill at the chosen level or higher (each person once per bar)." },
  ratings: { label: "Ratings", unit: "count", over: "ratings", hint: "Ratings held; group or split by level for a level distribution." },
  wanted: { label: "Want to learn", unit: "count", over: "ratings", hint: "People who marked a skill as one they want to grow in." },
};

export const DIMENSIONS: Record<Dimension, { label: string; of: "person" | "skill" | "level" | "time" }> = {
  team: { label: "Team", of: "person" },
  role: { label: "Role", of: "person" },
  grade: { label: "Grade", of: "person" },
  person: { label: "Person", of: "person" },
  category: { label: "Skill category", of: "skill" },
  skill: { label: "Skill", of: "skill" },
  level: { label: "Level", of: "level" },
  month: { label: "Month", of: "time" },
};

export const CHART_TYPES: Record<ChartType, { label: string; split: "none" | "optional" | "required" }> = {
  bar: { label: "Bar", split: "optional" },
  hbar: { label: "Horizontal bar", split: "optional" },
  stacked: { label: "Stacked bar", split: "required" },
  line: { label: "Line", split: "optional" },
  area: { label: "Area", split: "optional" },
  pie: { label: "Pie / donut", split: "none" },
  radar: { label: "Radar", split: "optional" },
  heatmap: { label: "Heatmap", split: "required" },
  kpi: { label: "Single number", split: "none" },
};

export interface ChartSpec {
  scope: Scope;
  measure: Measure;
  groupBy: Dimension;
  splitBy: Dimension | "none";
  type: ChartType;
  /** for "people at a level or above" */
  minLevel: number;
  basis: "validated" | "self";
  filters: { categoryId?: string | null; skillId?: string | null; roleId?: string | null; gradeId?: string | null };
  /** bars kept, biggest first (the rest are left out and said so) */
  limit: number;
  sort: "value" | "label";
}

export const DEFAULT_SPEC: Omit<ChartSpec, "scope"> = {
  measure: "on_target", groupBy: "category", splitBy: "none", type: "bar", minLevel: 3, basis: "validated",
  filters: {}, limit: 15, sort: "value",
};

export interface Snapshot { unitId: string; period: string; required: number; met: number; assessed: number; people: number }

export interface ChartResult {
  /** one row per bar / point: { key, label, [series key]: value } */
  rows: Record<string, string | number | null>[];
  series: { key: string; label: string }[];
  unit: "%" | "count";
  /** the whole hierarchy in one number, for "single number" and the subtitle */
  total: number | null;
  people: number;
  scopeLabel: string;
  notes: string[];
  /** what the chart shows, in a line: under its title on screen and on the PNG */
  subtitle?: string;
}

/** "Platform · On target % by team, split by category · Cloud only · validated levels" */
export function describeSpec(engine: Engine, spec: ChartSpec): string {
  const f = spec.filters ?? {};
  const only = [
    f.categoryId ? engine.categoryById.get(f.categoryId)?.name : null,
    f.skillId ? engine.skillLabel(f.skillId) : null,
    f.roleId ? engine.roles.find((r) => r.id === f.roleId)?.name : null,
    f.gradeId ? engine.gradeById.get(f.gradeId)?.name : null,
  ].filter(Boolean);
  const m = spec.measure === "holders" ? `People at level ${spec.minLevel}+` : MEASURES[spec.measure].label;
  return [
    scopeLabel(engine, spec.scope),
    spec.type === "kpi" ? m : `${m} by ${DIMENSIONS[spec.groupBy].label.toLowerCase()}${spec.splitBy !== "none" ? `, split by ${DIMENSIONS[spec.splitBy].label.toLowerCase()}` : ""}`,
    only.length ? `${only.join(", ")} only` : "",
    spec.groupBy === "month" || spec.measure === "people" ? "" : spec.basis === "self" ? "self-assessed levels" : "validated levels",
  ].filter(Boolean).join(" · ");
}

/** Why a combination cannot be drawn, or null when it can. */
export function checkSpec(s: Pick<ChartSpec, "measure" | "groupBy" | "splitBy" | "type">): string | null {
  const m = MEASURES[s.measure];
  const dims = [s.groupBy, ...(s.splitBy === "none" ? [] : [s.splitBy])];
  if (s.splitBy !== "none" && s.splitBy === s.groupBy) return "Split by something other than what the chart is grouped by.";
  if (CHART_TYPES[s.type].split === "required" && s.splitBy === "none") return `A ${CHART_TYPES[s.type].label.toLowerCase()} needs something to split by.`;
  if (dims.includes("month")) {
    if (s.groupBy !== "month") return "Months can only be the grouping, not the split.";
    if (!["on_target", "assessed", "people"].includes(s.measure)) return "Over months: on target %, assessed % or people (from the monthly snapshots).";
    if (s.splitBy !== "none") return "Months cannot be split: the monthly snapshots keep one figure per unit.";
    return null;
  }
  if (m.over === "people" && dims.some((d) => DIMENSIONS[d].of !== "person")) return "People can only be grouped by team, role, grade or person.";
  if (dims.includes("level") && m.over !== "ratings") return "Levels go with ratings, people at a level, or want to learn.";
  return null;
}

/** The people of a hierarchy: a unit and those under it, or a leader and everyone below them. */
export function scopePeople(engine: Engine, scope: Scope): Employee[] {
  if (scope.kind === "unit") return engine.membersOf(scope.id).filter((e) => e.active);
  const leader = engine.empById.get(scope.id);
  return leader?.active ? [leader, ...engine.reportsOf(scope.id).filter((e) => e.active)] : [];
}

export function scopeLabel(engine: Engine, scope: Scope): string {
  return scope.kind === "unit" ? engine.unitById.get(scope.id)?.name ?? "(unit no longer exists)"
    : `${engine.empById.get(scope.id)?.name ?? "(person no longer here)"}'s organisation`;
}

/** Which team of the hierarchy each person is in: a unit's child units, or a leader's direct reports. */
function teamsOf(engine: Engine, scope: Scope) {
  const teamOf = new Map<string, { key: string; label: string; order: number }>();
  if (scope.kind === "unit") {
    const unit = engine.unitById.get(scope.id);
    engine.children(scope.id).forEach((c, i) => {
      for (const uid of engine.subtreeUnitIds(c.id)) for (const e of engine.directMembers(uid)) teamOf.set(e.id, { key: c.id, label: c.name, order: i });
    });
    for (const e of engine.directMembers(scope.id)) teamOf.set(e.id, { key: "direct", label: `${unit?.name ?? ""} (direct)`, order: 9999 });
  } else {
    const leader = engine.empById.get(scope.id);
    if (leader) teamOf.set(leader.id, { key: leader.id, label: leader.name, order: -1 });
    engine.directReportsOf(scope.id).forEach((d, i) => {
      const t = engine.directReportsOf(d.id).length ? { key: d.id, label: `${d.name}'s team`, order: i } : { key: "direct", label: "Direct reports", order: 9999 };
      teamOf.set(d.id, t);
      for (const e of engine.reportsOf(d.id)) teamOf.set(e.id, t);
    });
  }
  return teamOf;
}

type Acc = { num: number; den: number; ids: Set<string> };

export function runChart(engine: Engine, spec: ChartSpec, snapshots: Snapshot[] = [], levelNames: string[] = []): ChartResult {
  const notes: string[] = [];
  const m = MEASURES[spec.measure];
  const label = scopeLabel(engine, spec.scope);
  const problem = checkSpec(spec);
  if (problem) return { rows: [], series: [], unit: m.unit, total: null, people: 0, scopeLabel: label, notes: [problem] };

  const f = spec.filters ?? {};
  const people = scopePeople(engine, spec.scope).filter((e) => (!f.roleId || e.roleId === f.roleId) && (!f.gradeId || e.gradeId === f.gradeId));
  const skillOk = (sid: string) => {
    const s = engine.skillById.get(sid);
    return !!s && engine.isRateable(sid) && (!f.categoryId || s.categoryId === f.categoryId) && (!f.skillId || sid === f.skillId);
  };

  // ---- months: from the monthly snapshots of the hierarchy's unit ----
  if (spec.groupBy === "month") {
    const unitId = spec.scope.kind === "unit" ? spec.scope.id
      : engine.managedUnitIds(spec.scope.id).find((u) => !engine.ancestors(u).some((a) => engine.managedUnitIds(spec.scope.id).includes(a.id))) ?? null;
    if (!unitId) return { rows: [], series: [], unit: m.unit, total: null, people: people.length, scopeLabel: label, notes: ["This leader runs no unit, so there is no monthly history. Pick a unit instead."] };
    if (f.categoryId || f.skillId || f.roleId || f.gradeId) notes.push("Monthly snapshots are kept for the whole unit: the filters do not apply to them.");
    const snaps = snapshots.filter((s) => s.unitId === unitId).sort((a, b) => a.period.localeCompare(b.period)).slice(-24);
    const value = (s: Snapshot) => (spec.measure === "people" ? s.people
      : s.required ? Math.round(((spec.measure === "on_target" ? s.met : s.assessed) / s.required) * 100) : null);
    const month = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
    const rows = snaps.map((s) => ({ key: s.period, label: month(s.period), value: value(s) }));
    if (!rows.length) notes.push("No monthly snapshot yet: the first is taken at the start of each month.");
    return { rows, series: [{ key: "value", label: m.label }], unit: m.unit, total: rows.length ? (rows.at(-1)!.value as number | null) : null, people: people.length, scopeLabel: label, notes };
  }

  const teamOf = spec.groupBy === "team" || spec.splitBy === "team" ? teamsOf(engine, spec.scope) : new Map();
  const roleName = new Map(engine.roles.map((r) => [r.id, r.name]));
  const levelLabel = (n: number) => `${n}${levelNames[n] ? ` ${levelNames[n]}` : ""}`;
  // a dimension's value for a person and (optionally) a skill and level
  const keyOf = (d: Dimension, e: Employee, sid?: string, lvl?: number | null): { key: string; label: string; order: number } | null => {
    switch (d) {
      case "team": return teamOf.get(e.id) ?? { key: "other", label: "Elsewhere", order: 10000 };
      case "role": return e.roleId ? { key: e.roleId, label: roleName.get(e.roleId) ?? "(role)", order: 0 } : { key: "", label: "No role", order: 1 };
      case "grade": {
        const g = e.gradeId ? engine.gradeById.get(e.gradeId) : undefined;
        return g ? { key: g.id, label: g.name, order: g.rank } : { key: "", label: "No grade", order: 1e6 };
      }
      case "person": return { key: e.id, label: e.name, order: 0 };
      case "category": {
        const c = sid ? engine.categoryById.get(engine.skillById.get(sid)?.categoryId ?? "") : undefined;
        return c ? { key: c.id, label: c.name, order: c.sort } : null;
      }
      case "skill": return sid ? { key: sid, label: engine.skillLabel(sid), order: 0 } : null;
      case "level": return lvl == null ? null : { key: String(lvl), label: levelLabel(lvl), order: lvl };
      default: return null;
    }
  };

  const xs = new Map<string, { label: string; order: number }>();
  const ss = new Map<string, { label: string; order: number }>();
  const cells = new Map<string, Acc>();
  const all: Acc = { num: 0, den: 0, ids: new Set() };
  const add = (e: Employee, num: number, den: number, sid?: string, lvl?: number | null) => {
    const x = keyOf(spec.groupBy, e, sid, lvl);
    const s = spec.splitBy === "none" ? { key: "value", label: m.label, order: 0 } : keyOf(spec.splitBy, e, sid, lvl);
    if (!x || !s) return;
    if (!xs.has(x.key)) xs.set(x.key, { label: x.label, order: x.order });
    if (!ss.has(s.key)) ss.set(s.key, { label: s.label, order: s.order });
    const k = `${x.key}\u0001${s.key}`;
    const c = cells.get(k) ?? { num: 0, den: 0, ids: new Set<string>() };
    c.num += num; c.den += den; if (num) c.ids.add(e.id);
    cells.set(k, c);
    all.num += num; all.den += den; if (num) all.ids.add(e.id);
  };

  for (const e of people) {
    if (m.over === "people") { add(e, 1, 1); continue; }
    if (m.over === "pairs") {
      for (const sid of engine.requiredSkillIds(e)) {
        if (!skillOk(sid)) continue;
        const c = engine.cell(e, sid);
        const met = c.met ? 1 : 0;
        const num = spec.measure === "on_target" ? met : spec.measure === "assessed" ? (c.level != null ? 1 : 0)
          : spec.measure === "below_target" ? (c.level != null && !c.met ? 1 : 0) : (c.category === "critical" && c.mandatory ? 1 : 0);
        add(e, num, 1, sid, c.level);
      }
      continue;
    }
    for (const r of engine.ratingsOf(e.id)) {
      if (!skillOk(r.skillId)) continue;
      const lvl = engine.levelOf(e.id, r.skillId, spec.basis).level;
      if (spec.measure === "wanted") { if (r.interest) add(e, 1, 1, r.skillId, lvl); continue; }
      if (lvl == null) continue;
      if (spec.measure === "holders" && lvl < spec.minLevel) continue;
      add(e, 1, 1, r.skillId, lvl);
    }
  }

  const distinct = spec.measure === "holders" || spec.measure === "wanted";
  const value = (c: Acc | undefined) => (!c ? (m.unit === "%" ? null : 0)
    : m.unit === "%" ? (c.den ? Math.round((c.num / c.den) * 100) : null) : distinct ? c.ids.size : c.num);
  // a percentage needs at least one required pair; a count of nothing is 0
  let series = [...ss].map(([key, v]) => ({ key, label: v.label, order: v.order }));
  const seriesTotal = (key: string) => [...xs.keys()].reduce((n, x) => n + (value(cells.get(`${x}\u0001${key}`)) ?? 0), 0);
  const naturalSplit = spec.splitBy === "level" || spec.splitBy === "grade" || spec.splitBy === "category" || spec.splitBy === "team";
  series.sort((a, b) => (naturalSplit ? a.order - b.order : seriesTotal(b.key) - seriesTotal(a.key)) || a.label.localeCompare(b.label));
  const MAX_SERIES = 10;
  if (series.length > MAX_SERIES) { notes.push(`Split into the ${MAX_SERIES} largest of ${series.length}.`); series = series.slice(0, MAX_SERIES); }

  // the bar's own value, for sorting: its share over all its cells for %, else the sum
  const xValue = (x: string) => {
    if (m.unit === "%") {
      let num = 0, den = 0;
      for (const s of ss.keys()) { const c = cells.get(`${x}\u0001${s}`); if (c) { num += c.num; den += c.den; } }
      return den ? num / den : -1;
    }
    return series.reduce((n, s) => n + (value(cells.get(`${x}\u0001${s.key}`)) ?? 0), 0);
  };
  const natural = spec.groupBy === "level" || spec.groupBy === "grade" || spec.groupBy === "team";
  // a count bar of nothing is noise (a percentage of nothing is already left out: no pairs, no bar)
  let xList = [...xs].map(([key, v]) => ({ key, label: v.label, order: v.order }))
    .filter((x) => m.unit === "%" || spec.groupBy === "level" || xValue(x.key) > 0);
  xList.sort((a, b) => (spec.sort === "label" ? a.label.localeCompare(b.label)
    : natural ? a.order - b.order || a.label.localeCompare(b.label) : xValue(b.key) - xValue(a.key) || a.label.localeCompare(b.label)));
  const limit = Math.max(1, Math.min(60, spec.limit || 15));
  if (xList.length > limit) { notes.push(`The ${limit} ${natural || spec.sort === "label" ? "first" : "largest"} of ${xList.length}; raise "Show at most" for more.`); xList = xList.slice(0, limit); }

  const rows = xList.map((x) => {
    const row: Record<string, string | number | null> = { key: x.key, label: x.label };
    for (const s of series) row[s.key] = value(cells.get(`${x.key}\u0001${s.key}`));
    return row;
  });
  if (!people.length) notes.push("Nobody in this hierarchy matches the filters.");
  else if (!rows.length) notes.push(m.over === "pairs" ? "Nothing is required of these people for the skills chosen." : "No ratings match.");
  const total = m.unit === "%" ? (all.den ? Math.round((all.num / all.den) * 100) : null) : distinct ? all.ids.size : m.over === "people" ? people.length : all.num;
  return { rows, series: series.map(({ key, label }) => ({ key, label })), unit: m.unit, total, people: people.length, scopeLabel: label, notes };
}
