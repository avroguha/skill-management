// Loading a chart's numbers on the server: the settings a chart may have, and the numbers for
// one, within what the viewer may see. Used by the Charts pages and their actions.
import { asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getEngine, type Viewer } from "@/lib/server";
import { mayChart } from "@/lib/access";
import { runChart, describeSpec, MEASURES, DIMENSIONS, CHART_TYPES, type ChartSpec, type ChartResult, type Measure, type Dimension, type ChartType } from "@/lib/charts/query";

const keys = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];
const opt = z.string().max(100).nullable().optional();
export const specSchema = z.object({
  scope: z.object({ kind: z.enum(["leader", "unit"]), id: z.string().min(1).max(100) }),
  measure: z.enum(keys(MEASURES) as [Measure, ...Measure[]]),
  groupBy: z.enum(keys(DIMENSIONS) as [Dimension, ...Dimension[]]),
  splitBy: z.enum(["none", ...keys(DIMENSIONS)] as [Dimension | "none", ...(Dimension | "none")[]]),
  type: z.enum(keys(CHART_TYPES) as [ChartType, ...ChartType[]]),
  minLevel: z.coerce.number().int().min(1).max(5).default(3),
  basis: z.enum(["validated", "self"]).default("validated"),
  filters: z.object({ categoryId: opt, skillId: opt, roleId: opt, gradeId: opt }).default({}),
  limit: z.coerce.number().int().min(1).max(60).default(15),
  sort: z.enum(["value", "label"]).default("value"),
});

/** The numbers for a chart, if the viewer may chart that hierarchy. */
export async function computeChart(v: Viewer, spec: ChartSpec): Promise<ChartResult | { error: string }> {
  if (!mayChart(v, spec.scope)) return { error: "That hierarchy is not one you can chart." };
  const engine = await getEngine(spec.basis);
  const db = await getDb();
  const [levels, snapshots] = await Promise.all([
    db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level)),
    // monthly history: the unit itself, or the units a leader runs
    spec.groupBy === "month"
      ? db.select().from(schema.snapshot).where(inArray(schema.snapshot.unitId, spec.scope.kind === "unit" ? [spec.scope.id] : [...engine.managedUnitIds(spec.scope.id), "-"]))
      : Promise.resolve([]),
  ]);
  const names: string[] = [];
  for (const l of levels) names[l.level] = l.name;
  return { ...runChart(engine, spec, snapshots, names), subtitle: describeSpec(engine, spec) };
}

