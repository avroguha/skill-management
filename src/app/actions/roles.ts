"use server";
// Roles, kept simple:
//  - Everyone sees the roles and the skills each one needs (Roles).
//  - A manager (or an administrator) adds a role, names the skills it needs, and chooses a
//    role for their team. Their direct reports follow it; a manager with managers below is
//    asked whether it reaches everyone below, and a manager lower down can choose another
//    for their own team. Nobody is forced: a person's own role wins.
//  - Role names are unique, and so are skill names (case, spacing and punctuation aside).
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { guardAction, audit, getEngine, type Viewer } from "@/lib/server";
import { roleNamed } from "@/lib/skill-names";
import { teamRoleReach } from "@/lib/team-roles";

export type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };

/** Who may add a role and say which skills it needs: anyone who manages people, and administrators. */
const mayEditRoles = (v: Viewer) => v.isAdmin || v.manageIds.size > 0;
const mayManage = (v: Viewer, managerId: string) => v.isAdmin || v.manageIds.has(managerId);

function refresh() {
  for (const p of ["/roles", "/team", "/people", "/my-skills", "/insights", "/settings/roles", "/settings/people"]) revalidatePath(p);
  revalidatePath("/", "layout");
}

const roleName = z.string().trim().min(2, "Name the role.").max(80, "At most 80 characters.");

export async function createRole(input: { name: string; description?: string }): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!mayEditRoles(v)) return { ok: false, error: "Managers and administrators add roles." };
  const p = z.object({ name: roleName, description: z.string().trim().max(500).optional().default("") }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the name." };
  const db = await getDb();
  const taken = await roleNamed(db, p.data.name);
  if (taken) return { ok: false, error: `A role called “${taken.name}” already exists. Role names are unique: use it, or choose a more specific name.` };
  const [row] = await db.insert(schema.jobRole).values({ name: p.data.name, description: p.data.description }).returning({ id: schema.jobRole.id });
  await audit(v, "create_role", "job_role", row.id, p.data);
  refresh();
  return { ok: true, id: row.id, message: `Role “${p.data.name}” added.` };
}

export async function updateRole(input: { id: string; name: string; description?: string }): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!mayEditRoles(v)) return { ok: false, error: "Managers and administrators change roles." };
  const p = z.object({ id: z.string().min(1), name: roleName, description: z.string().trim().max(500).optional().default("") }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the name." };
  const db = await getDb();
  const taken = await roleNamed(db, p.data.name, p.data.id);
  if (taken) return { ok: false, error: `A role called “${taken.name}” already exists. Role names are unique.` };
  await db.update(schema.jobRole).set({ name: p.data.name, description: p.data.description }).where(eq(schema.jobRole.id, p.data.id));
  await audit(v, "update_role", "job_role", p.data.id, p.data);
  refresh();
  return { ok: true, message: "Saved." };
}

// ---- the skills a role needs -----------------------------------------------------------

const roleSkillIn = z.object({
  roleId: z.string().min(1),
  skillId: z.string().min(1),
  target: z.coerce.number().int().min(1, "A level from 1 to 5.").max(5),
  mandatory: z.boolean().default(true),
});

/** Adds a skill to a role, or changes its level (for every grade; per-grade levels are in Settings). */
export async function saveRoleNeed(input: z.input<typeof roleSkillIn>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!mayEditRoles(v)) return { ok: false, error: "Managers and administrators say what a role needs." };
  const p = roleSkillIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  const engine = await getEngine();
  const skill = engine.skillById.get(p.data.skillId);
  // a skill added a moment ago is not in the cached picture yet: only refuse what is known to be a heading
  if (skill && !engine.isRateable(skill.id)) return { ok: false, error: "That skill has sub-skills: choose one of them." };
  const db = await getDb();
  const where = and(eq(schema.roleSkill.roleId, p.data.roleId), eq(schema.roleSkill.skillId, p.data.skillId));
  const had = await db.select().from(schema.roleSkill).where(where);
  if (had.some((r) => r.gradeId == null)) {
    await db.update(schema.roleSkill).set({ target: p.data.target }).where(and(where, isNull(schema.roleSkill.gradeId)));
  } else {
    await db.insert(schema.roleSkill).values({ roleId: p.data.roleId, gradeId: null, skillId: p.data.skillId, target: p.data.target, mandatory: p.data.mandatory });
  }
  // mandatory is one answer per skill, whatever the grade
  await db.update(schema.roleSkill).set({ mandatory: p.data.mandatory }).where(where);
  await audit(v, "set_role_skill", "role_skill", p.data.roleId, p.data);
  refresh();
  return { ok: true, message: "Saved." };
}

export async function removeRoleNeed(roleId: string, skillId: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!mayEditRoles(v)) return { ok: false, error: "Managers and administrators say what a role needs." };
  const db = await getDb();
  await db.delete(schema.roleSkill).where(and(eq(schema.roleSkill.roleId, roleId), eq(schema.roleSkill.skillId, skillId)));
  await audit(v, "remove_role_skill", "role_skill", roleId, { skillId });
  refresh();
  return { ok: true, message: "Removed from the role." };
}

// ---- who has which role ----------------------------------------------------------------

const teamRoleIn = z.object({
  managerId: z.string().min(1),
  /** null = the team has no role of its own (it follows the one above, if any) */
  roleId: z.string().nullable(),
  /** also everyone further below, until a manager who chose another */
  cascade: z.boolean().default(false),
  /** also change the people it reaches who have a role of their own (they then follow the team) */
  replaceOwn: z.boolean().default(false),
});

export async function setTeamRole(input: z.input<typeof teamRoleIn>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  const p = teamRoleIn.safeParse(input);
  if (!p.success) return { ok: false, error: "Check the fields." };
  const { managerId, roleId, cascade, replaceOwn } = p.data;
  if (!mayManage(v, managerId)) return { ok: false, error: "Only the team's manager, a manager above them, or an administrator chooses the team's role." };
  const engine = await getEngine();
  const manager = engine.empById.get(managerId);
  if (!manager || !engine.isManager(manager)) return { ok: false, error: "Nobody reports to this person, so there is no team to give a role." };
  const db = await getDb();
  if (roleId) {
    const [role] = await db.select({ id: schema.jobRole.id }).from(schema.jobRole).where(eq(schema.jobRole.id, roleId));
    if (!role) return { ok: false, error: "That role does not exist any more." };
  }
  let replaced = 0;
  await db.transaction(async (tx) => {
    await tx.update(schema.employee).set({ teamRoleId: roleId, teamRoleCascade: roleId ? cascade : false }).where(eq(schema.employee.id, managerId));
    if (roleId && replaceOwn) {
      const people = engine.activeEmployees.map((e) => ({ id: e.id, managerId: e.managerId, roleId: e.ownRoleId ?? null, teamRoleId: e.teamRoleId ?? null, teamRoleCascade: e.teamRoleCascade ?? false }));
      const ids = teamRoleReach(people, managerId, cascade).own.map((e) => e.id);
      if (manager.ownRoleId) ids.push(managerId);
      replaced = ids.length;
      for (let i = 0; i < ids.length; i += 500) {
        await tx.update(schema.employee).set({ roleId: null }).where(inArray(schema.employee.id, ids.slice(i, i + 500)));
      }
    }
  });
  await audit(v, "set_team_role", "employee", managerId, { roleId, cascade: roleId ? cascade : false, replaceOwn, replaced });
  refresh();
  if (!roleId) return { ok: true, message: "The team has no role of its own now." };
  return { ok: true, message: `Team role saved${cascade ? " for everyone below" : ""}${replaced ? `; ${replaced} ${replaced === 1 ? "person" : "people"} with a role of their own now follow it` : ""}.` };
}

/** One person's own role; null = they follow their team's role. */
export async function setPersonRole(input: { employeeId: string; roleId: string | null }): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  const p = z.object({ employeeId: z.string().min(1), roleId: z.string().nullable() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Check the fields." };
  const engine = await getEngine();
  const e = engine.empById.get(p.data.employeeId);
  if (!e) return { ok: false, error: "Person not found." };
  if (!(v.isAdmin || (e.managerId && v.manageIds.has(e.managerId)))) return { ok: false, error: "Only the person's manager, a manager above them, or an administrator changes their role." };
  const db = await getDb();
  if (p.data.roleId) {
    const [role] = await db.select({ id: schema.jobRole.id }).from(schema.jobRole).where(eq(schema.jobRole.id, p.data.roleId));
    if (!role) return { ok: false, error: "That role does not exist any more." };
  }
  await db.update(schema.employee).set({ roleId: p.data.roleId }).where(eq(schema.employee.id, p.data.employeeId));
  await audit(v, "set_person_role", "employee", p.data.employeeId, { roleId: p.data.roleId });
  refresh();
  return { ok: true, message: p.data.roleId ? "Role saved." : "They follow their team's role now." };
}
