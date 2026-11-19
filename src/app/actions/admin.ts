"use server";
// Administrator actions (Settings). Every one checks the caller is an administrator, validates
// its input, refuses changes that would break the data (someone managing themselves, deleting
// a skill that has ratings), and writes an audit entry. Actions on accounts and single sign-on
// are refused in demo mode: they would change the real setup.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { getDb, schema } from "@/db";
import { actionViewer, audit, getEngine, type Viewer } from "@/lib/server";
import { getAuth, appUrl, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { samlProviderBody, DEFAULT_PROVIDER_ID, ENTITY_ID_PATTERN } from "@/lib/saml";
import { saveBackup } from "@/lib/backup";
import { refreshGate } from "@/lib/sso-gate";
import { isLocalAdmin, localAdminRefusal } from "@/lib/local-admin";
import { roleNamed, skillNamed } from "@/lib/skill-names";

export type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };
type Data = Record<string, unknown>;

async function admin(opts: { live?: boolean } = {}): Promise<Viewer> {
  const v = await actionViewer(opts);
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
    return done(["/settings/skills"], "Category saved.", id);
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
    return done(["/settings/skills"], "Category deleted.");
  } catch (e) { return fail(e); }
}

const skillIn = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name the skill.").max(120),
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
    if (d.status !== "retired") {
      const taken = await skillNamed(db, d.name, d.parentId, d.id);
      if (taken) return { ok: false, error: `A skill called “${taken.name}” already exists${d.parentId ? " under that skill" : ""}${taken.name.toLowerCase() === d.name.toLowerCase() ? "" : ` (it also goes by “${d.name}”)`}. Skill names are unique: use it, merge into it, or choose a more specific name.` };
    }
    const values = { name: d.name, categoryId: d.categoryId, parentId: d.parentId, description: d.description, aliases: d.aliases, status: d.status, sort: d.sort };
    let id = d.id;
    if (id) {
      await db.update(schema.skill).set(values).where(eq(schema.skill.id, id));
      // children follow their parent's category
      await db.update(schema.skill).set({ categoryId: d.categoryId }).where(eq(schema.skill.parentId, id));
    } else id = (await db.insert(schema.skill).values(values).returning())[0].id;
    await audit(v, d.id ? "update_skill" : "create_skill", "skill", id, values);
    return done(["/settings/skills", "/skills"], "Skill saved.", id);
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
    return done(["/settings/skills", "/skills"], "Skill deleted.");
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
      await tx.execute(sql`update role_skill set skill_id = ${intoId} where skill_id = ${fromId}
        and (role_id, coalesce(grade_id, '')) not in (select role_id, coalesce(grade_id, '') from role_skill where skill_id = ${intoId})`);
      await tx.delete(schema.roleSkill).where(eq(schema.roleSkill.skillId, fromId));
      await tx.execute(sql`update team_need set skill_id = ${intoId} where skill_id = ${fromId}
        and manager_id not in (select manager_id from team_need where skill_id = ${intoId})`);
      await tx.delete(schema.teamNeed).where(eq(schema.teamNeed.skillId, fromId));
      await tx.update(schema.skill).set({ aliases: [...new Set([...into.aliases, from.name, ...from.aliases])] }).where(eq(schema.skill.id, intoId));
      await tx.update(schema.skill).set({ status: "retired", description: `Merged into ${into.name}. ${from.description}`.trim() }).where(eq(schema.skill.id, fromId));
    });
    await audit(v, "merge_skill", "skill", fromId, { into: intoId });
    return done(["/settings/skills", "/skills"], `Merged “${from.name}” into “${into.name}”.`);
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
    return done(["/settings/levels"], "Level saved.");
  } catch (e) { return fail(e); }
}

const roleIn = z.object({ id: z.string().optional(), name: z.string().trim().min(2, "Name the role.").max(80), description: text(500) });
export async function saveRole(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = roleIn.parse(data);
    const db = await getDb();
    const taken = await roleNamed(db, d.name, d.id);
    if (taken) return { ok: false, error: `A role called “${taken.name}” already exists. Role names are unique: use it, or choose a more specific name.` };
    let id = d.id;
    if (id) await db.update(schema.jobRole).set({ name: d.name, description: d.description }).where(eq(schema.jobRole.id, id));
    else id = (await db.insert(schema.jobRole).values({ name: d.name, description: d.description }).returning())[0].id;
    await audit(v, d.id ? "update_role" : "create_role", "job_role", id, d);
    return done(["/settings/roles", "/roles"], "Role saved.", id);
  } catch (e) { return fail(e); }
}
export async function deleteRole(id: string): Promise<Result> {
  try {
    const v = await admin();
    const db = await getDb();
    const [{ n }] = await db.select({ n: count() }).from(schema.employee).where(eq(schema.employee.roleId, id));
    if (n) return { ok: false, error: `${n} ${n === 1 ? "person has" : "people have"} this as their own role. Move them to another role first.` };
    const [{ t }] = await db.select({ t: count() }).from(schema.employee).where(eq(schema.employee.teamRoleId, id));
    if (t) return { ok: false, error: `${t} ${t === 1 ? "team has" : "teams have"} this as their role. Their managers choose another first (My team).` };
    await db.delete(schema.jobRole).where(eq(schema.jobRole.id, id));
    await audit(v, "delete_role", "job_role", id);
    return done(["/settings/roles", "/roles"], "Role deleted.");
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
    return done(["/settings/roles"], "Grade saved.", id);
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
    return done(["/settings/roles"], "Grade deleted.");
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
    return done(["/settings/roles", "/roles"], "Saved.");
  } catch (e) { return fail(e); }
}

// ---- people ---------------------------------------------------------------------------

const employeeIn = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the person.").max(120),
  email: z.string().trim().toLowerCase().email("A valid e-mail address, please."),
  title: text(120),
  teamName: text(80),
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
    if (d.id && d.managerId) {
      // refuse a loop: the new manager may not be someone below this person
      const engine = await getEngine();
      if (engine.reportsOf(d.id).some((e) => e.id === d.managerId)) return { ok: false, error: "That manager reports to this person (directly or further down): it would make a loop." };
    }
    const db = await getDb();
    const values = { name: d.name, email: d.email, title: d.title, teamName: d.teamName, roleId: d.roleId, gradeId: d.gradeId, managerId: d.managerId, location: d.location, active: d.active };
    let id = d.id;
    if (id) await db.update(schema.employee).set(values).where(eq(schema.employee.id, id));
    else id = (await db.insert(schema.employee).values(values).returning())[0].id;
    // link a user with the same e-mail that is not linked yet
    await db.execute(sql`update employee set user_id = u.id from "user" u
      where employee.id = ${id} and employee.user_id is null and lower(u.email) = lower(employee.email)
      and not exists (select 1 from employee e2 where e2.user_id = u.id)`);
    await refreshGate(db);
    await audit(v, d.id ? "update_employee" : "create_employee", "employee", id, values);
    return done(["/settings/people", "/people"], "Saved.", id);
  } catch (e) { return fail(e); }
}

// ---- rules ----------------------------------------------------------------------------

export async function saveSettings(data: Data): Promise<Result> {
  try {
    const v = await admin();
    const d = z.object({
      staleMonths: z.coerce.number().int().min(1).max(60),
      excludeStale: z.union([z.boolean(), z.string()]).transform((x) => x === true || x === "true" || x === "on"),
      greenAt: z.coerce.number().int().min(1).max(100),
      amberAt: z.coerce.number().int().min(0).max(99),
      managersAssess: z.union([z.boolean(), z.string()]).transform((x) => x === true || x === "true" || x === "on").default(false),
    }).parse(data);
    if (d.amberAt >= d.greenAt) return { ok: false, error: "The amber threshold must be below the green one." };
    const db = await getDb();
    await db.insert(schema.appSetting).values({ key: "settings", value: d })
      .onConflictDoUpdate({ target: schema.appSetting.key, set: { value: d } });
    await audit(v, "update_settings", "app_setting", "settings", d);
    return done(["/settings/levels"], "Saved.");
  } catch (e) { return fail(e); }
}

// ---- users and access ------------------------------------------------------------------

export async function setUserAccess(input: { userId: string; role: string; employeeId: string | null }): Promise<Result> {
  try {
    const v = await admin({ live: true });
    const role = z.enum(["admin", "leader", "manager", "employee"]).parse(input.role);
    const db = await getDb();
    if (input.userId === v.userId && role !== "admin") return { ok: false, error: "You cannot take away your own administrator access." };
    const [target] = await db.select({ username: schema.user.username }).from(schema.user).where(eq(schema.user.id, input.userId));
    if (isLocalAdmin(target)) {
      const no = localAdminRefusal({ role, employeeId: input.employeeId });
      if (no) return { ok: false, error: no };
    }
    if (role !== "admin") {
      const [{ n }] = await db.select({ n: count() }).from(schema.user).where(and(eq(schema.user.role, "admin"), ne(schema.user.id, input.userId)));
      if (!n) return { ok: false, error: "This is the last administrator." };
    }
    await db.update(schema.user).set({ role }).where(eq(schema.user.id, input.userId));
    await db.update(schema.employee).set({ userId: null }).where(eq(schema.employee.userId, input.userId));
    if (input.employeeId && input.employeeId !== "none") {
      await db.update(schema.employee).set({ userId: input.userId }).where(eq(schema.employee.id, input.employeeId));
    }
    await refreshGate(db);
    await audit(v, "set_access", "user", input.userId, { role, employeeId: input.employeeId });
    return done(["/settings/people"], "Access saved.");
  } catch (e) { return fail(e); }
}

const localUserIn = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, "Username: 3-40 letters, digits, dot, dash or underscore."),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `The first password needs at least ${MIN_PASSWORD_LENGTH} characters.`),
  role: z.enum(["admin", "leader", "manager", "employee"]).default("employee"),
  employeeId: optId,
});
/** A local (non-SSO) account. It must change its password at first sign-in. */
export async function createLocalUser(data: Data): Promise<Result> {
  try {
    const v = await admin({ live: true });
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
    return done(["/settings/people"], "Account created. They choose their own password at first sign-in.", id);
  } catch (e) { return fail(e); }
}
export async function resetPassword(userId: string, password: string): Promise<Result> {
  try {
    const v = await admin({ live: true });
    if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `At least ${MIN_PASSWORD_LENGTH} characters.` };
    const db = await getDb();
    const [acct] = await db.select().from(schema.account).where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")));
    if (!acct) return { ok: false, error: "This account signs in with single sign-on; it has no local password." };
    await db.update(schema.account).set({ password: await hashPassword(password), updatedAt: new Date() }).where(eq(schema.account.id, acct.id));
    await db.update(schema.user).set({ mustChangePassword: true }).where(eq(schema.user.id, userId));
    await db.delete(schema.session).where(eq(schema.session.userId, userId));
    await audit(v, "reset_password", "user", userId);
    return done(["/settings/people"], "Password reset. They must change it at next sign-in; their sessions were ended.");
  } catch (e) { return fail(e); }
}
export async function setBanned(userId: string, banned: boolean): Promise<Result> {
  try {
    const v = await admin({ live: true });
    if (userId === v.userId) return { ok: false, error: "You cannot disable your own account." };
    const db = await getDb();
    if (banned) {
      const [target] = await db.select({ username: schema.user.username }).from(schema.user).where(eq(schema.user.id, userId));
      if (isLocalAdmin(target)) return { ok: false, error: localAdminRefusal({ disable: true })! };
    }
    await db.update(schema.user).set({ banned, banReason: banned ? "Disabled by an administrator" : null }).where(eq(schema.user.id, userId));
    if (banned) await db.delete(schema.session).where(eq(schema.session.userId, userId));
    await audit(v, banned ? "disable_user" : "enable_user", "user", userId);
    return done(["/settings/people"], banned ? "Account disabled and signed out." : "Account enabled.");
  } catch (e) { return fail(e); }
}

// ---- single sign-on (SAML 2.0) ---------------------------------------------------------

const samlIn = z.object({
  providerId: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Provider ID: 2-40 lower-case letters, digits or dashes.").default(DEFAULT_PROVIDER_ID),
  spEntityId: z.string().trim().max(300).refine((v) => !v || ENTITY_ID_PATTERN.test(v), "The Entity ID is an address (https://...) or a urn: name, with no spaces.").default(""),
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
    const v = await admin({ live: true });
    const d = samlIn.parse(data);
    const db = await getDb();
    // saving again replaces the provider; what is left blank keeps its current value
    const [existing] = await db.select().from(schema.ssoProvider).where(eq(schema.ssoProvider.providerId, d.providerId));
    if (existing && !d.metadata && !(d.entityId && d.ssoUrl && d.cert)) {
      let cfg: { entryPoint?: string; cert?: string; idpMetadata?: { metadata?: string; entityID?: string; cert?: string }; mapping?: { email?: string; name?: string } } = {};
      try { cfg = JSON.parse(existing.samlConfig ?? "{}"); } catch { /* unreadable: the form must give it */ }
      if (cfg.idpMetadata?.metadata) d.metadata = cfg.idpMetadata.metadata;
      else Object.assign(d, { entityId: cfg.idpMetadata?.entityID ?? "", ssoUrl: cfg.entryPoint ?? "", cert: cfg.cert || cfg.idpMetadata?.cert || "" });
      d.emailAttr ||= cfg.mapping?.email && cfg.mapping.email !== "email" ? cfg.mapping.email : "";
      d.nameAttr ||= cfg.mapping?.name && cfg.mapping.name !== "displayName" ? cfg.mapping.name : "";
    }
    if (!d.metadata && !(d.entityId && d.ssoUrl && d.cert)) {
      return { ok: false, error: "Paste the identity provider's metadata XML (Entra ID: Federation Metadata XML), or give its entity ID, sign-in URL and signing certificate." };
    }
    const body = samlProviderBody(d, appUrl());
    const auth = await getAuth();
    if (existing) await db.delete(schema.ssoProvider).where(eq(schema.ssoProvider.providerId, d.providerId));
    try {
      await auth.api.registerSSOProvider({ headers: await headers(), body: body as never });
    } catch (e) {
      if (existing) await db.insert(schema.ssoProvider).values(existing); // put the old one back
      throw e;
    }
    await audit(v, existing ? "update_sso" : "register_sso", "sso_provider", d.providerId, { domain: d.domain, entityId: body.issuer, byMetadata: !!d.metadata });
    return done(["/settings/sso", "/login"], existing ? "Single sign-on provider updated." : "Single sign-on provider saved.");
  } catch (e) {
    const body = (e as { body?: { message?: string } }).body;
    return fail(body?.message ? new Error(body.message) : e);
  }
}
export async function deleteSaml(providerId: string): Promise<Result> {
  try {
    const v = await admin({ live: true });
    const db = await getDb();
    await db.delete(schema.ssoProvider).where(eq(schema.ssoProvider.providerId, providerId));
    await audit(v, "delete_sso", "sso_provider", providerId);
    return done(["/settings/sso", "/login"], "Provider removed. Local sign-in still works.");
  } catch (e) { return fail(e); }
}

// ---- demo data ------------------------------------------------------------------------

/** Removes the whole organisation (people, units, ratings, roles, taxonomy) but keeps
 *  user accounts, levels and settings: the step from evaluating to going live. */
export async function clearOrganisation(confirmText: string, opts: { accounts?: boolean; history?: boolean } = {}): Promise<Result> {
  try {
    const v = await admin({ live: true });
    if (confirmText.trim().toUpperCase() !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
    const db = await getDb();
    // a way back first: if the backup cannot be written, nothing is deleted
    const safety = await saveBackup(db, v.name, "before-clear");
    await db.transaction(async (tx) => {
      if (opts.accounts) {
        // every account but the administrators (their sign-in methods and sessions go with them)
        await tx.execute(sql`delete from ${schema.user} where coalesce(role, '') <> 'admin'`);
      }
      if (opts.history) {
        await tx.execute(sql`delete from audit_log`);
        await tx.execute(sql`delete from sync_run`);
      }
      for (const t of ["rating_event", "rating", "team_need", "role_skill"]) {
        await tx.execute(sql.raw(`delete from ${t}`));
      }
      await tx.execute(sql`delete from group_member`);
      await tx.execute(sql`delete from sn_group`);
      await tx.execute(sql`delete from employee`);
      await tx.execute(sql`delete from skill where parent_id is not null`);
      await tx.execute(sql`delete from skill`);
      await tx.execute(sql`delete from skill_category`);
      await tx.execute(sql`delete from job_role`);
      await tx.execute(sql`delete from grade`);
    });
    await refreshGate(db);
    await audit(v, "clear_organisation", "organisation", null, { accounts: !!opts.accounts, history: !!opts.history, safetyBackup: safety.name });
    return done(["/", "/settings", "/settings/data"], `Cleared. What was there is saved as ${safety.name} (restore it below if needed). Sync from ServiceNow or import people to start again.`);
  } catch (e) { return fail(e); }
}
