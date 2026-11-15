"use server";
// Charts operators build (and executives and administrators). A saved chart is only its
// definition; the numbers are worked out from live data each time, within what the viewer
// may see (src/lib/access.ts mayChart).
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { guardAction, audit } from "@/lib/server";
import { mayChart } from "@/lib/access";
import { checkSpec, type ChartResult } from "@/lib/charts/query";
import { specSchema, computeChart } from "@/lib/charts/load";

export type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };

/** Live preview while a chart is being built. Reading only, so it works while viewing as someone. */
export async function previewChart(input: unknown): Promise<{ ok: true; result: ChartResult } | { ok: false; error: string }> {
  const g = await guardAction({ read: true });
  if (g.fail) return g.fail;
  if (!g.v.canBuildCharts) return { ok: false, error: "Charts are for operators, executives and administrators." };
  const p = specSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the chart settings." };
  const r = await computeChart(g.v, p.data);
  return "error" in r ? { ok: false, error: r.error } : { ok: true, result: r };
}

const saveSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Give the chart a name.").max(120),
  description: z.string().trim().max(500).default(""),
  spec: specSchema,
});

export async function saveChart(input: z.input<typeof saveSchema>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!v.canBuildCharts) return { ok: false, error: "Charts are for operators, executives and administrators." };
  const p = saveSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the chart settings." };
  const d = p.data;
  const problem = checkSpec(d.spec);
  if (problem) return { ok: false, error: problem };
  if (!mayChart(v, d.spec.scope)) return { ok: false, error: "That hierarchy is not one you can chart." };
  const db = await getDb();
  let id = d.id;
  if (id) {
    const [row] = await db.select().from(schema.savedChart).where(eq(schema.savedChart.id, id));
    if (!row) return { ok: false, error: "That chart no longer exists." };
    if (row.ownerId !== v.userId && !v.isAdmin) return { ok: false, error: "Only its owner can change this chart. Save a copy instead." };
    await db.update(schema.savedChart).set({ name: d.name, description: d.description, config: d.spec, updatedAt: new Date() }).where(eq(schema.savedChart.id, id));
  } else {
    [{ id }] = await db.insert(schema.savedChart).values({ ownerId: v.userId, name: d.name, description: d.description, config: d.spec }).returning({ id: schema.savedChart.id });
  }
  await audit(v, d.id ? "update_chart" : "create_chart", "saved_chart", id!, { name: d.name, scope: d.spec.scope });
  revalidatePath("/charts");
  return { ok: true, id, message: "Chart saved." };
}

export async function deleteChart(id: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  const db = await getDb();
  const [row] = await db.select().from(schema.savedChart).where(eq(schema.savedChart.id, id));
  if (!row) return { ok: false, error: "That chart no longer exists." };
  if (row.ownerId !== v.userId && !v.isAdmin) return { ok: false, error: "Only its owner can delete this chart." };
  await db.delete(schema.savedChart).where(and(eq(schema.savedChart.id, id)));
  await audit(v, "delete_chart", "saved_chart", id, { name: row.name });
  revalidatePath("/charts");
  return { ok: true, message: "Chart deleted." };
}
