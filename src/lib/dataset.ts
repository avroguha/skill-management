// Reads the whole skills picture into memory for the engine. One query per table;
// at a few thousand people and a few hundred skills this is a few MB and well
// under a second, which keeps every page's numbers consistent with every other.
import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";
import { DEFAULT_SETTINGS, type Dataset, type Settings } from "./engine/engine.ts";
import { resolveRoles } from "./team-roles.ts";

export async function readSettings(db: DB): Promise<Settings> {
  const [row] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, "settings"));
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function loadDatasetFrom(db: DB): Promise<Dataset> {
  const [settings, employees, categories, skills, roles, grades, roleSkills, teamNeeds, ratings] = await Promise.all([
    readSettings(db),
    db.select().from(s.employee),
    db.select().from(s.skillCategory),
    db.select().from(s.skill),
    db.select().from(s.jobRole),
    db.select().from(s.grade),
    db.select().from(s.roleSkill),
    db.select().from(s.teamNeed),
    db.select({
      employeeId: s.rating.employeeId, skillId: s.rating.skillId,
      selfLevel: s.rating.selfLevel, selfAt: s.rating.selfAt,
      validatedLevel: s.rating.validatedLevel, validatedAt: s.rating.validatedAt,
      interest: s.rating.interest, status: s.rating.status,
    }).from(s.rating),
  ]);
  // a role is a person's own, else the one their manager chose for the team (people who have
  // left neither give nor take one)
  const roleOf = resolveRoles(employees.filter((e) => e.active));
  return {
    now: Date.now(),
    settings,
    employees: employees.map((e) => ({
      id: e.id, name: e.name, email: e.email, title: e.title, teamName: e.teamName,
      roleId: roleOf.get(e.id)?.roleId ?? e.roleId, roleFrom: roleOf.get(e.id)?.from ?? null,
      ownRoleId: e.roleId, teamRoleId: e.teamRoleId, teamRoleCascade: e.teamRoleCascade,
      gradeId: e.gradeId, managerId: e.managerId, active: e.active, location: e.location,
    })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, sort: c.sort })),
    skills: skills.map((k) => ({ id: k.id, name: k.name, categoryId: k.categoryId, parentId: k.parentId, status: k.status, sort: k.sort })),
    roles: roles.map((r) => ({ id: r.id, name: r.name })),
    grades: grades.map((g) => ({ id: g.id, name: g.name, rank: g.rank })),
    roleSkills: roleSkills.map((r) => ({ roleId: r.roleId, gradeId: r.gradeId, skillId: r.skillId, target: r.target, mandatory: r.mandatory })),
    teamNeeds: teamNeeds.map((n) => ({ managerId: n.managerId, skillId: n.skillId, minLevel: n.minLevel, headcount: n.headcount })),
    ratings,
  };
}
