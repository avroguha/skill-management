"use server";
// Manager actions on a person: a per-person target (wins over the role standard, and
// says so) and training plans against a gap.
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { guardAction, audit, getEngine } from "@/lib/server";

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const level = z.coerce.number().int().min(0).max(5);

export async function setPersonTarget(input: { employeeId: string; skillId: string; target: number | null; reason: string }): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!v.reportIds.has(input.employeeId)) return { ok: false, error: "Only this person's manager or an administrator can set their targets." };
  const engine = await getEngine();
  if (!engine.isRateable(input.skillId)) return { ok: false, error: "That skill cannot be rated (it is retired or has sub-skills)." };
  const db = await getDb();
  if (input.target == null) {
    await db.delete(schema.employeeTarget).where(and(eq(schema.employeeTarget.employeeId, input.employeeId), eq(schema.employeeTarget.skillId, input.skillId)));
  } else {
    const t = level.parse(input.target);
    if (t < 1) return { ok: false, error: "A target must be at least 1. Remove the override to fall back to the role." };
    const reason = input.reason.trim();
    if (!reason) return { ok: false, error: "Say why this person's target differs from their role." };
    await db.insert(schema.employeeTarget)
      .values({ employeeId: input.employeeId, skillId: input.skillId, target: t, reason, setBy: v.userId, setAt: new Date() })
      .onConflictDoUpdate({ target: [schema.employeeTarget.employeeId, schema.employeeTarget.skillId], set: { target: t, reason, setBy: v.userId, setAt: new Date() } });
  }
  await db.insert(schema.ratingEvent).values({ employeeId: input.employeeId, skillId: input.skillId, kind: "target", level: input.target, note: input.reason, actorId: v.userId });
  await audit(v, input.target == null ? "remove_target" : "set_target", "employee_target", input.employeeId, { skillId: input.skillId, target: input.target, reason: input.reason });
  revalidatePath(`/people/${input.employeeId}`);
  return { ok: true };
}

const planSchema = z.object({
  employeeId: z.string().min(1),
  skillId: z.string().min(1),
  targetLevel: level,
  title: z.string().trim().min(3, "Give the plan a short title.").max(200),
  link: z.string().trim().max(500).optional().default(""),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

export async function addTrainingPlan(input: z.input<typeof planSchema>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  const p = planSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  const self = v.employee?.id === p.data.employeeId;
  if (!self && !v.reportIds.has(p.data.employeeId)) return { ok: false, error: "Only the person or their manager can plan their training." };
  if (p.data.link && !/^https?:\/\//i.test(p.data.link)) return { ok: false, error: "The link must start with http:// or https://" };
  const db = await getDb();
  const [row] = await db.insert(schema.trainingPlan).values({
    employeeId: p.data.employeeId, skillId: p.data.skillId, targetLevel: p.data.targetLevel, title: p.data.title,
    link: p.data.link ?? "", dueOn: p.data.dueOn || null, createdBy: v.userId,
  }).returning({ id: schema.trainingPlan.id });
  await audit(v, "add_training_plan", "training_plan", row.id, p.data);
  revalidatePath(`/people/${p.data.employeeId}`);
  revalidatePath("/gaps");
  return { ok: true };
}

export async function setPlanStatus(planId: string, status: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!["planned", "in_progress", "done", "cancelled"].includes(status)) return { ok: false, error: "Unknown status." };
  const db = await getDb();
  const [plan] = await db.select().from(schema.trainingPlan).where(eq(schema.trainingPlan.id, planId));
  if (!plan) return { ok: false, error: "That plan no longer exists." };
  if (v.employee?.id !== plan.employeeId && !v.reportIds.has(plan.employeeId)) return { ok: false, error: "Not allowed." };
  await db.update(schema.trainingPlan).set({ status }).where(eq(schema.trainingPlan.id, planId));
  await audit(v, "training_plan_status", "training_plan", planId, { status });
  revalidatePath(`/people/${plan.employeeId}`);
  revalidatePath("/gaps");
  return { ok: true };
}
