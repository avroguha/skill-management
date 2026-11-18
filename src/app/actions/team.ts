"use server";
// What a team needs (the manager's own call), the team's name, and growing the skill
// catalogue from below.
//  - A manager sets needs for their team and every team below: "N people at level L in skill S".
//  - If the skill is missing from the catalogue, a manager adds it (active at once).
//  - Anyone else may suggest a missing skill; it waits as a draft for an administrator.
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { guardAction, audit, getEngine, type Viewer } from "@/lib/server";

export type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const mayManage = (v: Viewer, managerId: string) => v.isAdmin || v.manageIds.has(managerId);

const newSkill = z.object({
  name: z.string().trim().min(2, "Give the skill a name.").max(120),
  categoryId: z.string().min(1, "Choose a category."),
  parentId: z.string().optional().nullable(),
  description: z.string().trim().max(500).optional().default(""),
});

/** Finds a skill by name or alias (case-insensitive), or creates it. */
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
  managerId: z.string().min(1),
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
  if (!mayManage(v, p.data.managerId)) return { ok: false, error: "Only the team's manager, a manager above them, or an administrator can set what it needs." };
  let skillId = p.data.skillId;
  if (!skillId && p.data.newSkill) skillId = (await findOrCreateSkill(p.data.newSkill, "active", v.name)).id;
  if (!skillId) return { ok: false, error: "Choose a skill." };
  const engine = await getEngine();
  if (!engine.isRateable(skillId) && !p.data.newSkill) return { ok: false, error: "That skill has sub-skills: choose one of them." };
  const db = await getDb();
  await db.insert(schema.teamNeed)
    .values({ managerId: p.data.managerId, skillId, minLevel: p.data.minLevel, headcount: p.data.headcount, note: p.data.note })
    .onConflictDoUpdate({ target: [schema.teamNeed.managerId, schema.teamNeed.skillId], set: { minLevel: p.data.minLevel, headcount: p.data.headcount, note: p.data.note } });
  await audit(v, "set_team_need", "team_need", p.data.managerId, { skillId, minLevel: p.data.minLevel, headcount: p.data.headcount, note: p.data.note });
  revalidatePath("/team");
  revalidatePath("/insights");
  return { ok: true, message: "Saved." };
}

export async function removeTeamNeed(managerId: string, skillId: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!mayManage(v, managerId)) return { ok: false, error: "Not allowed." };
  const db = await getDb();
  await db.delete(schema.teamNeed).where(and(eq(schema.teamNeed.managerId, managerId), eq(schema.teamNeed.skillId, skillId)));
  await audit(v, "remove_team_need", "team_need", managerId, { skillId });
  revalidatePath("/team");
  revalidatePath("/insights");
  return { ok: true, message: "Removed." };
}

export async function setTeamName(managerId: string, name: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!mayManage(v, managerId)) return { ok: false, error: "Only the team's manager, a manager above them, or an administrator can rename it." };
  const n = z.string().trim().max(80, "At most 80 characters.").safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0]?.message ?? "Check the name." };
  const db = await getDb();
  await db.update(schema.employee).set({ teamName: n.data }).where(eq(schema.employee.id, managerId));
  await audit(v, "rename_team", "employee", managerId, { teamName: n.data });
  revalidatePath("/", "layout");
  return { ok: true, message: n.data ? "Renamed." : "The team is called after its manager again." };
}

/** Anyone may add a skill that is missing; from someone who is not a manager or an
 *  administrator it is a draft until an administrator approves it. */
export async function suggestSkill(input: z.input<typeof newSkill>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  const p = newSkill.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  const status = v.isAdmin || v.manageIds.size > 0 ? "active" : "draft";
  const s = await findOrCreateSkill(p.data, status, v.name);
  if (!s.created) {
    return s.status === "draft"
      ? { ok: true, id: s.id, message: "Someone has already suggested it; it is waiting for an administrator." }
      : { ok: true, id: s.id, message: "That skill already exists: it is in the list now." };
  }
  await audit(v, status === "draft" ? "suggest_skill" : "create_skill", "skill", s.id, p.data);
  revalidatePath("/my-skills");
  revalidatePath("/settings/skills");
  return {
    ok: true, id: s.id,
    message: status === "draft" ? "Suggested. You can rate it once an administrator approves it." : "Added to the catalogue.",
  };
}
