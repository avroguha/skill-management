// A team's setup in the database: what is in force (team_role, team_role_member,
// team_role_skill, team_need) and the draft of changes not confirmed yet (team_draft).
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";
import { emptySetup, type TeamSetup } from "./team-setup.ts";

/** What is in force for one team. */
export async function readLiveSetup(db: DB, managerId: string): Promise<TeamSetup> {
  const roles = await db.select().from(s.teamRole).where(eq(s.teamRole.managerId, managerId));
  const ids = roles.map((r) => r.id);
  const [members, skills, needs] = await Promise.all([
    ids.length ? db.select().from(s.teamRoleMember).where(inArray(s.teamRoleMember.roleId, ids)) : [],
    ids.length ? db.select().from(s.teamRoleSkill).where(inArray(s.teamRoleSkill.roleId, ids)) : [],
    db.select().from(s.teamNeed).where(eq(s.teamNeed.managerId, managerId)),
  ]);
  roles.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  return {
    roles: roles.map((r) => ({
      id: r.id, name: r.name, description: r.description, color: r.color,
      members: members.filter((m) => m.roleId === r.id).map((m) => m.employeeId).sort(),
      skills: skills.filter((k) => k.roleId === r.id).map((k) => ({ skillId: k.skillId, target: k.target, mandatory: k.mandatory })),
    })),
    needs: needs.filter((n) => !n.dismissed).map((n) => ({ skillId: n.skillId, minLevel: n.minLevel, headcount: n.headcount, note: n.note })),
    dismissed: needs.filter((n) => n.dismissed).map((n) => n.skillId),
  };
}

export interface StoredDraft { setup: TeamSetup; authorName: string; updatedAt: Date }

export async function readDraft(db: DB, managerId: string): Promise<StoredDraft | null> {
  const [row] = await db.select().from(s.teamDraft).where(eq(s.teamDraft.managerId, managerId));
  if (!row) return null;
  const doc = row.doc as Partial<TeamSetup>;
  // a draft saved before roles had a colour: each role keeps the colour it has in force
  const colours = new Map((await db.select({ id: s.teamRole.id, color: s.teamRole.color }).from(s.teamRole).where(eq(s.teamRole.managerId, managerId))).map((r) => [r.id, r.color]));
  return {
    setup: { ...emptySetup(), ...doc, roles: (doc.roles ?? []).map((r) => ({ ...r, description: r.description ?? "", color: r.color ?? colours.get(r.id) ?? "", members: r.members ?? [], skills: r.skills ?? [] })) },
    authorName: row.authorName, updatedAt: row.updatedAt,
  };
}

export async function saveDraft(db: DB, managerId: string, setup: TeamSetup, author: { id: string | null; name: string }): Promise<void> {
  const values = { doc: setup as never, authorId: author.id, authorName: author.name, updatedAt: new Date() };
  await db.insert(s.teamDraft).values({ managerId, ...values }).onConflictDoUpdate({ target: s.teamDraft.managerId, set: values });
}

export async function deleteDraft(db: DB, managerId: string): Promise<void> {
  await db.delete(s.teamDraft).where(eq(s.teamDraft.managerId, managerId));
}

/** Puts a setup in force for one team, replacing what was there, and drops its draft. One transaction. */
export async function applySetup(db: DB, managerId: string, setup: TeamSetup): Promise<void> {
  await db.transaction(async (tx) => {
    const keep = setup.roles.map((r) => r.id);
    await tx.delete(s.teamRole).where(keep.length ? and(eq(s.teamRole.managerId, managerId), notInArray(s.teamRole.id, keep)) : eq(s.teamRole.managerId, managerId));
    const had = new Set((await tx.select({ id: s.teamRole.id }).from(s.teamRole).where(eq(s.teamRole.managerId, managerId))).map((r) => r.id));
    // names are unique per team: clear the way first, so two roles can swap names
    for (const r of setup.roles) if (had.has(r.id)) await tx.update(s.teamRole).set({ name: `(renaming) ${r.id}` }).where(eq(s.teamRole.id, r.id));
    for (const [i, r] of setup.roles.entries()) {
      if (had.has(r.id)) await tx.update(s.teamRole).set({ name: r.name, description: r.description, color: r.color ?? "", sort: i + 1 }).where(eq(s.teamRole.id, r.id));
      else await tx.insert(s.teamRole).values({ id: r.id, managerId, name: r.name, description: r.description, color: r.color ?? "", sort: i + 1 });
      await tx.delete(s.teamRoleMember).where(eq(s.teamRoleMember.roleId, r.id));
      if (r.members.length) await tx.insert(s.teamRoleMember).values(r.members.map((employeeId) => ({ roleId: r.id, employeeId })));
      await tx.delete(s.teamRoleSkill).where(eq(s.teamRoleSkill.roleId, r.id));
      if (r.skills.length) await tx.insert(s.teamRoleSkill).values(r.skills.map((k) => ({ roleId: r.id, skillId: k.skillId, target: k.target, mandatory: k.mandatory })));
    }
    await tx.delete(s.teamNeed).where(eq(s.teamNeed.managerId, managerId));
    const needs = [
      ...setup.needs.map((n) => ({ managerId, skillId: n.skillId, minLevel: n.minLevel, headcount: n.headcount, note: n.note, dismissed: false })),
      ...setup.dismissed.filter((id) => !setup.needs.some((n) => n.skillId === id)).map((skillId) => ({ managerId, skillId, minLevel: 1, headcount: 1, note: "", dismissed: true })),
    ];
    if (needs.length) await tx.insert(s.teamNeed).values(needs);
    await tx.delete(s.teamDraft).where(eq(s.teamDraft.managerId, managerId));
  });
}
