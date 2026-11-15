// What the chart builder offers a viewer: the hierarchies they may chart, and the catalogue
// for filters. Server only.
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Viewer } from "@/lib/server";
import type { Engine } from "@/lib/engine/engine";
import { DEFAULT_SPEC, type ChartSpec } from "@/lib/charts/query";
import type { BuilderOptions, ScopeOption } from "./builder";

export async function builderOptions(v: Viewer, engine: Engine): Promise<BuilderOptions> {
  const db = await getDb();
  const levels = await db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level));
  const path = (unitId: string) => engine.ancestors(unitId).map((a) => a.name).join(" › ");
  const leader = (id: string, group: string): ScopeOption | null => {
    const e = engine.empById.get(id);
    if (!e?.active) return null;
    const n = engine.reportsOf(id).filter((x) => x.active).length;
    return { kind: "leader", id, label: e.name, detail: `${e.title ? `${e.title} · ` : ""}${n} below`, group };
  };
  const unit = (id: string, group: string): ScopeOption | null => {
    const u = engine.unitById.get(id);
    return u ? { kind: "unit", id, label: u.name, detail: path(id) || u.kind, group } : null;
  };
  let scopes: (ScopeOption | null)[] = [];
  if (v.chartScopes === "all") {
    scopes = [
      ...[...engine.empById.values()].filter((e) => e.active && engine.reportsOf(e.id).length > 0)
        .sort((a, b) => engine.reportsOf(b.id).length - engine.reportsOf(a.id).length).map((e) => leader(e.id, "Leaders")),
      ...[...engine.unitById.keys()].map((id) => unit(id, "Units")),
    ];
  } else {
    const mine = v.chartScopes;
    const own = mine.map((s) => (s.kind === "leader" ? leader(s.id, "Your hierarchies") : unit(s.id, "Your hierarchies")));
    const inside = [...v.unitIds].filter((id) => !mine.some((s) => s.kind === "unit" && s.id === id))
      .map((id) => unit(id, "Units inside them"));
    scopes = [...own, ...inside];
  }
  return {
    scopes: scopes.filter((s): s is ScopeOption => !!s),
    categories: [...engine.categoryById.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map((c) => ({ id: c.id, name: c.name })),
    skills: [...engine.skillById.values()].filter((s) => engine.isRateable(s.id))
      .map((s) => ({ id: s.id, name: engine.skillLabel(s.id), categoryId: s.categoryId, category: engine.categoryById.get(s.categoryId)?.name ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    roles: [...engine.roles].sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ id: r.id, name: r.name })),
    grades: [...engine.gradeById.values()].sort((a, b) => a.rank - b.rank).map((g) => ({ id: g.id, name: g.name })),
    levels: levels.map((l) => ({ level: l.level, name: l.name })),
    thresholds: { greenAt: engine.settings.greenAt, amberAt: engine.settings.amberAt },
  };
}

/** A new chart starts on the viewer's first hierarchy. */
export function newSpec(options: BuilderOptions): ChartSpec | null {
  const first = options.scopes[0];
  return first ? { ...DEFAULT_SPEC, scope: { kind: first.kind, id: first.id }, groupBy: first.kind === "unit" ? "team" : "team" } : null;
}
