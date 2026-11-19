// CSV export and import. Every export re-imports unchanged (test/transfer.test.ts).
// Natural keys, never internal ids: skill paths ("AWS > EC2"), e-mail addresses, role and
// grade names. A team is a manager: team needs name the manager's e-mail.
//
// Order for a first load: skills, grades, roles, role-skills, people, team-needs, ratings.
// Bad rows are skipped and reported with their line number; dryRun checks a file
// without changing anything.
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";
import { parseCsvObjects, toCsv } from "./csv.ts";

export const KINDS = ["skills", "grades", "roles", "role-skills", "people", "team-needs", "ratings"] as const;
export type Kind = (typeof KINDS)[number];
export const SEP = " > ";

export const COLUMNS: Record<Kind, string[]> = {
  skills: ["category", "skill", "sub_skill", "aliases", "description", "status"],
  grades: ["grade", "rank"],
  roles: ["role", "description"],
  "role-skills": ["role", "grade", "skill", "target", "mandatory"],
  people: ["email", "name", "title", "role", "grade", "manager_email", "team_name", "team_role", "team_role_for", "location", "active"],
  "team-needs": ["manager_email", "skill", "min_level", "headcount", "note"],
  ratings: ["email", "skill", "self_level", "confirmed_level", "status", "self_comment", "manager_comment", "interest", "self_on", "confirmed_on"],
};

export const DESCRIPTIONS: Record<Kind, string> = {
  skills: "The skill catalogue. A row with sub_skill is a sub-skill under skill. Aliases separated by ;. status: active, draft or retired. Existing skills are updated, new ones added, nothing deleted; new skills that look like existing ones are listed for a decision first.",
  grades: "Grades in order: a higher rank is the next grade up.",
  roles: "Job roles and what they are for.",
  "role-skills": "Required level per role, skill and (optionally) grade. A blank grade means every grade.",
  people: "One row per person, matched by e-mail. manager_email builds the teams; team_name names the team a manager leads. role is a person's own role (empty: they follow their team's). For a manager, team_role is the role chosen for the team and team_role_for says who follows it: direct (the people reporting to them) or all (everyone below).",
  "team-needs": "What a manager's team needs: N people at a minimum level in a skill.",
  ratings: "Self and confirmed levels per person and skill. status: draft, submitted (waiting for the manager), confirmed or returned; empty = confirmed when there is a confirmed level, else submitted.",
};

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Q = DB | Tx;
/** errors: the row was skipped. warnings: the row was saved, with something left out.
 *  matches: rows that look like an existing skill; undecided: rows held back until each match has a decision. */
export interface ImportReport { kind: Kind; rows: number; created: number; updated: number; errors: { line: number; message: string }[]; warnings: { line: number; message: string }[]; dryRun: boolean; matches: NearSkill[]; undecided: number }

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
  const [skills, cats, roles, grades, people] = await Promise.all([
    q.select().from(s.skill), q.select().from(s.skillCategory),
    q.select().from(s.jobRole), q.select().from(s.grade), q.select().from(s.employee),
  ]);
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
    skills, skillById, skillPath, skillByPath, cats, roles, grades, people,
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
  } else if (kind === "people") {
    rows = L.people.map((p) => ({
      email: p.email, name: p.name, title: p.title,
      role: L.roles.find((r) => r.id === p.roleId)?.name ?? "", grade: L.grades.find((g) => g.id === p.gradeId)?.name ?? "",
      manager_email: email(p.managerId), team_name: p.teamName,
      team_role: L.roles.find((r) => r.id === p.teamRoleId)?.name ?? "", team_role_for: p.teamRoleId ? (p.teamRoleCascade ? "all" : "direct") : "",
      location: p.location, active: p.active ? "yes" : "no",
    })).sort((a, b) => a.email.localeCompare(b.email));
  } else if (kind === "team-needs") {
    const needs = await db.select().from(s.teamNeed);
    rows = needs.map((n) => ({ manager_email: email(n.managerId), skill: L.skillPath(n.skillId), min_level: n.minLevel, headcount: n.headcount, note: n.note }))
      .sort((a, b) => `${a.manager_email}${a.skill}`.localeCompare(`${b.manager_email}${b.skill}`));
  } else if (kind === "ratings") {
    const ratings = await db.select().from(s.rating);
    rows = ratings.map((r) => ({
      email: email(r.employeeId), skill: L.skillPath(r.skillId), self_level: r.selfLevel, confirmed_level: r.validatedLevel,
      status: r.status === "validated" ? "confirmed" : r.status, self_comment: r.selfComment, manager_comment: r.managerComment, interest: r.interest ? "yes" : "no",
      self_on: r.selfAt?.toISOString().slice(0, 10) ?? "", confirmed_on: r.validatedAt?.toISOString().slice(0, 10) ?? "",
    })).sort((a, b) => `${a.email}${a.skill}`.localeCompare(`${b.email}${b.skill}`));
  }
  return toCsv(COLUMNS[kind], rows);
}

// ---- import ----------------------------------------------------------------------------

class Rollback extends Error {}

export async function importCsv(db: DB, kind: Kind, text: string, opts: { dryRun?: boolean; actorId?: string | null; decisions?: SkillDecision[] } = {}): Promise<ImportReport> {
  const rows = parseCsvObjects(text);
  const report: ImportReport = { kind, rows: rows.length, created: 0, updated: 0, errors: [], warnings: [], dryRun: !!opts.dryRun, matches: [], undecided: 0 };
  const err = (line: number, message: string) => report.errors.push({ line, message });
  const warn = (line: number, message: string) => report.warnings.push({ line, message });
  const required = { skills: ["category", "skill"], grades: ["grade", "rank"], roles: ["role"], "role-skills": ["role", "skill", "target"], people: ["email"], "team-needs": ["manager_email", "skill", "min_level"], ratings: ["email", "skill"] }[kind];
  if (rows.length) {
    const missing = required.filter((c) => !(c in rows[0].data));
    if (missing.length) { err(1, `Missing column(s): ${missing.join(", ")}. Expected: ${COLUMNS[kind].join(", ")}`); return report; }
  }
  try {
    await db.transaction(async (tx) => {
      const L = await lookups(tx);
      if (kind === "skills") await importSkills(tx, L, rows, report, err, warn, opts.decisions ?? []);
      else if (kind === "grades") await importGrades(tx, L, rows, report, err);
      else if (kind === "roles") await importRoleList(tx, L, rows, report, err);
      else if (kind === "role-skills") await importRoles(tx, L, rows, report, err);
      else if (kind === "people") await importPeople(tx, L, rows, report, err);
      else if (kind === "team-needs") await importNeeds(tx, L, rows, report, err);
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

// ---- near-identical skills -------------------------------------------------------------
// A new skill in an upload that looks like one already in the catalogue is held back until
// an administrator decides: keep both, merge it into the existing one (its name becomes an
// alias), skip it, or replace the existing one with it (renamed in place, so its ratings,
// targets and history stay). Exact names are not asked about: they update, as before.

export type SkillAction = "separate" | "merge" | "skip" | "replace";
export interface SkillDecision { key: string; action: SkillAction; targetId?: string }
export interface NearSkill {
  /** "skill:<name>" for a top-level skill, "sub:<skill>><sub-skill>" for a sub-skill */
  key: string;
  lines: number[];
  incoming: string;
  category: string;
  level: "skill" | "sub_skill";
  candidates: { id: string; path: string; category: string; score: number; reason: string }[];
}

const STOP_WORDS = new Set(["a", "an", "and", "the", "of", "for", "with", "to", "in", "on", "at", "by"]);
export function normSkillName(x: string): string {
  return x.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
interface Prepared { norm: string; tokens: Set<string>; bigrams: Map<string, number>; size: number }
function prepare(name: string): Prepared {
  const norm = normSkillName(name);
  const tokens = new Set(norm.split(" ").filter((t) => t && !STOP_WORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t)));
  const flat = norm.replace(/ /g, "");
  const bigrams = new Map<string, number>();
  for (let i = 0; i < flat.length - 1; i++) bigrams.set(flat.slice(i, i + 2), (bigrams.get(flat.slice(i, i + 2)) ?? 0) + 1);
  return { norm, tokens, bigrams, size: Math.max(0, flat.length - 1) };
}
function similar(a: Prepared, b: Prepared): { score: number; reason: string } | null {
  if (!a.norm || !b.norm) return null;
  if (a.norm === b.norm) return { score: 1, reason: "the same name apart from case and punctuation" };
  let shared = 0;
  for (const t of a.tokens) if (b.tokens.has(t)) shared++;
  const union = a.tokens.size + b.tokens.size - shared;
  const words = union ? shared / union : 0;
  let common = 0;
  for (const [g, n] of a.bigrams) common += Math.min(n, b.bigrams.get(g) ?? 0);
  const letters = a.size + b.size ? (2 * common) / (a.size + b.size) : 0;
  const score = Math.round(Math.max(letters, words) * 100) / 100;
  if (words === 1) return { score: Math.max(score, 0.95), reason: "the same words in another order or form" };
  if (letters >= 0.85) return { score, reason: "almost the same wording" };
  if (words >= 0.75) return { score, reason: "mostly the same words" };
  const smaller = Math.min(a.tokens.size, b.tokens.size);
  if (smaller >= 2 && shared === smaller && words >= 0.5) return { score, reason: "one name contains the other" };
  return null;
}
/** Whether two skill names are near-identical, and why. */
export function skillSimilarity(a: string, b: string) {
  return similar(prepare(a), prepare(b));
}

function findNearSkills(L: Lk, rows: Rows): NearSkill[] {
  const live = L.skills.filter((k) => k.status !== "retired");
  const parents = new Set(L.skills.map((k) => k.parentId).filter(Boolean));
  const names = new Map(live.map((k) => [k.id, [k.name, ...k.aliases].map(prepare)]));
  const tops = live.filter((k) => !k.parentId);
  const subs = live.filter((k) => k.parentId);
  const leaves = live.filter((k) => k.parentId || !parents.has(k.id));
  // a skill with sub-skills in the file can only match another top-level skill
  const headings = new Set(rows.filter((r) => r.data.sub_skill?.trim()).map((r) => lc(r.data.skill ?? "")));
  const out = new Map<string, NearSkill>();
  const look = (key: string, line: number, name: string, incoming: string, category: string, level: NearSkill["level"], pool: typeof live, exclude?: string) => {
    const seen = out.get(key);
    if (seen) { seen.lines.push(line); return; }
    const p = prepare(name);
    const candidates: NearSkill["candidates"] = [];
    for (const k of pool) {
      if (k.id === exclude) continue;
      let best: { score: number; reason: string } | null = null;
      for (const [i, n] of names.get(k.id)!.entries()) {
        const hit = similar(p, n);
        if (hit && (!best || hit.score > best.score)) best = i === 0 ? hit : { score: hit.score, reason: `${hit.reason} as its alias “${k.aliases[i - 1]}”` };
      }
      if (best) candidates.push({ id: k.id, path: L.skillPath(k.id), category: L.catById.get(k.categoryId)?.name ?? "", ...best });
    }
    if (candidates.length) out.set(key, { key, lines: [line], incoming, category, level, candidates: candidates.sort((a, b) => b.score - a.score).slice(0, 3) });
  };
  for (const { line, data } of rows) {
    const top = data.skill?.trim(), sub = data.sub_skill?.trim() ?? "";
    if (!data.category || !top) continue;
    const exact = L.skills.find((k) => !k.parentId && lc(k.name) === lc(top));
    if (!exact) look(`skill:${lc(top)}`, line, top, top, data.category, "skill", headings.has(lc(top)) ? tops : [...tops, ...subs]);
    if (sub && !(exact && L.skills.some((k) => k.parentId === exact.id && lc(k.name) === lc(sub)))) {
      look(`sub:${lc(top)}>${lc(sub)}`, line, sub, `${top}${SEP}${sub}`, data.category, "sub_skill", leaves, exact?.id);
    }
  }
  return [...out.values()];
}

/** Aliases without duplicates (ignoring case) and without the skill's own name. */
function mergeAliases(name: string, ...lists: string[][]): string[] {
  const seen = new Set([lc(name)]);
  const out: string[] = [];
  for (const a of lists.flat().map((x) => x.trim()).filter(Boolean)) if (!seen.has(lc(a))) { seen.add(lc(a)); out.push(a); }
  return out;
}

async function importSkills(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err, warn: Err, decisions: SkillDecision[]) {
  const near = findNearSkills(L, rows);
  r.matches = near;
  const nearByKey = new Map(near.map((m) => [m.key, m]));
  const chosen = new Map<string, SkillDecision>();
  for (const d of decisions) {
    const m = nearByKey.get(d.key);
    // a decision only counts for a match found now, against one of its own candidates
    if (!m || ((d.action === "merge" || d.action === "replace") && !m.candidates.some((c) => c.id === d.targetId))) continue;
    chosen.set(d.key, d);
  }
  const decide = (key: string, line: number): SkillDecision | "wait" | null => {
    if (!nearByKey.has(key)) return null;
    const d = chosen.get(key);
    if (d) return d;
    r.undecided++;
    if (!r.dryRun) err(line, "Not imported: it looks like an existing skill. Check the file and choose what to do with it.");
    return "wait";
  };
  const skipped = (line: number, name: string) => warn(line, `Skipped, as chosen: “${name}” looks like an existing skill.`);

  let order = 0;
  const catOrder = new Map<string, number>();
  const ensureCat = async (name: string) => {
    let cat = L.cats.find((c) => lc(c.name) === lc(name));
    if (!cat) {
      [cat] = await tx.insert(s.skillCategory).values({ name, sort: L.cats.length + 1 }).returning();
      L.cats.push(cat);
      L.catById.set(cat.id, cat);
    }
    if (!catOrder.has(cat.id)) {
      catOrder.set(cat.id, catOrder.size + 1);
      await tx.update(s.skillCategory).set({ sort: catOrder.size }).where(eq(s.skillCategory.id, cat.id));
      cat.sort = catOrder.size;
    }
    return cat;
  };

  for (const { line, data } of rows) {
    order += 1;
    const catName = data.category, top = data.skill, sub = data.sub_skill ?? "";
    if (!catName || !top) { err(line, "category and skill are required"); continue; }
    const status = data.status ? lc(data.status) : "active";
    if (!["active", "draft", "retired"].includes(status)) { err(line, `status must be active, draft or retired (was "${data.status}")`); continue; }
    const aliases = (data.aliases ?? "").split(/;/).map((x) => x.trim()).filter(Boolean);
    // upsert: a skill that exists is updated from the columns the file has; a column the file
    // leaves out (or a blank status) keeps what is there, so a short file never wipes aliases
    // or brings a retired skill back
    const keep = <T,>(given: boolean, value: T, current: T) => (given ? value : current);
    const hasAliases = "aliases" in data, hasStatus = !!data.status?.trim(), hasDescription = "description" in data;

    // the top-level skill: its exact name, a decision about a near-identical one, or new
    let parent = L.skills.find((k) => !k.parentId && lc(k.name) === lc(top));
    let followParent = false; // merged into an existing skill: its sub-skills go where that skill is
    if (!parent) {
      const d = decide(`skill:${lc(top)}`, line);
      if (d === "wait") continue;
      if (d?.action === "skip") { skipped(line, top); continue; }
      if (d && (d.action === "merge" || d.action === "replace")) {
        const t = L.skillById.get(d.targetId!)!;
        if (d.action === "merge") {
          t.aliases = mergeAliases(t.name, t.aliases, [top], sub ? [] : aliases);
          if (!sub && !t.description && data.description) t.description = data.description;
          await tx.update(s.skill).set({ aliases: t.aliases, description: t.description }).where(eq(s.skill.id, t.id));
          followParent = true;
        } else {
          const cat = await ensureCat(catName);
          t.aliases = mergeAliases(top, t.aliases, [t.name], sub ? [] : aliases);
          Object.assign(t, { name: top, categoryId: cat.id, parentId: null },
            sub ? {} : { description: data.description ?? t.description, status, sort: order });
          await tx.update(s.skill).set({ name: t.name, aliases: t.aliases, categoryId: t.categoryId, parentId: null, description: t.description, status: t.status, sort: t.sort }).where(eq(s.skill.id, t.id));
          // sub-skills always share their parent's category
          await tx.update(s.skill).set({ categoryId: cat.id }).where(eq(s.skill.parentId, t.id));
          for (const k of L.skills) if (k.parentId === t.id) k.categoryId = cat.id;
        }
        if (!sub) { r.updated++; continue; }
        parent = t;
      }
    }
    if (!parent) {
      const cat = await ensureCat(catName);
      [parent] = await tx.insert(s.skill).values({ name: top, categoryId: cat.id, status: sub ? "active" : status, aliases: sub ? [] : aliases, description: sub ? "" : data.description ?? "", sort: order }).returning();
      L.skills.push(parent);
      L.skillById.set(parent.id, parent);
      if (!sub) { r.created++; continue; }
    } else if (!sub) {
      const cat = await ensureCat(catName);
      await tx.update(s.skill).set({
        categoryId: cat.id, aliases: keep(hasAliases, aliases, parent.aliases), description: keep(hasDescription, data.description ?? "", parent.description),
        status: keep(hasStatus, status, parent.status), sort: order,
      }).where(eq(s.skill.id, parent.id));
      r.updated++;
      continue;
    }

    // the sub-skill
    const cat = followParent ? L.catById.get(parent.categoryId)! : await ensureCat(catName);
    if (parent.categoryId !== cat.id) { err(line, `"${top}" is in another category; a sub-skill must share its parent's category`); continue; }
    const existing = L.skills.find((k) => k.parentId === parent!.id && lc(k.name) === lc(sub));
    if (existing) {
      await tx.update(s.skill).set({
        aliases: keep(hasAliases, aliases, existing.aliases), description: keep(hasDescription, data.description ?? "", existing.description),
        status: keep(hasStatus, status, existing.status), sort: order,
      }).where(eq(s.skill.id, existing.id));
      r.updated++;
      continue;
    }
    const d = decide(`sub:${lc(top)}>${lc(sub)}`, line);
    if (d === "wait") continue;
    if (d?.action === "skip") { skipped(line, `${top}${SEP}${sub}`); continue; }
    if (d && (d.action === "merge" || d.action === "replace")) {
      const t = L.skillById.get(d.targetId!)!;
      if (t.id === parent.id) { err(line, `“${sub}” cannot replace its own parent skill`); continue; }
      if (d.action === "merge") {
        t.aliases = mergeAliases(t.name, t.aliases, [sub], aliases);
        if (!t.description && data.description) t.description = data.description;
      } else {
        t.aliases = mergeAliases(sub, t.aliases, [t.name], aliases);
        Object.assign(t, { name: sub, parentId: parent.id, categoryId: parent.categoryId, description: data.description ?? t.description, status, sort: order });
      }
      await tx.update(s.skill).set({ name: t.name, aliases: t.aliases, parentId: t.parentId, categoryId: t.categoryId, description: t.description, status: t.status, sort: t.sort }).where(eq(s.skill.id, t.id));
      r.updated++;
      continue;
    }
    const [k] = await tx.insert(s.skill).values({ name: sub, categoryId: cat.id, parentId: parent.id, aliases, description: data.description ?? "", status, sort: order }).returning();
    L.skills.push(k);
    L.skillById.set(k.id, k);
    r.created++;
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

async function importPeople(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err) {
  const later: { id: string; line: number; manager: string }[] = [];
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
    if ("team_name" in data) values.teamName = data.team_name;
    if (data.role) {
      const role = L.roles.find((x) => lc(x.name) === lc(data.role));
      if (!role) { err(line, `Unknown role "${data.role}" (add it in Roles, or import roles first)`); continue; }
      values.roleId = role.id;
    } else if ("role" in data) values.roleId = null;
    if (data.team_role) {
      const role = L.roles.find((x) => lc(x.name) === lc(data.team_role));
      if (!role) { err(line, `Unknown team role "${data.team_role}" (add it in Roles, or import roles first)`); continue; }
      values.teamRoleId = role.id;
      values.teamRoleCascade = /^(all|everyone|yes|true|1)$/i.test((data.team_role_for ?? "").trim());
    } else if ("team_role" in data) { values.teamRoleId = null; values.teamRoleCascade = false; }
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
    later.push({ id, line, manager: data.manager_email ?? "" });
  }
  // second pass: managers may appear further down the file
  for (const x of later) {
    if (x.manager) {
      const m = L.personByEmail.get(lc(x.manager));
      if (!m) err(x.line, `Manager ${x.manager} not found; saved without a manager`);
      else if (m.id === x.id) err(x.line, "Someone cannot be their own manager");
      else await tx.update(s.employee).set({ managerId: m.id }).where(eq(s.employee.id, x.id));
    }
  }
  // link existing sign-ins by e-mail
  await tx.execute(sql`update employee set user_id = u.id from "user" u
    where employee.user_id is null and lower(u.email) = lower(employee.email)
    and not exists (select 1 from employee e2 where e2.user_id = u.id)`);
}

async function importNeeds(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err) {
  for (const { line, data } of rows) {
    const m = L.personByEmail.get(lc(data.manager_email ?? ""));
    if (!m) { err(line, `Unknown manager ${data.manager_email} (import people first)`); continue; }
    const skill = findSkill(L, data.skill ?? "");
    if (!skill) { err(line, `Unknown skill "${data.skill}"`); continue; }
    const min = lvl(data.min_level, 1);
    if (min == null || min === "bad") { err(line, "min_level must be 1-5"); continue; }
    const hc = data.headcount ? Number(data.headcount) : 1;
    if (!Number.isInteger(hc) || hc < 1) { err(line, "headcount must be a whole number, 1 or more"); continue; }
    const had = await tx.delete(s.teamNeed).where(and(eq(s.teamNeed.managerId, m.id), eq(s.teamNeed.skillId, skill.id))).returning();
    await tx.insert(s.teamNeed).values({ managerId: m.id, skillId: skill.id, minLevel: min, headcount: hc, note: data.note ?? "" });
    if (had.length) r.updated++; else r.created++;
  }
}

async function importRatings(tx: Tx, L: Lk, rows: Rows, r: ImportReport, err: Err, actorId: string | null) {
  for (const { line, data } of rows) {
    const p = L.personByEmail.get(lc(data.email ?? ""));
    if (!p) { err(line, `Unknown person ${data.email}`); continue; }
    const skill = findSkill(L, data.skill ?? "");
    if (!skill) { err(line, `Unknown skill "${data.skill}"`); continue; }
    const self = lvl(data.self_level), val = lvl(data.confirmed_level ?? data.validated_level);
    if (self === "bad" || val === "bad") { err(line, "levels must be 0-5 or blank"); continue; }
    if (self == null && val == null) { err(line, "give a self_level, a validated_level, or both"); continue; }
    const confirmedOn = data.confirmed_on ?? data.validated_on ?? "";
    if (data.self_on && !isDate(data.self_on)) err(line, "self_on must be YYYY-MM-DD");
    if (confirmedOn && !isDate(confirmedOn)) err(line, "confirmed_on must be YYYY-MM-DD");
    const selfAt = self != null ? new Date(data.self_on && isDate(data.self_on) ? data.self_on : Date.now()) : null;
    const validatedAt = val != null ? new Date(confirmedOn && isDate(confirmedOn) ? confirmedOn : Date.now()) : null;
    const given = lc(data.status ?? "").replace("confirmed", "validated");
    if (given && !["draft", "submitted", "validated", "returned"].includes(given)) { err(line, "status must be draft, submitted, confirmed or returned"); continue; }
    const values = {
      selfLevel: self, selfAt, selfComment: data.self_comment ?? "", managerComment: data.manager_comment ?? "",
      validatedLevel: val, validatedAt, validatedBy: val != null ? actorId : null,
      interest: yes(data.interest, false), status: given || (val != null ? "validated" : "submitted"),
    };
    const had = await tx.delete(s.rating).where(and(eq(s.rating.employeeId, p.id), eq(s.rating.skillId, skill.id))).returning();
    await tx.insert(s.rating).values({ employeeId: p.id, skillId: skill.id, ...values });
    await tx.insert(s.ratingEvent).values({ employeeId: p.id, skillId: skill.id, kind: "import", level: val ?? self, actorId });
    if (had.length) r.updated++; else r.created++;
  }
}
