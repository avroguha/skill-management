// Shapes engine results into the plain, serialisable props the view components take.
import { ALL, type Coverage, type Engine } from "@/lib/engine/engine";
import type { NeedView } from "@/components/needs";
import type { Viewer } from "@/lib/server";
import type { PeopleHeatmapData, UnitHeatmapData } from "@/components/heatmap";

export interface ScopeOption { id: string; name: string; depth: number; people: number }

/** The teams a viewer may pick, in tree order with depth: the whole organisation (leaders and
 *  administrators), then every manager's team they may see. */
export function scopeOptions(engine: Engine, v: Viewer): ScopeOption[] {
  const out: ScopeOption[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    const m = engine.empById.get(id);
    if (!m || !engine.isManager(m)) return;
    out.push({ id, name: `${engine.teamLabel(id)} · ${m.name}`, depth, people: engine.reportsOf(id).length });
    for (const d of engine.directReportsOf(id)) walk(d.id, depth + 1);
  };
  if (v.allPeople) {
    out.push({ id: ALL, name: "Whole organisation", depth: 0, people: engine.activeEmployees.length });
    for (const t of engine.tops) walk(t.id, 1);
  } else if (v.employee) {
    walk(v.employee.id, 0);
  }
  return out;
}

export function scopeName(engine: Engine, scope: string): string {
  if (scope === ALL) return "Whole organisation";
  return engine.teamLabel(scope);
}

export function withParams(path: string, params: Record<string, string | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export function teamHeatmapData(engine: Engine, scope: string, o: { categoryId?: string | null; page?: string }): UnitHeatmapData {
  const page = o.page ?? "/insights";
  const h = engine.teamHeatmap(scope, o);
  return {
    total: h.total,
    columns: h.columns.map((c) => ({
      id: c.id, name: c.name,
      href: o.categoryId ? `/skills/${c.id}` : withParams(page, { scope, category: c.id }),
      total: c.total,
    })),
    rows: h.rows.map((r) => ({
      id: r.id, name: r.name, kind: r.drill ? "team" : "direct", people: r.people, total: r.total, cells: r.cells,
      href: r.drill ? withParams(page, { scope: r.drill, category: o.categoryId }) : (scope === "*" ? null : withParams("/team", { scope, tab: "grid" })),
    })),
  };
}

export function peopleHeatmapData(engine: Engine, scope: string, o: { categoryId?: string | null; hideMet?: boolean; everyone?: boolean; includeRated?: boolean }): PeopleHeatmapData {
  const h = engine.peopleHeatmap(scope, o);
  return {
    columns: h.columns.map((c) => ({
      id: c.id, name: c.name, category: c.category, href: `/skills/${c.id}`,
      coverage: c.coverage ? {
        count: c.coverage.count, headcount: c.coverage.headcount, level: c.coverage.level,
        spof: c.coverage.spof, shortfall: c.coverage.shortfall, explicit: c.coverage.explicit,
      } : null,
    })),
    rows: h.rows.map((r) => ({
      id: r.employee.id,
      name: r.employee.name,
      title: r.employee.title,
      href: `/people/${r.employee.id}`,
      onTargetPct: r.onTargetPct,
      cells: Object.fromEntries(Object.entries(r.cells).map(([sid, c]) => [sid, {
        target: c.target, level: c.level, category: c.category, stale: c.stale, pending: c.status === "submitted",
        selfLevel: c.selfLevel, validatedLevel: c.validatedLevel, source: c.source, mandatory: c.mandatory,
        at: c.at ? c.at.toISOString() : null, interest: c.interest,
      }])),
    })),
  };
}

/** A short team need for NeedList: who holds it, and who elsewhere already has it. */
export function needView(engine: Engine, c: Coverage, levelName: (n: number) => string, v?: Viewer): NeedView {
  const elsewhere = engine.holdersOutside(c.managerId, c.skillId, c.level).filter((e) => !v || v.allPeople || v.employeeIds.has(e.id));
  return {
    key: `${c.managerId}|${c.skillId}`,
    unit: engine.teamLabel(c.managerId),
    unitHref: withParams("/team", { scope: c.managerId }),
    skill: engine.skillLabel(c.skillId),
    skillHref: `/skills/${c.skillId}`,
    level: c.level,
    levelName: levelName(c.level),
    count: c.count,
    headcount: c.headcount,
    critical: c.critical,
    spof: c.spof,
    explicit: c.explicit,
    holders: c.holders.map((id) => engine.empById.get(id)?.name ?? "?"),
    elsewhere: elsewhere.slice(0, 5).map((e) => ({ id: e.id, name: e.name, team: e.managerId ? engine.teamLabel(e.managerId) : "" })),
    elsewhereCount: elsewhere.length,
  };
}
