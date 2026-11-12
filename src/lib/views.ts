// Shapes engine results into the plain, serialisable props the view components take.
import type { Coverage, Engine } from "@/lib/engine/engine";
import type { NeedView } from "@/components/needs";
import type { Viewer } from "@/lib/server";
import type { UnitOption } from "@/components/filter-bar";
import type { PeopleHeatmapData, UnitHeatmapData } from "@/components/heatmap";

/** Units the viewer may pick, in tree order with depth. */
export function unitOptions(engine: Engine, v: Viewer): UnitOption[] {
  const out: UnitOption[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    const u = engine.unitById.get(id);
    if (!u) return;
    out.push({ id, name: u.name, depth, kind: u.kind });
    for (const c of engine.children(id)) walk(c.id, depth + 1);
  };
  if (v.allUnits) {
    for (const r of engine.roots) walk(r.id, 0);
  } else {
    // the viewer's top-most managed units, each with its subtree
    const tops = [...v.unitIds].filter((id) => !engine.ancestors(id).some((a) => v.unitIds.has(a.id)));
    for (const t of tops) walk(t, 0);
  }
  return out;
}

export function withParams(path: string, params: Record<string, string | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export function unitHeatmapData(engine: Engine, unitId: string, o: { categoryId?: string | null; roleId?: string | null; basis?: string | null }): UnitHeatmapData {
  const h = engine.unitHeatmap(unitId, o);
  const keep = { role: o.roleId, basis: o.basis };
  return {
    total: h.total,
    columns: h.columns.map((c) => ({
      id: c.id,
      name: c.name,
      href: o.categoryId ? `/skills/${c.id}` : withParams("/", { unit: unitId, category: c.id, ...keep }),
      total: c.total,
    })),
    rows: h.rows.map((r) => ({
      id: r.id, name: r.name, kind: r.kind, people: r.people, total: r.total, cells: r.cells,
      href: r.drill ? withParams("/", { unit: r.drill, category: o.categoryId, ...keep }) : withParams("/", { unit: unitId, view: "people", category: o.categoryId, ...keep }),
    })),
  };
}

export function peopleHeatmapData(engine: Engine, unitId: string, o: { categoryId?: string | null; roleId?: string | null; hideMet?: boolean }): PeopleHeatmapData {
  const h = engine.peopleHeatmap(unitId, o);
  return {
    columns: h.columns.map((c) => ({
      id: c.id, name: c.name, category: c.category, href: `/skills/${c.id}?unit=${unitId}`,
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

/** A short team need for NeedList: names of who holds it, links to drill in. */
export function needView(engine: Engine, c: Coverage, levelName: (n: number) => string): NeedView {
  return {
    key: `${c.unitId}|${c.skillId}`,
    unit: engine.unitById.get(c.unitId)?.name ?? "",
    unitHref: withParams("/", { unit: c.unitId, view: "people" }),
    skill: engine.skillLabel(c.skillId),
    skillHref: `/skills/${c.skillId}?unit=${c.unitId}`,
    level: c.level,
    levelName: levelName(c.level),
    count: c.count,
    headcount: c.headcount,
    critical: c.critical,
    spof: c.spof,
    explicit: c.explicit,
    holders: c.holders.map((id) => engine.empById.get(id)?.name ?? "?"),
  };
}
