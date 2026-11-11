"use server";
// Administrator actions. Every one checks the caller is an administrator, validates
// its input, refuses changes that would break the data (cycles in the org tree,
// deleting a skill that has ratings), and writes an audit entry.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { getDb, schema } from "@/db";
import { actionViewer, audit, type Viewer } from "@/lib/server";
import { getAuth, appUrl, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { samlProviderBody } from "@/lib/saml";

export type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };
type Data = Record<string, unknown>;

async function admin(): Promise<Viewer> {
  const v = await actionViewer();
  if (!v.isAdmin) throw new Error("Administrators only.");
  return v;
}
function fail(e: unknown): Result {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the fields." };
  const msg = (e as Error).message ?? String(e);
  if (/duplicate key|unique/i.test(msg)) return { ok: false, error: "That name is already used." };
  return { ok: false, error: msg };
}
const done = (paths: string[], message = "Saved.", id?: string): Result => {
  for (const p of paths) revalidatePath(p);
  revalidatePath("/", "layout");
  return { ok: true, message, id };
};
const optId = z.string().optional().nullable().transform((x) => (x && x !== "none" ? x : null));
const text = (max = 200) => z.string().trim().max(max).optional().default("");
const level = z.coerce.number().int().min(0).max(5);

// ---- taxonomy ------------------------------------------------------------------------

const categoryIn = z.object({ id: z.string().optional(), name: z.string().trim().min(2, "Name the category.").max(80), description: text(500), sort: z.coerce.number().int().default(0) });
export async function saveCategory(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = categoryIn.parse(data);
    const db = await getDb();
    let id = d.id;
    if (id) await db.update(schema.skillCategory).set({ name: d.name, description: d.description, sort: d.sort }).where(eq(schema.skillCategory.id, id));
    else id = (await db.insert(schema.skillCategory).values({ name: d.name, description: d.description, sort: d.sort }).returning())[0].id;
    await audit(v, d.id ? "update_category" : "create_category", "skill_category", id, d);
    return done(["/admin/taxonomy"], "Category saved.", id);
  } catch (e) { return fail(e); }
}
export async function deleteCategory(id: string): Promise<Result> {
  try {
    const v = await admin();
    const db = await getDb();
    const [{ n }] = await db.select({ n: count() }).from(schema.skill).where(eq(schema.skill.categoryId, id));
    if (n) return { ok: false, error: `It still holds ${n} skill${n === 1 ? "" : "s"}. Move or delete them first.` };
    await db.delete(schema.skillCategory).where(eq(schema.skillCategory.id, id));
    await audit(v, "delete_category", "skill_category", id);
    return done(["/admin/taxonomy"], "Category deleted.");
  } catch (e) { return fail(e); }
}

const skillIn = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name the skill.").max(80),
  categoryId: z.string().min(1, "Choose a category."),
  parentId: optId,
  description: text(1000),
  aliases: z.union([z.string(), z.array(z.string())]).optional().transform((x) =>
    (Array.isArray(x) ? x : (x ?? "").split(/[,;]/)).map((s) => s.trim()).filter(Boolean)),
  status: z.enum(["active", "draft", "retired"]).default("active"),
  sort: z.coerce.number().int().default(0),
});
export async function saveSkill(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = skillIn.parse(data);
    const db = await getDb();
    if (d.parentId) {
      if (d.parentId === d.id) return { ok: false, error: "A skill cannot be its own parent." };
      const [p] = await db.select().from(schema.skill).where(eq(schema.skill.id, d.parentId));
      if (!p) return { ok: false, error: "The parent skill does not exist." };
      if (p.parentId) return { ok: false, error: "Sub-skills go one level deep: choose a top-level skill as the parent." };
      if (p.categoryId !== d.categoryId) return { ok: false, error: "A sub-skill must be in its parent's category." };
    }
    if (d.id && d.parentId) {
      const [{ n }] = await db.select({ n: count() }).from(schema.skill).where(eq(schema.skill.parentId, d.id));
      if (n) return { ok: false, error: "This skill has sub-skills of its own, so it cannot become a sub-skill." };
    }
    const values = { name: d.name, categoryId: d.categoryId, parentId: d.parentId, description: d.description, aliases: d.aliases, status: d.status, sort: d.sort };
    let id = d.id;
    if (id) {
      await db.update(schema.skill).set(values).where(eq(schema.skill.id, id));
      // children follow their parent's category
      await db.update(schema.skill).set({ categoryId: d.categoryId }).where(eq(schema.skill.parentId, id));
    } else id = (await db.insert(schema.skill).values(values).returning())[0].id;
    await audit(v, d.id ? "update_skill" : "create_skill", "skill", id, values);
    return done(["/admin/taxonomy", "/skills"], "Skill saved.", id);
  } catch (e) { return fail(e); }
}
export async function deleteSkill(id: string): Promise<Result> {
  try {
    const v = await admin();
    const db = await getDb();
    const [{ r }] = await db.select({ r: count() }).from(schema.rating).where(eq(schema.rating.skillId, id));
    const [{ k }] = await db.select({ k: count() }).from(schema.skill).where(eq(schema.skill.parentId, id));
    if (k) return { ok: false, error: "It has sub-skills. Delete or move them first." };
    if (r) return { ok: false, error: `${r} rating${r === 1 ? "" : "s"} use it. Retire it instead (history is kept), or merge it into another skill.` };
    await db.delete(schema.skill).where(eq(schema.skill.id, id));
    await audit(v, "delete_skill", "skill", id);
    return done(["/admin/taxonomy", "/skills"], "Skill deleted.");
  } catch (e) { return fail(e); }
}
/** Moves every rating, target and requirement from one skill to another, keeps the old name as an alias, retires the old skill. */
export async function mergeSkill(fromId: string, intoId: string): Promise<Result> {
  try {
    const v = await admin();
    if (!fromId || !intoId || fromId === intoId) return { ok: false, error: "Choose two different skills." };
    const db = await getDb();
    const [from] = await db.select().from(schema.skill).where(eq(schema.skill.id, fromId));
    const [into] = await db.select().from(schema.skill).where(eq(schema.skill.id, intoId));
    if (!from || !into) return { ok: false, error: "Skill not found." };
    await db.transaction(async (tx) => {
      // ratings: keep the target's rating where both exist, move the rest
      await tx.execute(sql`update rating set skill_id = ${intoId} where skill_id = ${fromId}
        and employee_id not in (select employee_id from rating where skill_id = ${intoId})`);
      await tx.delete(schema.rating).where(eq(schema.rating.skillId, fromId));
      await tx.execute(sql`update rating_event set skill_id = ${intoId} where skill_id = ${fromId}`);
      await tx.execute(sql`update employee_target set skill_id = ${intoId} where skill_id = ${fromId}
        and employee_id not in (select employee_id from employee_target where skill_id = ${intoId})`);
      await tx.delete(schema.employeeTarget).where(eq(schema.employeeTarget.skillId, fromId));
      await tx.execute(sql`update role_skill set skill_id = ${intoId} where skill_id = ${fromId}
        and (role_id, coalesce(grade_id, '')) not in (select role_id, coalesce(grade_id, '') from role_skill where skill_id = ${intoId})`);
      await tx.delete(schema.roleSkill).where(eq(schema.roleSkill.skillId, fromId));
      await tx.execute(sql`update unit_requirement set skill_id = ${intoId} where skill_id = ${fromId}
        and unit_id not in (select unit_id from unit_requirement where skill_id = ${intoId})`);
      await tx.delete(schema.unitRequirement).where(eq(schema.unitRequirement.skillId, fromId));
      await tx.update(schema.trainingPlan).set({ skillId: intoId }).where(eq(schema.trainingPlan.skillId, fromId));
      await tx.update(schema.skill).set({ aliases: [...new Set([...into.aliases, from.name, ...from.aliases])] }).where(eq(schema.skill.id, intoId));
      await tx.update(schema.skill).set({ status: "retired", description: `Merged into ${into.name}. ${from.description}`.trim() }).where(eq(schema.skill.id, fromId));
    });
    await audit(v, "merge_skill", "skill", fromId, { into: intoId });
    return done(["/admin/taxonomy", "/skills"], `Merged “${from.name}” into “${into.name}”.`);
  } catch (e) { return fail(e); }
}

// ---- levels, roles, grades -------------------------------------------------------------

export async function saveLevel(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = z.object({ level, name: z.string().trim().min(2).max(40), description: z.string().trim().min(5, "Describe what someone at this level can do.").max(500) }).parse(data);
    const db = await getDb();
    await db.update(schema.proficiencyLevel).set({ name: d.name, description: d.description }).where(eq(schema.proficiencyLevel.level, d.level));
    await audit(v, "update_level", "proficiency_level", String(d.level), d);
    return done(["/admin/levels"], "Level saved.");
  } catch (e) { return fail(e); }
}

const roleIn = z.object({ id: z.string().optional(), name: z.string().trim().min(2, "Name the role.").max(80), description: text(500) });
export async function saveRole(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = roleIn.parse(data);
    const db = await getDb();
    let id = d.id;
    if (id) await db.update(schema.jobRole).set({ name: d.name, description: d.description }).where(eq(schema.jobRole.id, id));
    else id = (await db.insert(schema.jobRole).values({ name: d.name, description: d.description }).returning())[0].id;
    await audit(v, d.id ? "update_role" : "create_role", "job_role", id, d);
    return done(["/admin/roles"], "Role saved.", id);
  } catch (e) { return fail(e); }
}
export async function deleteRole(id: string): Promise<Result> {
  try {
    const v = await admin();
    const db = await getDb();
    const [{ n }] = await db.select({ n: count() }).from(schema.employee).where(eq(schema.employee.roleId, id));
    if (n) return { ok: false, error: `${n} people hold this role. Move them to another role first.` };
    await db.delete(schema.jobRole).where(eq(schema.jobRole.id, id));
    await audit(v, "delete_role", "job_role", id);
    return done(["/admin/roles"], "Role deleted.");
  } catch (e) { return fail(e); }
}
const gradeIn = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(40), rank: z.coerce.number().int().min(0).max(100) });
export async function saveGrade(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = gradeIn.parse(data);
    const db = await getDb();
    let id = d.id;
    if (id) await db.update(schema.grade).set({ name: d.name, rank: d.rank }).where(eq(schema.grade.id, id));
    else id = (await db.insert(schema.grade).values({ name: d.name, rank: d.rank }).returning())[0].id;
    await audit(v, d.id ? "update_grade" : "create_grade", "grade", id, d);
    return done(["/admin/roles"], "Grade saved.", id);
  } catch (e) { return fail(e); }
}
export async function deleteGrade(id: string): Promise<Result> {
  try {
    const v = await admin();
    const db = await getDb();
    const [{ n }] = await db.select({ n: count() }).from(schema.employee).where(eq(schema.employee.gradeId, id));
    if (n) return { ok: false, error: `${n} people have this grade. Change it first.` };
    await db.delete(schema.grade).where(eq(schema.grade.id, id));
    await audit(v, "delete_grade", "grade", id);
    return done(["/admin/roles"], "Grade deleted.");
  } catch (e) { return fail(e); }
}
/** Sets (or with target null, clears) one cell of a role's skill matrix. */
export async function setRoleSkill(input: { roleId: string; gradeId: string | null; skillId: string; target: number | null; mandatory: boolean }): Promise<Result> {
  try {
    const v = await admin();
    const db = await getDb();
    const where = and(eq(schema.roleSkill.roleId, input.roleId), eq(schema.roleSkill.skillId, input.skillId),
      input.gradeId ? eq(schema.roleSkill.gradeId, input.gradeId) : isNull(schema.roleSkill.gradeId));
    await db.delete(schema.roleSkill).where(where);
    if (input.target != null) {
      const t = level.parse(input.target);
      if (t < 1) return { ok: false, error: "A target is 1 or more; clear the cell to drop the requirement." };
      await db.insert(schema.roleSkill).values({ roleId: input.roleId, gradeId: input.gradeId, skillId: input.skillId, target: t, mandatory: input.mandatory });
    }
    await audit(v, "set_role_skill", "role_skill", input.roleId, input);
    return done(["/admin/roles"], "Saved.");
  } catch (e) { return fail(e); }
}

// ---- organisation ---------------------------------------------------------------------

const unitIn = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name the unit.").max(120),
  kind: z.enum(["company", "division", "department", "team"]).default("team"),
  parentId: optId,
  managerId: optId,
  sort: z.coerce.number().int().default(0),
});
export async function saveUnit(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = unitIn.parse(data);
    const db = await getDb();
    if (d.id && d.parentId) {
      // refuse a move under its own subtree
      const all = await db.select({ id: schema.orgUnit.id, parentId: schema.orgUnit.parentId }).from(schema.orgUnit);
      let p: string | null = d.parentId;
      const seen = new Set<string>();
      while (p && !seen.has(p)) {
        if (p === d.id) return { ok: false, error: "A unit cannot sit under itself or one of its own sub-units." };
        seen.add(p);
        p = all.find((u) => u.id === p)?.parentId ?? null;
      }
    }
    const values = { name: d.name, kind: d.kind, parentId: d.parentId, managerId: d.managerId, sort: d.sort };
    let id = d.id;
    if (id) await db.update(schema.orgUnit).set(values).where(eq(schema.orgUnit.id, id));
    else id = (await db.insert(schema.orgUnit).values(values).returning())[0].id;
    await audit(v, d.id ? "update_unit" : "create_unit", "org_unit", id, values);
    return done(["/admin/org"], "Unit saved.", id);
  } catch (e) { return fail(e); }
}
export async function deleteUnit(id: string): Promise<Result> {
  try {
    const v = await admin();
    const db = await getDb();
    const [{ c }] = await db.select({ c: count() }).from(schema.orgUnit).where(eq(schema.orgUnit.parentId, id));
    const [{ m }] = await db.select({ m: count() }).from(schema.employee).where(eq(schema.employee.unitId, id));
    if (c || m) return { ok: false, error: `It still has ${c} sub-unit${c === 1 ? "" : "s"} and ${m} ${m === 1 ? "person" : "people"}. Move them first.` };
    await db.delete(schema.orgUnit).where(eq(schema.orgUnit.id, id));
    await audit(v, "delete_unit", "org_unit", id);
    return done(["/admin/org"], "Unit deleted.");
  } catch (e) { return fail(e); }
}

const employeeIn = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the person.").max(120),
  email: z.string().trim().toLowerCase().email("A valid e-mail address, please."),
  title: text(120),
  unitId: optId,
  roleId: optId,
  gradeId: optId,
  managerId: optId,
  location: text(80),
  active: z.union([z.boolean(), z.string()]).transform((x) => x === true || x === "true" || x === "on").default(true),
});
export async function saveEmployee(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = employeeIn.parse(data);
    if (d.id && d.managerId === d.id) return { ok: false, error: "Someone cannot be their own manager." };
    const db = await getDb();
    const values = { name: d.name, email: d.email, title: d.title, unitId: d.unitId, roleId: d.roleId, gradeId: d.gradeId, managerId: d.managerId, location: d.location, active: d.active };
    let id = d.id;
    if (id) await db.update(schema.employee).set(values).where(eq(schema.employee.id, id));
    else id = (await db.insert(schema.employee).values(values).returning())[0].id;
    // link a user with the same e-mail that is not linked yet
    await db.execute(sql`update employee set user_id = u.id from "user" u
      where employee.id = ${id} and employee.user_id is null and lower(u.email) = lower(employee.email)
      and not exists (select 1 from employee e2 where e2.user_id = u.id)`);
    await audit(v, d.id ? "update_employee" : "create_employee", "employee", id, values);
    return done(["/admin/org", "/people"], "Saved.", id);
  } catch (e) { return fail(e); }
}

// ---- cycles and settings -------------------------------------------------------------

const cycleIn = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date, please."),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date, please."),
  status: z.enum(["draft", "open", "closed"]).default("draft"),
});
export async function saveCycle(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = cycleIn.parse(data);
    if (d.dueOn < d.startsOn) return { ok: false, error: "The due date is before the start." };
    const db = await getDb();
    let id = d.id;
    if (d.status === "open") {
      // one open cycle at a time
      await db.update(schema.assessmentCycle).set({ status: "closed" }).where(and(eq(schema.assessmentCycle.status, "open"), id ? ne(schema.assessmentCycle.id, id) : sql`true`));
    }
    if (id) await db.update(schema.assessmentCycle).set(d).where(eq(schema.assessmentCycle.id, id));
    else id = (await db.insert(schema.assessmentCycle).values(d).returning())[0].id;
    await audit(v, d.id ? "update_cycle" : "create_cycle", "assessment_cycle", id, d);
    return done(["/admin/cycles", "/assess"], d.status === "open" ? "Cycle open. Any other open cycle was closed." : "Cycle saved.", id);
  } catch (e) { return fail(e); }
}

export async function saveSettings(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = z.object({
      staleMonths: z.coerce.number().int().min(1).max(60),
      excludeStale: z.union([z.boolean(), z.string()]).transform((x) => x === true || x === "true" || x === "on"),
      greenAt: z.coerce.number().int().min(1).max(100),
      amberAt: z.coerce.number().int().min(0).max(99),
    }).parse(data);
    if (d.amberAt >= d.greenAt) return { ok: false, error: "The amber threshold must be below the green one." };
    const db = await getDb();
    await db.insert(schema.appSetting).values({ key: "settings", value: d })
      .onConflictDoUpdate({ target: schema.appSetting.key, set: { value: d } });
    await audit(v, "update_settings", "app_setting", "settings", d);
    return done(["/admin/settings"], "Settings saved.");
  } catch (e) { return fail(e); }
}

// ---- users and access ------------------------------------------------------------------

export async function setUserAccess(input: { userId: string; role: string; employeeId: string | null }): Promise<Result> {
  try {
    const v = await admin();
    const role = z.enum(["admin", "executive", "manager", "employee"]).parse(input.role);
    const db = await getDb();
    if (input.userId === v.userId && role !== "admin") return { ok: false, error: "You cannot take away your own administrator access." };
    if (role !== "admin") {
      const [{ n }] = await db.select({ n: count() }).from(schema.user).where(and(eq(schema.user.role, "admin"), ne(schema.user.id, input.userId)));
      if (!n) return { ok: false, error: "This is the last administrator." };
    }
    await db.update(schema.user).set({ role }).where(eq(schema.user.id, input.userId));
    await db.update(schema.employee).set({ userId: null }).where(eq(schema.employee.userId, input.userId));
    if (input.employeeId && input.employeeId !== "none") {
      await db.update(schema.employee).set({ userId: input.userId }).where(eq(schema.employee.id, input.employeeId));
    }
    await audit(v, "set_access", "user", input.userId, { role, employeeId: input.employeeId });
    return done(["/admin/users"], "Access saved.");
  } catch (e) { return fail(e); }
}

const localUserIn = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, "Username: 3-40 letters, digits, dot, dash or underscore."),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `The first password needs at least ${MIN_PASSWORD_LENGTH} characters.`),
  role: z.enum(["admin", "executive", "manager", "employee"]).default("employee"),
  employeeId: optId,
});
/** A local (non-SSO) account. It must change its password at first sign-in. */
export async function createLocalUser(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = localUserIn.parse(data);
    const db = await getDb();
    const id = crypto.randomUUID();
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(schema.user).values({ id, name: d.name, email: d.email, emailVerified: true, username: d.username, displayUsername: d.username, role: d.role, mustChangePassword: true, createdAt: now, updatedAt: now });
      await tx.insert(schema.account).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(d.password), createdAt: now, updatedAt: now });
      if (d.employeeId) await tx.update(schema.employee).set({ userId: id }).where(eq(schema.employee.id, d.employeeId));
    });
    await audit(v, "create_user", "user", id, { username: d.username, role: d.role });
    return done(["/admin/users"], "Account created. They choose their own password at first sign-in.", id);
  } catch (e) { return fail(e); }
}
export async function resetPassword(userId: string, password: string): Promise<Result> {
  try {
    const v = await admin();
    if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `At least ${MIN_PASSWORD_LENGTH} characters.` };
    const db = await getDb();
    const [acct] = await db.select().from(schema.account).where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")));
    if (!acct) return { ok: false, error: "This account signs in with single sign-on; it has no local password." };
    await db.update(schema.account).set({ password: await hashPassword(password), updatedAt: new Date() }).where(eq(schema.account.id, acct.id));
    await db.update(schema.user).set({ mustChangePassword: true }).where(eq(schema.user.id, userId));
    await db.delete(schema.session).where(eq(schema.session.userId, userId));
    await audit(v, "reset_password", "user", userId);
    return done(["/admin/users"], "Password reset. They must change it at next sign-in; their sessions were ended.");
  } catch (e) { return fail(e); }
}
export async function setBanned(userId: string, banned: boolean): Promise<Result> {
  try {
    const v = await admin();
    if (userId === v.userId) return { ok: false, error: "You cannot disable your own account." };
    const db = await getDb();
    await db.update(schema.user).set({ banned, banReason: banned ? "Disabled by an administrator" : null }).where(eq(schema.user.id, userId));
    if (banned) await db.delete(schema.session).where(eq(schema.session.userId, userId));
    await audit(v, banned ? "disable_user" : "enable_user", "user", userId);
    return done(["/admin/users"], banned ? "Account disabled and signed out." : "Account enabled.");
  } catch (e) { return fail(e); }
}

// ---- single sign-on (SAML 2.0) ---------------------------------------------------------

const samlIn = z.object({
  providerId: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Provider ID: 2-40 lower-case letters, digits or dashes."),
  domain: z.string().trim().toLowerCase().min(3, "The e-mail domain people sign in with, e.g. company.com"),
  metadata: z.string().trim().optional().default(""),
  entityId: z.string().trim().optional().default(""),
  ssoUrl: z.string().trim().optional().default(""),
  cert: z.string().trim().optional().default(""),
  emailAttr: z.string().trim().optional().default(""),
  nameAttr: z.string().trim().optional().default(""),
});
export async function registerSaml(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = samlIn.parse(data);
    if (!d.metadata && !(d.entityId && d.ssoUrl && d.cert)) {
      return { ok: false, error: "Paste the identity provider's metadata XML, or give its entity ID, sign-in URL and signing certificate." };
    }
    const auth = await getAuth();
    await auth.api.registerSSOProvider({ headers: await headers(), body: samlProviderBody(d, appUrl()) as never });
    await audit(v, "register_sso", "sso_provider", d.providerId, { domain: d.domain, byMetadata: !!d.metadata });
    return done(["/admin/sso", "/login"], "Single sign-on provider saved. Give the service-provider details below to the identity team.");
  } catch (e) {
    const body = (e as { body?: { message?: string } }).body;
    return fail(body?.message ? new Error(body.message) : e);
  }
}
export async function deleteSaml(providerId: string): Promise<Result> {
  try {
    const v = await admin();
    const db = await getDb();
    await db.delete(schema.ssoProvider).where(eq(schema.ssoProvider.providerId, providerId));
    await audit(v, "delete_sso", "sso_provider", providerId);
    return done(["/admin/sso", "/login"], "Provider removed. Local sign-in still works.");
  } catch (e) { return fail(e); }
}

// ---- demo data ------------------------------------------------------------------------

/** Removes the whole organisation (people, units, ratings, roles, taxonomy) but keeps
 *  user accounts, levels and settings: the step from evaluating to going live. */
export async function clearOrganisation(confirmText: string): Promise<Result> {
  try {
    const v = await admin();
    if (confirmText.trim().toUpperCase() !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
    const db = await getDb();
    await db.transaction(async (tx) => {
      for (const t of ["training_plan", "rating_event", "rating", "employee_target", "unit_requirement", "role_skill", "snapshot", "assessment_cycle"]) {
        await tx.execute(sql.raw(`delete from ${t}`));
      }
      await tx.execute(sql`delete from employee`);
      await tx.execute(sql`delete from org_unit`);
      await tx.execute(sql`delete from skill where parent_id is not null`);
      await tx.execute(sql`delete from skill`);
      await tx.execute(sql`delete from skill_category`);
      await tx.execute(sql`delete from job_role`);
      await tx.execute(sql`delete from grade`);
      await tx.insert(schema.orgUnit).values({ name: process.env.ORG_NAME || "Organisation", kind: "company" });
      // demo sign-ins go with the demo people; the administrators stay
      const demo = await tx.select({ id: schema.user.id }).from(schema.user).where(inArray(schema.user.username, ["exec", "manager", "employee"]));
      if (demo.length) await tx.delete(schema.user).where(inArray(schema.user.id, demo.map((d) => d.id)));
    });
    await audit(v, "clear_organisation", "organisation", null);
    return done(["/admin", "/admin/data"], "Organisation cleared. Import your own data or build it in Organisation and Taxonomy.");
  } catch (e) { return fail(e); }
}
