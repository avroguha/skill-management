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
