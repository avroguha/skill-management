// CSV export and import. Every export re-imports unchanged (test/transfer.test.ts).
// Natural keys, never internal ids: unit and skill paths ("Avro Corp > Technology",
// "AWS > EC2"), e-mail addresses, role and grade names.
//
// Order for a first load: skills, grades, roles, role-skills, units, people, person-targets,
// team-needs, ratings, training-plans.
// Bad rows are skipped and reported with their line number; dryRun checks a file
// without changing anything.
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";
import { parseCsvObjects, toCsv } from "./csv.ts";

export const KINDS = ["skills", "grades", "roles", "role-skills", "units", "people", "person-targets", "team-needs", "ratings", "training-plans"] as const;
export type Kind = (typeof KINDS)[number];
export const SEP = " > ";

export const COLUMNS: Record<Kind, string[]> = {
  skills: ["category", "skill", "sub_skill", "aliases", "description", "status"],
  grades: ["grade", "rank"],
  roles: ["role", "description"],
  "role-skills": ["role", "grade", "skill", "target", "mandatory"],
  units: ["path", "kind", "manager_email"],
  people: ["email", "name", "title", "unit", "role", "grade", "manager_email", "location", "active", "manages"],
  "person-targets": ["email", "skill", "target", "reason"],
  "team-needs": ["unit", "skill", "min_level", "headcount", "note"],
  "training-plans": ["email", "skill", "target_level", "title", "link", "due_on", "status"],
  ratings: ["email", "skill", "self_level", "validated_level", "self_comment", "evidence", "interest", "self_on", "validated_on"],
};

export const DESCRIPTIONS: Record<Kind, string> = {
  skills: "The taxonomy. A row with sub_skill adds a sub-skill under skill. Aliases separated by ;",
  grades: "Grades in order: a higher rank is the next grade up.",
  roles: "Job roles and what they are for.",
  "role-skills": "Required level per role, skill and (optionally) grade. A blank grade means every grade.",
  units: "The organisation tree as paths. Parents are created as needed.",
  people: "One row per person, matched by e-mail. manages = unit path(s) they lead, separated by ;",
  "person-targets": "A manager's per-person target that overrides the role, with the reason.",
  "team-needs": "What a unit needs: N people at a minimum level in a skill.",
  "training-plans": "Training booked against a person's gap, and its status.",
  ratings: "Self and validated levels per person and skill. A validated level marks it validated.",
};

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Q = DB | Tx;
/** errors: the row was skipped. warnings: the row was saved, with something left out. */
export interface ImportReport { kind: Kind; rows: number; created: number; updated: number; errors: { line: number; message: string }[]; warnings: { line: number; message: string }[]; dryRun: boolean }

const yes = (v: string | undefined, dflt: boolean) => {
  if (v == null || v === "") return dflt;
  return /^(y|yes|true|1|on|active)$/i.test(v.trim()) ? true : /^(n|no|false|0|off|inactive)$/i.test(v.trim()) ? false : dflt;
};
const lvl = (v: string | undefined, min = 0): number | null | "bad" => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= 5 ? n : "bad";
};
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const lc = (x: string) => x.trim().toLowerCase();

async function lookups(q: Q) {
  const [units, skills, cats, roles, grades, people] = await Promise.all([
    q.select().from(s.orgUnit), q.select().from(s.skill), q.select().from(s.skillCategory),
    q.select().from(s.jobRole), q.select().from(s.grade), q.select().from(s.employee),
  ]);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const unitPath = (id: string | null): string => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let u = id ? unitById.get(id) : undefined;
    while (u && !seen.has(u.id)) { seen.add(u.id); parts.unshift(u.name); u = u.parentId ? unitById.get(u.parentId) : undefined; }
    return parts.join(SEP);
  };
  const unitByPath = new Map(units.map((u) => [lc(unitPath(u.id)), u]));
  const skillById = new Map(skills.map((k) => [k.id, k]));
  const skillPath = (id: string) => {
    const k = skillById.get(id);
    if (!k) return "";
    const p = k.parentId ? skillById.get(k.parentId) : undefined;
    return p ? `${p.name}${SEP}${k.name}` : k.name;
  };
  const skillByPath = new Map<string, (typeof skills)[number]>();
  for (const k of skills) if (!skillByPath.has(lc(skillPath(k.id))) || k.status !== "retired") skillByPath.set(lc(skillPath(k.id)), k);
  return {
    units, unitById, unitPath, unitByPath, skills, skillById, skillPath, skillByPath, cats, roles, grades, people,
    catById: new Map(cats.map((c) => [c.id, c])),
    personByEmail: new Map(people.map((p) => [lc(p.email), p])),
    personById: new Map(people.map((p) => [p.id, p])),
  };
}

// ---- export ----------------------------------------------------------------------------

export async function exportCsv(db: DB, kind: Kind): Promise<string> {
  const L = await lookups(db);
  const email = (id: string | null) => (id ? L.personById.get(id)?.email ?? "" : "");
  let rows: Record<string, unknown>[] = [];
  if (kind === "skills") {
    // category order, then skill order: import keeps the order of the file, so it round-trips
    const catSort = (id: string) => L.catById.get(id)?.sort ?? 0;
    const bySort = (a: (typeof L.skills)[number], b: (typeof L.skills)[number]) =>
      catSort(a.categoryId) - catSort(b.categoryId) || (L.catById.get(a.categoryId)?.name ?? "").localeCompare(L.catById.get(b.categoryId)?.name ?? "")
      || a.sort - b.sort || a.name.localeCompare(b.name);
    const top = L.skills.filter((k) => !k.parentId).sort(bySort);
    const ordered = top.flatMap((t) => [t, ...L.skills.filter((k) => k.parentId === t.id).sort(bySort)]);
    rows = ordered.map((k) => {
      const parent = k.parentId ? L.skillById.get(k.parentId) : undefined;
      return {
        category: L.catById.get(k.categoryId)?.name ?? "", skill: parent ? parent.name : k.name, sub_skill: parent ? k.name : "",
        aliases: k.aliases.join("; "), description: k.description, status: k.status,
      };
    });
  } else if (kind === "grades") {
    rows = [...L.grades].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)).map((g) => ({ grade: g.name, rank: g.rank }));
  } else if (kind === "roles") {
    rows = [...L.roles].sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ role: r.name, description: r.description }));
  } else if (kind === "role-skills") {
    const rs = await db.select().from(s.roleSkill);
    rows = rs.map((r) => ({
      role: L.roles.find((x) => x.id === r.roleId)?.name ?? "", grade: r.gradeId ? L.grades.find((g) => g.id === r.gradeId)?.name ?? "" : "",
      skill: L.skillPath(r.skillId), target: r.target, mandatory: r.mandatory ? "yes" : "no",
    })).sort((a, b) => `${a.role}${a.skill}${a.grade}`.localeCompare(`${b.role}${b.skill}${b.grade}`));
  } else if (kind === "units") {
    rows = L.units.map((u) => ({ path: L.unitPath(u.id), kind: u.kind, manager_email: email(u.managerId) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  } else if (kind === "people") {
    rows = L.people.map((p) => ({
      email: p.email, name: p.name, title: p.title, unit: L.unitPath(p.unitId),
      role: L.roles.find((r) => r.id === p.roleId)?.name ?? "", grade: L.grades.find((g) => g.id === p.gradeId)?.name ?? "",
      manager_email: email(p.managerId), location: p.location, active: p.active ? "yes" : "no",
      manages: L.units.filter((u) => u.managerId === p.id).map((u) => L.unitPath(u.id)).join("; "),
    })).sort((a, b) => a.email.localeCompare(b.email));
  } else if (kind === "team-needs") {
    const reqs = await db.select().from(s.unitRequirement);
    rows = reqs.map((r) => ({ unit: L.unitPath(r.unitId), skill: L.skillPath(r.skillId), min_level: r.minLevel, headcount: r.headcount, note: r.note }));
  } else if (kind === "person-targets") {
    const ts = await db.select().from(s.employeeTarget);
    rows = ts.map((t) => ({ email: email(t.employeeId), skill: L.skillPath(t.skillId), target: t.target, reason: t.reason }))
      .sort((a, b) => `${a.email}${a.skill}`.localeCompare(`${b.email}${b.skill}`));
  } else if (kind === "training-plans") {
    const ps = await db.select().from(s.trainingPlan);
    rows = ps.map((p) => ({ email: email(p.employeeId), skill: L.skillPath(p.skillId), target_level: p.targetLevel, title: p.title, link: p.link, due_on: p.dueOn ?? "", status: p.status }))
      .sort((a, b) => `${a.email}${a.skill}${a.title}`.localeCompare(`${b.email}${b.skill}${b.title}`));
  } else if (kind === "ratings") {
    const ratings = await db.select().from(s.rating);
    rows = ratings.map((r) => ({
      email: email(r.employeeId), skill: L.skillPath(r.skillId), self_level: r.selfLevel, validated_level: r.validatedLevel,
      self_comment: r.selfComment, evidence: r.evidence, interest: r.interest ? "yes" : "no",
      self_on: r.selfAt?.toISOString().slice(0, 10) ?? "", validated_on: r.validatedAt?.toISOString().slice(0, 10) ?? "",
    })).sort((a, b) => `${a.email}${a.skill}`.localeCompare(`${b.email}${b.skill}`));
  }
  return toCsv(COLUMNS[kind], rows);
}

// ---- import ----------------------------------------------------------------------------

class Rollback extends Error {}

export async function importCsv(db: DB, kind: Kind, text: string, opts: { dryRun?: boolean; actorId?: string | null } = {}): Promise<ImportReport> {
  const rows = parseCsvObjects(text);
  const report: ImportReport = { kind, rows: rows.length, created: 0, updated: 0, errors: [], warnings: [], dryRun: !!opts.dryRun };
  const err = (line: number, message: string) => report.errors.push({ line, message });
  const warn = (line: number, message: string) => report.warnings.push({ line, message });
  const required = { skills: ["category", "skill"], grades: ["grade", "rank"], roles: ["role"], "role-skills": ["role", "skill", "target"], units: ["path"], people: ["email"], "team-needs": ["unit", "skill", "min_level"], ratings: ["email", "skill"], "person-targets": ["email", "skill", "target"], "training-plans": ["email", "skill", "title"] }[kind];
  if (rows.length) {
    const missing = required.filter((c) => !(c in rows[0].data));
    if (missing.length) { err(1, `Missing column(s): ${missing.join(", ")}. Expected: ${COLUMNS[kind].join(", ")}`); return report; }
  }
  try {
    await db.transaction(async (tx) => {
      const L = await lookups(tx);
      if (kind === "skills") await importSkills(tx, L, rows, report, err);
      else if (kind === "grades") await importGrades(tx, L, rows, report, err);
      else if (kind === "roles") await importRoleList(tx, L, rows, report, err);
      else if (kind === "role-skills") await importRoles(tx, L, rows, report, err);
      else if (kind === "units") await importUnits(tx, L, rows, report, warn);
      else if (kind === "people") await importPeople(tx, L, rows, report, err);
      else if (kind === "team-needs") await importNeeds(tx, L, rows, report, err);
      else if (kind === "person-targets") await importTargets(tx, L, rows, report, err, opts.actorId ?? null);
      else if (kind === "training-plans") await importPlans(tx, L, rows, report, err, opts.actorId ?? null);
      else if (kind === "ratings") await importRatings(tx, L, rows, report, err, opts.actorId ?? null);
      if (opts.dryRun) throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return report;
}

type Lk = Awaited<ReturnType<typeof lookups>>;
type Rows = { line: number; data: Record<string, string> }[];
type Err = (line: number, message: string) => void;

async function importSkills(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err) {
  let order = 0;
  const catOrder = new Map<string, number>();
  for (const { line, data } of rows) {
    order += 1;
    const catName = data.category, top = data.skill, sub = data.sub_skill ?? "";
    if (!catName || !top) { err(line, "category and skill are required"); continue; }
    const status = data.status ? lc(data.status) : "active";
    if (!["active", "draft", "retired"].includes(status)) { err(line, `status must be active, draft or retired (was "${data.status}")`); continue; }
    let cat = L.cats.find((c) => lc(c.name) === lc(catName));
    if (!cat) {
      [cat] = await tx.insert(s.skillCategory).values({ name: catName, sort: L.cats.length + 1 }).returning();
      L.cats.push(cat);
    }
    if (!catOrder.has(cat.id)) {
      catOrder.set(cat.id, catOrder.size + 1);
      await tx.update(s.skillCategory).set({ sort: catOrder.size }).where(eq(s.skillCategory.id, cat.id));
      cat.sort = catOrder.size;
    }
    const aliases = (data.aliases ?? "").split(/;/).map((x) => x.trim()).filter(Boolean);
    let parent = L.skills.find((k) => !k.parentId && lc(k.name) === lc(top));
    if (!parent) {
      [parent] = await tx.insert(s.skill).values({ name: top, categoryId: cat.id, status: sub ? "active" : status, aliases: sub ? [] : aliases, description: sub ? "" : data.description ?? "", sort: order }).returning();
      L.skills.push(parent);
      if (!sub) { r.created++; continue; }
    } else if (!sub) {
      await tx.update(s.skill).set({ categoryId: cat.id, aliases, description: data.description ?? parent.description, status, sort: order }).where(eq(s.skill.id, parent.id));
      r.updated++;
      continue;
    }
    if (parent.categoryId !== cat.id) { err(line, `"${top}" is in another category; a sub-skill must share its parent's category`); continue; }
    const existing = L.skills.find((k) => k.parentId === parent!.id && lc(k.name) === lc(sub));
    if (existing) {
      await tx.update(s.skill).set({ aliases, description: data.description ?? existing.description, status, sort: order }).where(eq(s.skill.id, existing.id));
      r.updated++;
    } else {
      const [k] = await tx.insert(s.skill).values({ name: sub, categoryId: cat.id, parentId: parent.id, aliases, description: data.description ?? "", status, sort: order }).returning();
      L.skills.push(k);
      r.created++;
    }
  }
}

function findSkill(L: Lk, path: string) {
  return L.skills.find((k) => {
    const p = k.parentId ? L.skills.find((x) => x.id === k.parentId) : undefined;
    return lc(p ? `${p.name}${SEP}${k.name}` : k.name) === lc(path);
  });
}

async function importGrades(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err) {
  for (const { line, data } of rows) {
    const rank = Number(data.rank);
    if (!data.grade || !Number.isInteger(rank)) { err(line, "grade and a whole-number rank are required"); continue; }
    const g = L.grades.find((x) => lc(x.name) === lc(data.grade));
    if (g) { await tx.update(s.grade).set({ rank }).where(eq(s.grade.id, g.id)); r.updated++; }
    else { const [n] = await tx.insert(s.grade).values({ name: data.grade, rank }).returning(); L.grades.push(n); r.created++; }
  }
}

async function importRoleList(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err) {
  for (const { line, data } of rows) {
    if (!data.role) { err(line, "role is required"); continue; }
    const role = L.roles.find((x) => lc(x.name) === lc(data.role));
    if (role) { if ("description" in data) await tx.update(s.jobRole).set({ description: data.description }).where(eq(s.jobRole.id, role.id)); r.updated++; }
    else { const [n] = await tx.insert(s.jobRole).values({ name: data.role, description: data.description ?? "" }).returning(); L.roles.push(n); r.created++; }
  }
}

async function importRoles(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err) {
  for (const { line, data } of rows) {
    const skill = findSkill(L, data.skill ?? "");
    if (!skill) { err(line, `Unknown skill "${data.skill}" (use "Skill > Sub-skill" for a sub-skill)`); continue; }
    const target = lvl(data.target, 1);
    if (target == null || target === "bad") { err(line, `target must be 1-5 (was "${data.target}")`); continue; }
    let role = L.roles.find((x) => lc(x.name) === lc(data.role));
    if (!role) { [role] = await tx.insert(s.jobRole).values({ name: data.role }).returning(); L.roles.push(role); }
    let gradeId: string | null = null;
    if (data.grade) {
      let g = L.grades.find((x) => lc(x.name) === lc(data.grade));
      if (!g) { [g] = await tx.insert(s.grade).values({ name: data.grade, rank: Math.max(0, ...L.grades.map((x) => x.rank)) + 1 }).returning(); L.grades.push(g); }
      gradeId = g.id;
    }
    const where = and(eq(s.roleSkill.roleId, role.id), eq(s.roleSkill.skillId, skill.id), gradeId ? eq(s.roleSkill.gradeId, gradeId) : isNull(s.roleSkill.gradeId));
    const had = await tx.delete(s.roleSkill).where(where).returning();
    await tx.insert(s.roleSkill).values({ roleId: role.id, gradeId, skillId: skill.id, target, mandatory: yes(data.mandatory, true) });
    if (had.length) r.updated++; else r.created++;
  }
}

async function ensureUnitPath(tx: Tx, L: Lk, path: string, leafKind?: string): Promise<{ id: string; created: boolean }> {
  const parts = path.split(SEP).map((x) => x.trim()).filter(Boolean);
  let parentId: string | null = null;
  let created = false;
  let id = "";
  for (let i = 0; i < parts.length; i++) {
    const name = parts[i];
    let u = L.units.find((x) => (x.parentId ?? null) === parentId && lc(x.name) === lc(name));
    if (!u) {
      const kind = i === parts.length - 1 ? leafKind || "team" : i === 0 ? "company" : "department";
      [u] = await tx.insert(s.orgUnit).values({ name, kind, parentId }).returning();
      L.units.push(u);
      L.unitById.set(u.id, u);
      if (i === parts.length - 1) created = true;
    }
    parentId = u.id;
    id = u.id;
  }
  return { id, created };
}

function findUnit(L: Lk, path: string) {
  const parts = path.split(SEP).map((x) => x.trim()).filter(Boolean);
  let parentId: string | null = null;
  let found: (typeof L.units)[number] | undefined;
  for (const name of parts) {
    found = L.units.find((x) => (x.parentId ?? null) === parentId && lc(x.name) === lc(name));
    if (!found) return undefined;
    parentId = found.id;
  }
  return found;
}

const KINDS_OK = ["company", "division", "department", "team"];
async function importUnits(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err) {
  for (const { line, data } of rows) {
    if (!data.path) { err(line, "path is required"); continue; }
    const kind = data.kind ? lc(data.kind) : "";
    if (kind && !KINDS_OK.includes(kind)) { err(line, `kind must be one of ${KINDS_OK.join(", ")}`); continue; }
    const { id, created } = await ensureUnitPath(tx, L, data.path, kind || undefined);
    const set: Partial<typeof s.orgUnit.$inferInsert> = {};
    if (kind) set.kind = kind;
    if (data.manager_email) {
      const m = L.personByEmail.get(lc(data.manager_email));
      if (m) set.managerId = m.id;
      else err(line, `Manager ${data.manager_email} is not a person yet; saved without a manager. people.csv sets it through its "manages" column.`);
    } else if ("manager_email" in data) set.managerId = null;
    if (Object.keys(set).length) await tx.update(s.orgUnit).set(set).where(eq(s.orgUnit.id, id));
    if (created) r.created++; else r.updated++;
  }
}

async function importPeople(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err) {
  const later: { id: string; line: number; manager: string; manages: string }[] = [];
  for (const { line, data } of rows) {
    const email = lc(data.email ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err(line, `Not an e-mail address: "${data.email}"`); continue; }
    const existing = L.personByEmail.get(email);
    if (!existing && !data.name) { err(line, "name is required for a new person"); continue; }
    const values: Partial<typeof s.employee.$inferInsert> = {};
    if (data.name) values.name = data.name;
    if ("title" in data) values.title = data.title;
    if ("location" in data) values.location = data.location;
    if ("active" in data) values.active = yes(data.active, true);
    if (data.unit) {
      const u = findUnit(L, data.unit);
      if (!u) { err(line, `Unknown unit "${data.unit}" (import units first)`); continue; }
      values.unitId = u.id;
    }
    if (data.role) {
      const role = L.roles.find((x) => lc(x.name) === lc(data.role));
      if (!role) { err(line, `Unknown role "${data.role}" (add it in Roles, or import roles first)`); continue; }
      values.roleId = role.id;
    } else if ("role" in data) values.roleId = null;
    if (data.grade) {
      const g = L.grades.find((x) => lc(x.name) === lc(data.grade));
      if (!g) { err(line, `Unknown grade "${data.grade}"`); continue; }
      values.gradeId = g.id;
    } else if ("grade" in data) values.gradeId = null;
    let id: string;
    if (existing) {
      if (Object.keys(values).length) await tx.update(s.employee).set(values).where(eq(s.employee.id, existing.id));
      id = existing.id;
      r.updated++;
    } else {
      const [p] = await tx.insert(s.employee).values({ email, name: data.name, ...values }).returning();
      L.people.push(p);
      L.personByEmail.set(email, p);
      L.personById.set(p.id, p);
      id = p.id;
      r.created++;
    }
    later.push({ id, line, manager: data.manager_email ?? "", manages: data.manages ?? "" });
  }
  // second pass: managers may appear further down the file
  for (const x of later) {
    if (x.manager) {
      const m = L.personByEmail.get(lc(x.manager));
      if (!m) err(x.line, `Manager ${x.manager} not found; saved without a manager`);
      else if (m.id === x.id) err(x.line, "Someone cannot be their own manager");
      else await tx.update(s.employee).set({ managerId: m.id }).where(eq(s.employee.id, x.id));
    }
    for (const path of x.manages.split(";").map((p) => p.trim()).filter(Boolean)) {
      const u = findUnit(L, path);
      if (!u) err(x.line, `manages: unknown unit "${path}"`);
      else await tx.update(s.orgUnit).set({ managerId: x.id }).where(eq(s.orgUnit.id, u.id));
    }
  }
  // link existing sign-ins by e-mail
  await tx.execute(sql`update employee set user_id = u.id from "user" u
    where employee.user_id is null and lower(u.email) = lower(employee.email)
    and not exists (select 1 from employee e2 where e2.user_id = u.id)`);
}

async function importNeeds(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err) {
  for (const { line, data } of rows) {
    const u = findUnit(L, data.unit ?? "");
    if (!u) { err(line, `Unknown unit "${data.unit}"`); continue; }
    const skill = findSkill(L, data.skill ?? "");
    if (!skill) { err(line, `Unknown skill "${data.skill}"`); continue; }
    const min = lvl(data.min_level, 1);
    if (min == null || min === "bad") { err(line, "min_level must be 1-5"); continue; }
    const hc = data.headcount ? Number(data.headcount) : 1;
    if (!Number.isInteger(hc) || hc < 1) { err(line, "headcount must be a whole number, 1 or more"); continue; }
    const had = await tx.delete(s.unitRequirement).where(and(eq(s.unitRequirement.unitId, u.id), eq(s.unitRequirement.skillId, skill.id))).returning();
    await tx.insert(s.unitRequirement).values({ unitId: u.id, skillId: skill.id, minLevel: min, headcount: hc, note: data.note ?? "" });
    if (had.length) r.updated++; else r.created++;
  }
}

async function importTargets(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err, actorId: string | null) {
  for (const { line, data } of rows) {
    const p = L.personByEmail.get(lc(data.email ?? ""));
    if (!p) { err(line, `Unknown person ${data.email}`); continue; }
    const skill = findSkill(L, data.skill ?? "");
    if (!skill) { err(line, `Unknown skill "${data.skill}"`); continue; }
    const t = lvl(data.target, 1);
    if (t == null || t === "bad") { err(line, "target must be 1-5"); continue; }
    const had = await tx.delete(s.employeeTarget).where(and(eq(s.employeeTarget.employeeId, p.id), eq(s.employeeTarget.skillId, skill.id))).returning();
    await tx.insert(s.employeeTarget).values({ employeeId: p.id, skillId: skill.id, target: t, reason: data.reason ?? "", setBy: had[0]?.setBy ?? actorId });
    if (had.length) r.updated++; else r.created++;
  }
}

const PLAN_STATUS = ["planned", "in_progress", "done", "cancelled"];
async function importPlans(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err, actorId: string | null) {
  for (const { line, data } of rows) {
    const p = L.personByEmail.get(lc(data.email ?? ""));
    if (!p) { err(line, `Unknown person ${data.email}`); continue; }
    const skill = findSkill(L, data.skill ?? "");
    if (!skill) { err(line, `Unknown skill "${data.skill}"`); continue; }
    const t = lvl(data.target_level, 1);
    if (t === "bad") { err(line, "target_level must be 1-5"); continue; }
    const status = data.status ? lc(data.status).replace(/\s+/g, "_") : "planned";
    if (!PLAN_STATUS.includes(status)) { err(line, `status must be one of ${PLAN_STATUS.join(", ")}`); continue; }
    if (data.due_on && !isDate(data.due_on)) { err(line, "due_on must be YYYY-MM-DD"); continue; }
    const had = await tx.delete(s.trainingPlan).where(and(eq(s.trainingPlan.employeeId, p.id), eq(s.trainingPlan.skillId, skill.id), eq(s.trainingPlan.title, data.title))).returning();
    await tx.insert(s.trainingPlan).values({ employeeId: p.id, skillId: skill.id, targetLevel: t ?? 3, title: data.title, link: data.link ?? "", dueOn: data.due_on || null, status, createdBy: had[0]?.createdBy ?? actorId });
    if (had.length) r.updated++; else r.created++;
  }
}

async function importRatings(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err, actorId: string | null) {
  for (const { line, data } of rows) {
    const p = L.personByEmail.get(lc(data.email ?? ""));
    if (!p) { err(line, `Unknown person ${data.email}`); continue; }
    const skill = findSkill(L, data.skill ?? "");
    if (!skill) { err(line, `Unknown skill "${data.skill}"`); continue; }
    const self = lvl(data.self_level), val = lvl(data.validated_level);
    if (self === "bad" || val === "bad") { err(line, "levels must be 0-5 or blank"); continue; }
    if (self == null && val == null) { err(line, "give a self_level, a validated_level, or both"); continue; }
    for (const k of ["self_on", "validated_on"] as const) if (data[k] && !isDate(data[k])) { err(line, `${k} must be YYYY-MM-DD`); }
    const selfAt = self != null ? new Date(data.self_on && isDate(data.self_on) ? data.self_on : Date.now()) : null;
    const validatedAt = val != null ? new Date(data.validated_on && isDate(data.validated_on) ? data.validated_on : Date.now()) : null;
    const values = {
      selfLevel: self, selfAt, selfComment: data.self_comment ?? "",
      validatedLevel: val, validatedAt, validatedBy: val != null ? actorId : null, evidence: data.evidence ?? "",
      interest: yes(data.interest, false), status: val != null ? "validated" : "submitted",
    };
    const had = await tx.delete(s.rating).where(and(eq(s.rating.employeeId, p.id), eq(s.rating.skillId, skill.id))).returning();
    await tx.insert(s.rating).values({ employeeId: p.id, skillId: skill.id, ...values });
    await tx.insert(s.ratingEvent).values({ employeeId: p.id, skillId: skill.id, kind: "import", level: val ?? self, actorId });
    if (had.length) r.updated++; else r.created++;
  }
}
