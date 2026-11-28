// Reads the whole skills picture into memory for the engine. One query per table;
// at a few thousand people and a few hundred skills this is a few MB and well
// under a second, which keeps every page's numbers consistent with every other.
import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";
import { DEFAULT_SETTINGS, type Dataset, type Settings } from "./engine/engine.ts";

export async function readSettings(db: DB): Promise<Settings> {
  const [row] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, "settings"));
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function loadDatasetFrom(db: DB): Promise<Dataset> {
  const [settings, employees, categories, skills, roles, members, grades, roleSkills, teamNeeds, extras, ratings] = await Promise.all([
    readSettings(db),
    db.select().from(s.employee),
    db.select().from(s.skillCategory),
    db.select().from(s.skill),
    db.select().from(s.teamRole),
    db.select().from(s.teamRoleMember),
    db.select().from(s.grade),
    db.select().from(s.teamRoleSkill),
    db.select().from(s.teamNeed),
    db.select().from(s.teamPersonSkill),
    db.select({
      employeeId: s.rating.employeeId, skillId: s.rating.skillId,
      selfLevel: s.rating.selfLevel, selfAt: s.rating.selfAt,
      validatedLevel: s.rating.validatedLevel, validatedAt: s.rating.validatedAt,
      interest: s.rating.interest, status: s.rating.status,
    }).from(s.rating),
  ]);
  // a person is in the roles of their OWN manager's team: one left behind in another team
  // (they moved to another manager) does not count
  const roleManager = new Map(roles.map((r) => [r.id, r.managerId]));
  const managerOf = new Map(employees.map((e) => [e.id, e.managerId]));
  const roleIds = new Map<string, string[]>();
  for (const m of members) {
    if (roleManager.get(m.roleId) !== managerOf.get(m.employeeId)) continue;
    roleIds.set(m.employeeId, [...(roleIds.get(m.employeeId) ?? []), m.roleId]);
  }
  return {
    now: Date.now(),
    settings,
    employees: employees.map((e) => ({
      id: e.id, name: e.name, email: e.email, title: e.title, teamName: e.teamName,
      roleIds: roleIds.get(e.id) ?? [], gradeId: e.gradeId, managerId: e.managerId, active: e.active, location: e.location,
    })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, sort: c.sort })),
    skills: skills.map((k) => ({ id: k.id, name: k.name, categoryId: k.categoryId, parentId: k.parentId, status: k.status, sort: k.sort })),
    roles: roles.map((r) => ({ id: r.id, name: r.name, managerId: r.managerId, description: r.description, sort: r.sort, color: r.color })),
    grades: grades.map((g) => ({ id: g.id, name: g.name, rank: g.rank })),
    roleSkills: roleSkills.map((r) => ({ roleId: r.roleId, skillId: r.skillId, target: r.target, mandatory: r.mandatory })),
    // what a manager asked of one person counts while that person is still in their team
    personSkills: extras.filter((x) => managerOf.get(x.employeeId) === x.managerId)
      .map((x) => ({ employeeId: x.employeeId, skillId: x.skillId, target: x.target, mandatory: x.mandatory, note: x.note })),
    teamNeeds: teamNeeds.map((n) => ({ managerId: n.managerId, skillId: n.skillId, minLevel: n.minLevel, headcount: n.headcount, dismissed: n.dismissed })),
    ratings,
  };
}
