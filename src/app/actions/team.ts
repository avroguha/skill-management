"use server";
// What a team needs (a manager's own call), and growing the skill catalogue from below.
//  - A manager sets needs for the units they manage: "N people at level L in skill S".
//  - If the skill is missing from the catalogue, a manager adds it (active at once).
//  - An employee may suggest a missing skill; it waits as a draft for an administrator.
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { guardAction, audit, canSeeUnit, getEngine, type Viewer } from "@/lib/server";

export type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };

function canManageUnit(v: Viewer, unitId: string): boolean {
  return v.isAdmin || (v.role === "manager" && canSeeUnit(v, unitId));
}

const newSkill = z.object({
  name: z.string().trim().min(2, "Give the skill a name.").max(80),
  categoryId: z.string().min(1, "Choose a category."),
  parentId: z.string().optional().nullable(),
  description: z.string().trim().max(500).optional().default(""),
});

/** Finds a skill by name or alias (case-insensitive) in a category, or creates it. */
async function findOrCreateSkill(input: z.infer<typeof newSkill>, status: "active" | "draft", by: string) {
  const db = await getDb();
  const name = input.name.trim();
  const [existing] = await db.select().from(schema.skill).where(
    sql`(lower(${schema.skill.name}) = lower(${name}) or lower(${name}) = any(select lower(x) from unnest(${schema.skill.aliases}) as x))
        and ${schema.skill.status} <> 'retired'`,
  );
  if (existing) return { id: existing.id, created: false, status: existing.status };
  const [row] = await db.insert(schema.skill).values({
    name, categoryId: input.categoryId, parentId: input.parentId || null, status,
    description: input.description || (status === "draft" ? `Suggested by ${by}` : ""),
  }).returning({ id: schema.skill.id });
  return { id: row.id, created: true, status };
}

const need = z.object({
  unitId: z.string().min(1),
  skillId: z.string().optional(),
  newSkill: newSkill.optional(),
  minLevel: z.coerce.number().int().min(1).max(5),
  headcount: z.coerce.number().int().min(1).max(500),
  note: z.string().trim().max(300).optional().default(""),
});

export async function saveTeamNeed(input: z.input<typeof need>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  const p = need.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  if (!canManageUnit(v, p.data.unitId)) return { ok: false, error: "Only the manager of this team or an administrator can set what it needs." };
  let skillId = p.data.skillId;
  let created = false;
  if (!skillId && p.data.newSkill) {
    const s = await findOrCreateSkill(p.data.newSkill, "active", v.name);
    skillId = s.id;
    created = s.created;
    if (created) await audit(v, "create_skill", "skill", s.id, { ...p.data.newSkill, via: "team need" });
  }
  if (!skillId) return { ok: false, error: "Choose a skill, or name a new one." };
  const engine = await getEngine();
  if (!created && !engine.isRateable(skillId)) {
    return { ok: false, error: "That skill has sub-skills or is retired. Pick a sub-skill (for example AWS › EC2) instead." };
  }
  const db = await getDb();
  await db.insert(schema.unitRequirement)
    .values({ unitId: p.data.unitId, skillId, minLevel: p.data.minLevel, headcount: p.data.headcount, note: p.data.note })
    .onConflictDoUpdate({
      target: [schema.unitRequirement.unitId, schema.unitRequirement.skillId],
      set: { minLevel: p.data.minLevel, headcount: p.data.headcount, note: p.data.note },
    });
  await audit(v, "set_team_need", "unit_requirement", p.data.unitId, { skillId, minLevel: p.data.minLevel, headcount: p.data.headcount, note: p.data.note });
  revalidatePath("/team");
  revalidatePath("/");
  return { ok: true, message: created ? "Skill added to the catalogue and to this team's needs." : "Team need saved." };
}

export async function removeTeamNeed(unitId: string, skillId: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!canManageUnit(v, unitId)) return { ok: false, error: "Not allowed." };
  const db = await getDb();
  await db.delete(schema.unitRequirement).where(and(eq(schema.unitRequirement.unitId, unitId), eq(schema.unitRequirement.skillId, skillId)));
  await audit(v, "remove_team_need", "unit_requirement", unitId, { skillId });
  revalidatePath("/team");
  revalidatePath("/");
  return { ok: true, message: "Removed." };
}

// ---- open positions ---------------------------------------------------------------------
// A manager (or an administrator) records a position they are hiring for in their team; the
// team page suggests the talent to look for (src/lib/engine/advice.ts).

const position = z.object({
  id: z.string().optional(),
  unitId: z.string().min(1),
  title: z.string().trim().min(2, "Give the position a title.").max(120),
  roleId: z.string().nullable().optional(),
  gradeId: z.string().nullable().optional(),
  headcount: z.coerce.number().int().min(1).max(100),
  skills: z.array(z.object({ skillId: z.string().min(1), level: z.coerce.number().int().min(1).max(5) })).max(30).default([]),
  note: z.string().trim().max(1000).optional().default(""),
});

export async function savePosition(input: z.input<typeof position>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  const p = position.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  const d = p.data;
  if (!canManageUnit(v, d.unitId)) return { ok: false, error: "Only the manager of this team or an administrator can add its open positions." };
  const engine = await getEngine();
  const bad = d.skills.find((s) => !engine.isRateable(s.skillId));
  if (bad) return { ok: false, error: `${engine.skillLabel(bad.skillId) || "A skill"} has sub-skills or is retired. Pick a sub-skill instead.` };
  const skills = [...new Map(d.skills.map((s) => [s.skillId, s])).values()];
  const values = {
    unitId: d.unitId, title: d.title, roleId: d.roleId || null, gradeId: d.gradeId || null,
    headcount: d.headcount, skills, note: d.note,
  };
  const db = await getDb();
  let id = d.id;
  if (id) {
    const [row] = await db.select().from(schema.openPosition).where(eq(schema.openPosition.id, id));
    if (!row) return { ok: false, error: "That position no longer exists." };
    if (!canManageUnit(v, row.unitId)) return { ok: false, error: "Not allowed." };
    await db.update(schema.openPosition).set(values).where(eq(schema.openPosition.id, id));
  } else {
    [{ id }] = await db.insert(schema.openPosition).values({ ...values, createdBy: v.userId, createdByName: v.name }).returning({ id: schema.openPosition.id });
  }
  await audit(v, d.id ? "update_position" : "add_position", "open_position", id!, values);
  revalidatePath("/team");
  return { ok: true, id, message: d.id ? "Position saved." : "Position added. The talent to look for is shown under it." };
}

export async function setPositionStatus(id: string, status: "open" | "filled" | "cancelled" | "delete"): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!["open", "filled", "cancelled", "delete"].includes(status)) return { ok: false, error: "Unknown status." };
  const db = await getDb();
  const [row] = await db.select().from(schema.openPosition).where(eq(schema.openPosition.id, id));
  if (!row) return { ok: false, error: "That position no longer exists." };
  if (!canManageUnit(v, row.unitId)) return { ok: false, error: "Not allowed." };
  if (status === "delete") await db.delete(schema.openPosition).where(eq(schema.openPosition.id, id));
  else await db.update(schema.openPosition).set({ status, closedAt: status === "open" ? null : new Date() }).where(eq(schema.openPosition.id, id));
  await audit(v, status === "delete" ? "delete_position" : "position_status", "open_position", id, { status, title: row.title });
  revalidatePath("/team");
  return { ok: true, message: status === "delete" ? "Deleted." : status === "open" ? "Reopened." : status === "filled" ? "Marked as filled." : "Cancelled." };
}

// ---- training suggested for a team ------------------------------------------------------

const booking = z.object({
  skillId: z.string().min(1),
  people: z.array(z.object({ employeeId: z.string().min(1), targetLevel: z.coerce.number().int().min(1).max(5) })).min(1).max(200),
  title: z.string().trim().min(3, "Give the training a short title.").max(200),
  link: z.string().trim().max(500).optional().default(""),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

/** Books one training for several people at once (a training plan each). */
export async function bookTraining(input: z.input<typeof booking>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  const p = booking.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  const d = p.data;
  if (d.link && !/^https?:\/\//i.test(d.link)) return { ok: false, error: "The link must start with http:// or https://" };
  const outside = d.people.filter((x) => !v.reportIds.has(x.employeeId));
  if (outside.length) return { ok: false, error: "Only a person's manager or an administrator can book their training." };
  const engine = await getEngine();
  if (!engine.isRateable(d.skillId)) return { ok: false, error: "That skill can no longer be rated." };
  const db = await getDb();
  await db.insert(schema.trainingPlan).values(d.people.map((x) => ({
    employeeId: x.employeeId, skillId: d.skillId, targetLevel: x.targetLevel, title: d.title,
    link: d.link ?? "", dueOn: d.dueOn || null, createdBy: v.userId,
  })));
  await audit(v, "book_training", "training_plan", d.skillId, { ...d, count: d.people.length });
  revalidatePath("/team");
  revalidatePath("/gaps");
  for (const x of d.people) revalidatePath(`/people/${x.employeeId}`);
  return { ok: true, message: `Booked for ${d.people.length} ${d.people.length === 1 ? "person" : "people"}.` };
}

/** Anyone may suggest a skill that is missing; it is a draft until an administrator approves it. */
export async function suggestSkill(input: z.input<typeof newSkill>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  const p = newSkill.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  const status = v.isAdmin || v.role === "manager" ? "active" : "draft";
  const s = await findOrCreateSkill(p.data, status, v.name);
  if (!s.created) {
    return s.status === "draft"
      ? { ok: true, id: s.id, message: "Someone has already suggested it; it is waiting for an administrator." }
      : { ok: true, id: s.id, message: "That skill already exists. Add it from the list." };
  }
  await audit(v, status === "draft" ? "suggest_skill" : "create_skill", "skill", s.id, p.data);
  revalidatePath("/assess");
  revalidatePath("/admin/taxonomy");
  return {
    ok: true, id: s.id,
    message: status === "draft" ? "Suggested. You can rate it once an administrator approves it." : "Added to the catalogue.",
  };
}
