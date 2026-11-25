// The demo organisation: made-up people and skills in the DEMO database only (the header's
// Demo switch), for presentations. Never written to the live database.
// Deterministic: a fixed random seed, so every install shows the same picture.
// The company, people and e-mail addresses are made up (Avro Corp, avro.com); the people's
// names and the places are invented words, so they match nobody (./made-up-names.ts).
//
// It plants a few weak spots on purpose so the views have something to say:
// a team with one Discovery pattern author (single point of failure), an
// infrastructure-as-code team that is weak in Terraform, a security operations
// team short of threat modellers, a data team short of Kafka, and stale ratings.
//
// Roles are chosen by managers, the way the app means them to be:
//  - the head of Operations chose IT Operations for everyone below;
//  - under them the Batch Operations manager chose Batch Operations for their own team, and
//    the head of IT Service Management chose ServiceNow for everyone below them, where the
//    CMDB & Discovery manager chose the more specific ITOM ServiceNow;
//  - in Technology each department head chose a role for everyone below (Cloud Engineer,
//    Software Developer, Security Engineer), the Reliability manager chose SRE, and the two
//    data teams each chose their own;
//  - a few people have a role of their own (an SRE in a cloud team): nobody is forced.
import { count, eq, sql } from "drizzle-orm";
import type { DB } from "./index.ts";
import * as s from "./schema.ts";
import { DEFAULT_SETTINGS } from "../lib/engine/engine.ts";
import { DEFAULT_LEVELS } from "./seed.ts";
import { MADE_UP_FIRST, MADE_UP_LAST, MADE_UP_PLACES } from "./made-up-names.ts";

type SkillDef = string | [string, string[]];
const TAXONOMY: [string, string, SkillDef[]][] = [
  ["Cloud", "Public cloud platforms and the tooling around them.", [["AWS", ["EC2", "S3", "IAM", "Lambda"]], ["Azure", ["Virtual Machines", "AKS", "Entra ID"]], "Kubernetes", "Terraform"]],
  ["Programming", "Languages and the craft of writing code.", ["Python", "Java", "TypeScript", "Go", "SQL"]],
  ["Data", "Storing, moving and making sense of data.", ["PostgreSQL", "Kafka", "Spark", "Data modelling", "Power BI"]],
  ["DevOps", "Building, shipping and running software.", ["CI/CD pipelines", "Git", "Ansible", "Observability", "Linux administration", "Shell scripting", "Batch scheduling"]],
  ["Security", "Keeping systems and data safe.", ["Identity and access management", "Threat modelling", "Vulnerability management", "Network security"]],
  ["IT Service Management", "Running IT as a service.", ["Incident management", "Change management", "CMDB", ["Discovery", ["Patterns", "Probes and sensors"]], "ServiceNow administration"]],
  ["Ways of working", "How people work together.", ["Agile delivery", "Stakeholder management", "Technical writing", "Mentoring"]],
];

// [skill path, target for all grades, mandatory]
type Req = [string, number, boolean?];
const ROLES: Record<string, { description: string; skills: Req[] }> = {
  "IT Operations": { description: "Keeps the services running day to day: incidents, changes, requests.", skills: [["Incident management", 3], ["Change management", 3], ["CMDB", 2], ["Stakeholder management", 3], ["Linux administration", 2], ["Technical writing", 2, false]] },
  SRE: { description: "Site reliability engineering: keeps production healthy.", skills: [["Kubernetes", 3], ["Observability", 3], ["Linux administration", 4], ["Incident management", 3], ["Python", 3], ["Ansible", 2], ["AWS/EC2", 2, false]] },
  "Software Developer": { description: "Builds applications.", skills: [["TypeScript", 3], ["Java", 3], ["Git", 3], ["CI/CD pipelines", 3], ["SQL", 2], ["Agile delivery", 2], ["Go", 2, false]] },
  "Batch Operations": { description: "Runs and watches the scheduled jobs.", skills: [["Batch scheduling", 3], ["Shell scripting", 3], ["Linux administration", 3], ["SQL", 2], ["Incident management", 2], ["Observability", 2, false]] },
  ServiceNow: { description: "Runs and configures the ServiceNow platform.", skills: [["ServiceNow administration", 3], ["CMDB", 3], ["Change management", 2], ["Incident management", 2], ["Technical writing", 2, false]] },
  "ITOM ServiceNow": { description: "ServiceNow IT operations management: the CMDB and discovery.", skills: [["ServiceNow administration", 3], ["CMDB", 3], ["Discovery/Patterns", 3], ["Discovery/Probes and sensors", 3], ["Linux administration", 2], ["Python", 2, false]] },
  "Cloud Engineer": { description: "Builds and runs cloud infrastructure.", skills: [["AWS/EC2", 3], ["AWS/S3", 3], ["AWS/IAM", 3], ["Kubernetes", 3], ["Terraform", 3], ["Linux administration", 3], ["Python", 2], ["Observability", 2, false]] },
  "Data Engineer": { description: "Builds data pipelines and platforms.", skills: [["Python", 3], ["SQL", 4], ["PostgreSQL", 3], ["Kafka", 3], ["Spark", 3], ["Data modelling", 3], ["Git", 2]] },
  "Data Analyst": { description: "Turns data into decisions.", skills: [["SQL", 3], ["Power BI", 3], ["Data modelling", 2], ["Python", 2, false], ["Stakeholder management", 3]] },
  "Security Engineer": { description: "Designs and operates security controls.", skills: [["Identity and access management", 3], ["Threat modelling", 3], ["Vulnerability management", 3], ["Network security", 3], ["AWS/IAM", 3], ["Azure/Entra ID", 2], ["Python", 2, false]] },
};

const GRADES: [string, number, number][] = [
  // name, rank, ability offset
  ["Associate", 1, -0.6], ["Engineer", 2, 0], ["Senior", 3, 0.85], ["Lead", 4, 1.1], ["Principal", 5, 1.4],
];

// role on a team: the role its manager chose for the team. role on a unit: the role its head
// chose for everyone below. A team without one follows the nearest unit above that has one.
interface TeamDef { name: string; team: [string, number][]; weak?: Record<string, number>; needs?: [string, number, number][]; role?: string }
interface UnitDef { name: string; kind: string; role?: string; children: (UnitDef | TeamDef)[] }

const ORG: UnitDef = {
  name: "Avro Corp", kind: "company", children: [
    { name: "Technology", kind: "division", children: [
      { name: "Cloud Platform", kind: "department", role: "Cloud Engineer", children: [
        { name: "Compute & Containers", team: [["Cloud Engineer", 5], ["SRE", 2]], needs: [["Kubernetes", 3, 3]] },
        { name: "Infrastructure as Code", team: [["Cloud Engineer", 4]], weak: { Terraform: -1.6 } },
        { name: "Reliability", role: "SRE", team: [["SRE", 5]], needs: [["Observability", 4, 2]] },
      ] },
      { name: "Data & Analytics", kind: "department", children: [
        { name: "Data Platform", role: "Data Engineer", team: [["Data Engineer", 6]], weak: { Kafka: -1.3 }, needs: [["Kafka", 3, 3]] },
        { name: "Insights", role: "Data Analyst", team: [["Data Analyst", 5], ["Data Engineer", 1]] },
      ] },
      { name: "Application Engineering", kind: "department", role: "Software Developer", children: [
        { name: "Customer Apps", team: [["Software Developer", 7]], needs: [["TypeScript", 4, 2]] },
        { name: "Internal Tools", team: [["Software Developer", 4], ["Data Engineer", 1]] },
      ] },
      { name: "Security", kind: "department", role: "Security Engineer", children: [
        { name: "Identity", team: [["Security Engineer", 4]] },
        { name: "Security Operations", team: [["Security Engineer", 4], ["SRE", 1]], weak: { "Threat modelling": -1.5 }, needs: [["Threat modelling", 4, 2]] },
      ] },
    ] },
    { name: "Operations", kind: "division", role: "IT Operations", children: [
      { name: "Service Operations", kind: "department", children: [
        { name: "Service Desk", team: [["IT Operations", 7]] },
        { name: "Major Incidents", team: [["IT Operations", 3], ["SRE", 2]], needs: [["Incident management", 4, 2]] },
        { name: "Batch Operations", role: "Batch Operations", team: [["Batch Operations", 4]], needs: [["Batch scheduling", 3, 2]] },
      ] },
      { name: "IT Service Management", kind: "department", role: "ServiceNow", children: [
        { name: "CMDB & Discovery", role: "ITOM ServiceNow", team: [["ITOM ServiceNow", 5]], weak: { "Discovery/Patterns": -1.4 }, needs: [["Discovery/Patterns", 3, 3]] },
        { name: "Change & Release", team: [["ServiceNow", 4]] },
      ] },
    ] },
  ],
};

// invented names and places (./made-up-names.ts): nobody finds a colleague in the demo
const FIRST = MADE_UP_FIRST;
const LAST = MADE_UP_LAST;
const LOCATIONS = MADE_UP_PLACES;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(n)));
const DAY = 86400e3;

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 400) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

/** The people a presenter can be in demo mode, by what they show. */
export interface DemoPersonas { top: string; director: string; manager: string; member: string }
export const DEMO_PERSONAS_KEY = "demo_personas";
/** Raised when the made-up organisation changes, so an existing demo database is rebuilt on the next start. */
export const DEMO_VERSION = 3;
const DEMO_VERSION_KEY = "demo_version";

export async function seedDemo(db: DB): Promise<DemoPersonas> {
  const rnd = mulberry32(20261118);
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 0.5; // approx N(0,1)
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY);

  // ---- taxonomy
  const categories: (typeof s.skillCategory.$inferInsert)[] = [];
  const skills: (typeof s.skill.$inferInsert & { id: string })[] = [];
  const skillByPath = new Map<string, string>();
  TAXONOMY.forEach(([name, description, defs], ci) => {
    const cid = crypto.randomUUID();
    categories.push({ id: cid, name, description, sort: ci + 1 });
    defs.forEach((d, si) => {
      const [sname, subs] = typeof d === "string" ? [d, [] as string[]] : d;
      const sid = crypto.randomUUID();
      skills.push({ id: sid, categoryId: cid, name: sname, sort: si + 1, aliases: sname === "Kubernetes" ? ["K8s"] : [] });
      skillByPath.set(sname, sid);
      subs.forEach((sub, k) => {
        const id = crypto.randomUUID();
        skills.push({ id, categoryId: cid, parentId: sid, name: sub, sort: k + 1, aliases: [] });
        skillByPath.set(`${sname}/${sub}`, id);
      });
    });
  });
  const sk = (p: string) => {
    const id = skillByPath.get(p);
    if (!id) throw new Error(`demo: unknown skill ${p}`);
    return id;
  };

  // ---- roles and grades
  const roles = Object.entries(ROLES).map(([name, r]) => ({ id: crypto.randomUUID(), name, description: r.description }));
  const roleId = new Map(roles.map((r) => [r.name, r.id]));
  const grades = GRADES.map(([name, rank]) => ({ id: crypto.randomUUID(), name, rank }));
  const gradeByName = new Map(grades.map((g) => [g.name, g]));
  const roleSkills: (typeof s.roleSkill.$inferInsert)[] = [];
  for (const [name, r] of Object.entries(ROLES)) {
    for (const [path, target, mandatory = true] of r.skills) {
      roleSkills.push({ roleId: roleId.get(name)!, gradeId: null, skillId: sk(path), target, mandatory });
      if (!mandatory || target < 3) continue;
      roleSkills.push({ roleId: roleId.get(name)!, gradeId: gradeByName.get("Associate")!.id, skillId: sk(path), target: target - 1, mandatory });
      for (const g of ["Senior", "Lead", "Principal"]) {
        roleSkills.push({ roleId: roleId.get(name)!, gradeId: gradeByName.get(g)!.id, skillId: sk(path), target: Math.min(5, target + 1), mandatory });
      }
    }
  }

  // ---- people: every team is a manager and the people below them
  // roleName is the role that counts for the person (their team's, or their own); kind says
  // whether they lead a team, a department or division, or neither
  type Person = typeof s.employee.$inferInsert & { id: string; roleName: string | null; kind: "member" | "manager" | "head"; ability: number; weak: Record<string, number>; team: string };
  const employees: Person[] = [];
  const needs: (typeof s.teamNeed.$inferInsert)[] = [];
  const usedNames = new Set<string>();
  const person = (team: string, kind: Person["kind"], title: string, roleName: string | null, gradeName: string, managerId: string | null, own: boolean, weak: Record<string, number> = {}): Person => {
    let name = "";
    do name = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`; while (usedNames.has(name));
    usedNames.add(name);
    const g = GRADES.find(([n]) => n === gradeName)!;
    const e: Person = {
      id: crypto.randomUUID(),
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@avro.com`,
      title,
      // a role of their own only where it differs from the team's: everyone else follows the team
      roleId: own && roleName ? roleId.get(roleName)! : null,
      gradeId: gradeByName.get(gradeName)!.id,
      managerId,
      location: LOCATIONS[Math.floor(rnd() * LOCATIONS.length)],
      roleName, kind,
      ability: gauss() * 0.6 + g[2] + 0.3,
      weak,
      team,
    };
    employees.push(e);
    return e;
  };
  const pickGrade = () => {
    const x = rnd();
    return x < 0.2 ? "Associate" : x < 0.6 ? "Engineer" : x < 0.85 ? "Senior" : x < 0.95 ? "Lead" : "Principal";
  };
  const build = (def: UnitDef | TeamDef, parentHead: string | null, fromAbove: string | null) => {
    if ("team" in def) {
      const teamRole = def.role ?? fromAbove;
      const mgr = person(def.name, "manager", "Engineering Manager", teamRole, "Lead", parentHead, false);
      mgr.teamName = def.name;
      if (def.role) mgr.teamRoleId = roleId.get(def.role)!;
      for (const [roleName, n] of def.team) for (let i = 0; i < n; i++) {
        const grade = pickGrade();
        person(def.name, "member", `${grade === "Engineer" ? "" : `${grade} `}${roleName}`.trim(), roleName, grade, mgr.id, roleName !== teamRole, def.weak ?? {});
      }
      for (const [path, minLevel, headcount] of def.needs ?? []) needs.push({ managerId: mgr.id, skillId: sk(path), minLevel, headcount, note: "What the team needs to run its services" });
      return;
    }
    const role = def.role ?? fromAbove;
    const head = person(def.name, "head", "Director", role, "Principal", parentHead, false);
    head.teamName = def.name;
    // a head's choice is for everyone below them
    if (def.role) { head.teamRoleId = roleId.get(def.role)!; head.teamRoleCascade = true; }
    for (const c of def.children) build(c, head.id, role);
  };
  build(ORG, null, null);

  // ---- ratings
  const roleReqs = new Map<string, Map<string, number>>();
  for (const rs of roleSkills) {
    if (rs.gradeId) continue;
    const m = roleReqs.get(rs.roleId) ?? new Map();
    m.set(rs.skillId, rs.target);
    roleReqs.set(rs.roleId, m);
  }
  const rateable = skills.filter((x) => !skills.some((c) => c.parentId === x.id));
  const pathOf = new Map([...skillByPath.entries()].map(([p, id]) => [id, p]));
  const managers = new Set(employees.map((e) => e.managerId).filter(Boolean));
  // what each person will show: most are done; some have not started, some are half way,
  // some wait for their manager, a few were sent back - most of those in one team, so the
  // manager persona has work waiting
  const focusTeam = "Compute & Containers";
  const stateOf = (e: Person): "done" | "not_started" | "draft" | "waiting" | "returned" => {
    const x = rnd();
    if (e.team === focusTeam) return x < 0.15 ? "not_started" : x < 0.3 ? "draft" : x < 0.7 ? "waiting" : x < 0.8 ? "returned" : "done";
    return x < 0.06 ? "not_started" : x < 0.12 ? "draft" : x < 0.2 ? "waiting" : x < 0.22 ? "returned" : "done";
  };
  const ratings: (typeof s.rating.$inferInsert)[] = [];
  const events: (typeof s.ratingEvent.$inferInsert)[] = [];
  for (const e of employees) {
    const manager = managers.has(e.id);
    const state = manager ? "done" : stateOf(e);
    if (state === "not_started") continue;
    // managers do not assess, but a few technical ones list skills of their own
    const req = manager || !e.roleName ? new Map<string, number>() : roleReqs.get(roleId.get(e.roleName)!) ?? new Map<string, number>();
    const extra = rateable.filter((x) => !req.has(x.id)).sort(() => rnd() - 0.5).slice(0, manager ? (rnd() < 0.4 ? 3 : 0) : Math.floor(rnd() * 4));
    const targets: [string, number][] = [...req.entries(), ...extra.map((x) => [x.id, manager ? 3 : 1] as [string, number])];
    targets.forEach(([skillId, target], i) => {
      if (state === "draft" && i > targets.length / 2) return; // half way
      const weak = e.weak[pathOf.get(skillId) ?? ""] ?? 0;
      const truth = clamp(target + e.ability + weak + gauss() * 0.7 - (req.has(skillId) || manager ? 0 : 1.2));
      const self = clamp(truth + (rnd() < 0.35 ? 1 : 0) - (rnd() < 0.07 ? 1 : 0));
      const stale = rnd() < 0.06;
      const selfAt = state === "done" ? (stale ? ago(400 + rnd() * 140) : ago(20 + rnd() * 200)) : ago(1 + rnd() * 12);
      const confirmed = state === "done" || manager;
      const validatedAt = confirmed ? new Date(selfAt.getTime() + (2 + rnd() * 12) * DAY) : null;
      const returned = state === "returned" && i === 0;
      ratings.push({
        employeeId: e.id, skillId,
        selfLevel: self, selfAt, selfComment: self >= 4 ? "Led this on a recent project" : "",
        validatedLevel: confirmed ? (manager ? self : truth) : null, validatedAt, validatedBy: confirmed ? e.managerId : null,
        managerComment: returned ? "Can you add an example? This is higher than what I have seen." : "",
        interest: rnd() < 0.25,
        status: confirmed ? "validated" : returned ? "returned" : state === "draft" ? "draft" : "submitted",
      });
      if (state !== "draft") events.push({ employeeId: e.id, skillId, kind: "submit", level: self, actorId: null, at: selfAt });
      if (confirmed) events.push({ employeeId: e.id, skillId, kind: "validate", level: truth, actorId: null, at: validatedAt! });
      if (returned) events.push({ employeeId: e.id, skillId, kind: "return", level: null, note: "Can you add an example?", actorId: null, at: new Date(selfAt.getTime() + DAY) });
    });
  }

  // ---- write
  await db.insert(s.proficiencyLevel).values(DEFAULT_LEVELS).onConflictDoNothing();
  await db.insert(s.appSetting).values({ key: "settings", value: DEFAULT_SETTINGS }).onConflictDoNothing();
  await db.insert(s.skillCategory).values(categories);
  await insertChunks(skills, (c) => db.insert(s.skill).values(c));
  await db.insert(s.jobRole).values(roles);
  await db.insert(s.grade).values(grades);
  await insertChunks(roleSkills, (c) => db.insert(s.roleSkill).values(c));
  await insertChunks(employees.map(({ roleName: _r, kind: _k, ability: _a, weak: _w, team: _t, ...e }) => e), (c) => db.insert(s.employee).values(c));
  await db.insert(s.teamNeed).values(needs);
  await insertChunks(ratings, (c) => db.insert(s.rating).values(c));
  await insertChunks(events, (c) => db.insert(s.ratingEvent).values(c));

  const top = employees.find((e) => !e.managerId)!;
  // the director leads a department whose role reaches everyone below; the manager's team
  // follows it; the member follows their team
  const director = employees.find((e) => e.kind === "head" && e.team === "Cloud Platform")!;
  const manager = employees.find((e) => e.team === focusTeam && e.kind === "manager")!;
  const member = employees.find((e) => e.team === focusTeam && e.managerId === manager.id && e.roleName === "Cloud Engineer")!;
  const personas: DemoPersonas = { top: top.id, director: director.id, manager: manager.id, member: member.id };
  await db.insert(s.appSetting).values({ key: DEMO_PERSONAS_KEY, value: personas as never });
  await db.insert(s.appSetting).values({ key: DEMO_VERSION_KEY, value: DEMO_VERSION as never });
  await db.insert(s.auditLog).values({ actorName: "system", action: "seed", entity: "demo", detail: { employees: employees.length, ratings: ratings.length } });
  console.log(`demo: ${employees.length} people, ${skills.length} skills, ${ratings.length} ratings`);
  return personas;
}

/** Fills the demo database the first time it is opened, and rebuilds it when the app brings a newer demo organisation. */
export async function seedDemoIfEmpty(db: DB): Promise<void> {
  const [{ n }] = await db.select({ n: count() }).from(s.employee);
  if (Number(n) === 0) { await seedDemo(db); return; }
  const [row] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, DEMO_VERSION_KEY));
  if (Number(row?.value ?? 1) !== DEMO_VERSION) {
    console.log("demo: a newer demo organisation came with this version; rebuilding the demo database");
    await resetDemo(db);
  }
}

/** Puts the demo back as it was: everything in the demo database is replaced. */
export async function resetDemo(db: DB): Promise<DemoPersonas> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate table "rating_event", "rating", "team_need", "role_skill", "group_member", "sn_group", "employee", "skill", "skill_category", "job_role", "grade", "proficiency_level", "email_message", "audit_log", "app_setting", "sync_run" cascade`);
  });
  return seedDemo(db);
}

export async function demoPersonas(db: DB): Promise<DemoPersonas | null> {
  const [row] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, DEMO_PERSONAS_KEY));
  return (row?.value as DemoPersonas | undefined) ?? null;
}
