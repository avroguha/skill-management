// Skill and role names are unique: two names are the same when they differ only in case,
// accents, spacing or punctuation. A sub-skill's name is unique within its skill (AWS > IAM
// and Azure > IAM are two skills; two "IAM" under AWS are not).
import { ne } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";
import { sameName } from "./similar.ts";

/** The skill at the same place in the catalogue that already has this name (or goes by it), if any. */
export async function skillNamed(db: DB, name: string, parentId: string | null, exceptId?: string) {
  const rows = await db.select({ id: s.skill.id, name: s.skill.name, aliases: s.skill.aliases, parentId: s.skill.parentId, status: s.skill.status })
    .from(s.skill).where(ne(s.skill.status, "retired"));
  return rows.find((r) => r.id !== exceptId && (r.parentId ?? null) === (parentId ?? null)
    && (sameName(r.name, name) || r.aliases.some((a) => sameName(a, name)))) ?? null;
}

/** Any skill, at any place in the catalogue, with this name or going by it: what a suggestion is matched against. */
export async function anySkillNamed(db: DB, name: string) {
  const rows = await db.select({ id: s.skill.id, name: s.skill.name, aliases: s.skill.aliases, status: s.skill.status })
    .from(s.skill).where(ne(s.skill.status, "retired"));
  return rows.find((r) => sameName(r.name, name)) ?? rows.find((r) => r.aliases.some((a) => sameName(a, name))) ?? null;
}

/** The role that already has this name, if any. */
export async function roleNamed(db: DB, name: string, exceptId?: string) {
  const roles = await db.select({ id: s.jobRole.id, name: s.jobRole.name }).from(s.jobRole);
  return roles.find((r) => r.id !== exceptId && sameName(r.name, name)) ?? null;
}
