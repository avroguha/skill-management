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
// Roles belong to a team, the way the app means them to be: each manager made the roles their
// own team needs and put people in them. Two teams can have a role with the same name (SRE in
// Compute & Containers and in Reliability): they are two roles. A few people are in two roles.
// The manager persona's team has changes waiting in Review, and a few requests for new skills
// are at every stage (waiting, sent back, approved, refused).
import { count, eq, sql } from "drizzle-orm";
import type { DB } from "./index.ts";
import * as s from "./schema.ts";
import { DEFAULT_SETTINGS } from "../lib/engine/engine.ts";
import { DEFAULT_LEVELS } from "./seed.ts";
import { nextTint } from "../lib/role-colors.ts";
import { MADE_UP_FIRST, MADE_UP_LAST, MADE_UP_PLACES } from "./made-up-names.ts";

type SkillDef = string | [string, string[]];
const TAXONOMY: [string, string, SkillDef[]][] = [
  ["Cloud", "Public cloud platforms and the tooling around them.", [["AWS", ["EC2", "S3", "IAM", "Lambda"]], ["Azure", ["Virtual Machines", "AKS", "Entra ID"]], "Kubernetes", "Terraform"]],
  ["Programming", "Languages and the craft of writing code.", ["Python", "Java", "TypeScript", "Go", "SQL"]],
  ["Data", "Storing, moving and making sense of data.", ["PostgreSQL", "Kafka", "Spark", "Data modelling", "Power BI"]],
  ["DevOps", "Building, shipping and running software.", ["CI/CD pipelines", "Git", "Ansible", "Observability", "Linux administration", "Shell scripting", "Batch scheduling"]],
  ["Security", "Keeping systems and data safe.", ["Identity and access management", "Threat modelling", "Vulnerability management", "Network security"]],
  ["IT Service Management", "Running IT as a service.", ["Incident management", "Change management", "CMDB", ["Discovery", ["Patterns", "Probes and sensors"]], "ServiceNow administration"]],
  ["Managerial", "Leading people and work.", ["People leadership", "Mentoring", "Project management", "Agile delivery"]],
  ["Analytical", "Working things out from facts.", ["Problem solving", "Data analysis"]],
  ["Business", "Working with the people the work is for.", ["Stakeholder management", "Technical writing", "Vendor management"]],
];

// [skill path, level the role asks for, must-have (default) or nice-to-have]
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

// team: the roles the manager made, and how many people are in each
interface TeamDef { name: string; team: [string, number][]; weak?: Record<string, number>; needs?: [string, number, number][] }
interface UnitDef { name: string; kind: string; children: (UnitDef | TeamDef)[] }

const ORG: UnitDef = {
  name: "Avro Corp", kind: "company", children: [
    { name: "Technology", kind: "division", children: [
      { name: "Cloud Platform", kind: "department", children: [
        { name: "Compute & Containers", team: [["Cloud Engineer", 5], ["SRE", 2]], needs: [["Kubernetes", 3, 3]] },
        { name: "Infrastructure as Code", team: [["Cloud Engineer", 4]], weak: { Terraform: -1.6 } },
        { name: "Reliability", team: [["SRE", 5]], needs: [["Observability", 4, 2]] },
      ] },
      { name: "Data & Analytics", kind: "department", children: [
        { name: "Data Platform", team: [["Data Engineer", 6]], weak: { Kafka: -1.3 }, needs: [["Kafka", 3, 3]] },
        { name: "Insights", team: [["Data Analyst", 5], ["Data Engineer", 1]] },
      ] },
      { name: "Application Engineering", kind: "department", children: [
        { name: "Customer Apps", team: [["Software Developer", 7]], needs: [["TypeScript", 4, 2]] },
        { name: "Internal Tools", team: [["Software Developer", 4], ["Data Engineer", 1]] },
      ] },
      { name: "Security", kind: "department", children: [
        { name: "Identity", team: [["Security Engineer", 4]] },
        { name: "Security Operations", team: [["Security Engineer", 4], ["SRE", 1]], weak: { "Threat modelling": -1.5 }, needs: [["Threat modelling", 4, 2]] },
      ] },
    ] },
    { name: "Operations", kind: "division", children: [
      { name: "Service Operations", kind: "department", children: [
        { name: "Service Desk", team: [["IT Operations", 7]] },
        { name: "Major Incidents", team: [["IT Operations", 3], ["SRE", 2]], needs: [["Incident management", 4, 2]] },
        { name: "Batch Operations", team: [["Batch Operations", 4]], needs: [["Batch scheduling", 3, 2]] },
      ] },
      { name: "IT Service Management", kind: "department", children: [
        { name: "CMDB & Discovery", team: [["ITOM ServiceNow", 5]], weak: { "Discovery/Patterns": -1.4 }, needs: [["Discovery/Patterns", 3, 3]] },
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
export interface DemoPersonas { top: string; director: string; manager: string; member: string; coordinator: string }
export const DEMO_PERSONAS_KEY = "demo_personas";
/** Raised when the made-up organisation changes, so an existing demo database is rebuilt on the next start. */
export const DEMO_VERSION = 6;
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

  // ---- grades (a label on a person)
  const grades = GRADES.map(([name, rank]) => ({ id: crypto.randomUUID(), name, rank }));
  const gradeByName = new Map(grades.map((g) => [g.name, g]));

  // ---- people: every team is a manager and the people below them
  // roleNames are the roles the person is in (their manager's); kind says whether they lead a
  // team, a department or division, or neither
  type Person = typeof s.employee.$inferInsert & { id: string; roleNames: string[]; kind: "member" | "manager" | "head"; ability: number; weak: Record<string, number>; team: string };
  const employees: Person[] = [];
  const needs: (typeof s.teamNeed.$inferInsert)[] = [];
  const teamRoles: (typeof s.teamRole.$inferInsert & { id: string })[] = [];
  const roleMembers: (typeof s.teamRoleMember.$inferInsert)[] = [];
  const roleSkills: (typeof s.teamRoleSkill.$inferInsert)[] = [];
  const roleIdOf = new Map<string, string>(); // "<manager id>|<role name>" -> team role id
  const usedNames = new Set<string>();
  const person = (team: string, kind: Person["kind"], title: string, roleNames: string[], gradeName: string, managerId: string | null, weak: Record<string, number> = {}): Person => {
    let name = "";
    do name = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`; while (usedNames.has(name));
    usedNames.add(name);
    const g = GRADES.find(([n]) => n === gradeName)!;
    const e: Person = {
      id: crypto.randomUUID(),
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@avro.com`,
      title,
      gradeId: gradeByName.get(gradeName)!.id,
      managerId,
      location: LOCATIONS[Math.floor(rnd() * LOCATIONS.length)],
      roleNames, kind,
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
  /** A role of one team, made by its manager: the name, and the skills it asks for. */
  const teamRole = (managerId: string, name: string, sort: number) => {
    const id = crypto.randomUUID();
    teamRoles.push({ id, managerId, name, description: ROLES[name]!.description, sort, color: nextTint(teamRoles.filter((r) => r.managerId === managerId).map((r) => r.color)) });
    roleIdOf.set(`${managerId}|${name}`, id);
    for (const [path, target, mandatory = true] of ROLES[name]!.skills) roleSkills.push({ roleId: id, skillId: sk(path), target, mandatory });
    return id;
  };
  const build = (def: UnitDef | TeamDef, parentHead: string | null) => {
    if ("team" in def) {
      const mgr = person(def.name, "manager", "Engineering Manager", [], "Lead", parentHead);
      mgr.teamName = def.name;
      def.team.forEach(([roleName, n], ri) => {
        const rid = teamRole(mgr.id, roleName, ri + 1);
        for (let i = 0; i < n; i++) {
          const grade = pickGrade();
          const p = person(def.name, "member", `${grade === "Engineer" ? "" : `${grade} `}${roleName}`.trim(), [roleName], grade, mgr.id, def.weak ?? {});
          roleMembers.push({ roleId: rid, employeeId: p.id });
        }
      });
      // one person serves two roles where the team has two
      if (def.team.length > 1) {
        const second = def.team[1]![0];
        const both = employees.find((e) => e.managerId === mgr.id && e.roleNames[0] === def.team[0]![0])!;
        both.roleNames.push(second);
        roleMembers.push({ roleId: roleIdOf.get(`${mgr.id}|${second}`)!, employeeId: both.id });
      }
      for (const [path, minLevel, headcount] of def.needs ?? []) needs.push({ managerId: mgr.id, skillId: sk(path), minLevel, headcount, note: "What the team needs to run its services" });
      return;
    }
    const head = person(def.name, "head", "Director", [], "Principal", parentHead);
    head.teamName = def.name;
    for (const c of def.children) build(c, head.id);
  };
  build(ORG, null);

  // ---- ratings
  // what a person's roles ask of them: the highest level any of them asks for
  const reqsOf = (e: Person) => {
    const m = new Map<string, number>();
    for (const name of e.roleNames) for (const [path, target] of ROLES[name]!.skills) m.set(sk(path), Math.max(m.get(sk(path)) ?? 0, target));
    return m;
  };
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
    const req = manager ? new Map<string, number>() : reqsOf(e);
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
  await db.insert(s.grade).values(grades);
  await insertChunks(employees.map(({ roleNames: _r, kind: _k, ability: _a, weak: _w, team: _t, ...e }) => e), (c) => db.insert(s.employee).values(c));
  await insertChunks(teamRoles, (c) => db.insert(s.teamRole).values(c));
  await insertChunks(roleMembers, (c) => db.insert(s.teamRoleMember).values(c));
  await insertChunks(roleSkills, (c) => db.insert(s.teamRoleSkill).values(c));
  await db.insert(s.teamNeed).values(needs);
  await insertChunks(ratings, (c) => db.insert(s.rating).values(c));
  await insertChunks(events, (c) => db.insert(s.ratingEvent).values(c));

  const top = employees.find((e) => !e.managerId)!;
  const director = employees.find((e) => e.kind === "head" && e.team === "Cloud Platform")!;
  const manager = employees.find((e) => e.team === focusTeam && e.kind === "manager")!;
  const member = employees.find((e) => e.team === focusTeam && e.managerId === manager.id && e.roleNames.length === 1 && e.roleNames[0] === "Cloud Engineer")!;
  // the coordinator is a manager elsewhere who also approves requests for new skills
  const coordinator = employees.find((e) => e.team === "Reliability" && e.kind === "manager")!;
  const personas: DemoPersonas = { top: top.id, director: director.id, manager: manager.id, member: member.id, coordinator: coordinator.id };

  // ---- a skill the manager asks of one person beyond their role: the team member persona
  const extra = { employeeId: member.id, skillId: sk("Ansible"), target: 3, mandatory: true, note: "You take over the patching runbooks next quarter." };
  await db.insert(s.teamPersonSkill).values({ managerId: manager.id, ...extra });

  // ---- changes waiting in Review: the manager persona started a new role and has not confirmed it
  {
    const mine = teamRoles.filter((r) => r.managerId === manager.id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    const people = employees.filter((e) => e.managerId === manager.id);
    const doc = {
      roles: [
        ...mine.map((r) => ({
          id: r.id, name: r.name, description: r.description ?? "", color: r.color ?? "",
          members: roleMembers.filter((m) => m.roleId === r.id).map((m) => m.employeeId).sort(),
          skills: roleSkills.filter((k) => k.roleId === r.id).map((k) => ({ skillId: k.skillId, target: k.target, mandatory: k.mandatory ?? true })),
        })),
        { id: crypto.randomUUID(), name: "On-call", description: "Looks after production out of hours.", color: nextTint(mine.map((r) => r.color)), members: people.slice(0, 2).map((e) => e.id),
          skills: [{ skillId: sk("Incident management"), target: 3, mandatory: true }, { skillId: sk("Observability"), target: 3, mandatory: true }] },
      ],
      needs: needs.filter((n) => n.managerId === manager.id).map((n) => ({ skillId: n.skillId, minLevel: n.minLevel, headcount: n.headcount ?? 1, note: n.note ?? "" })),
      // the one in force, and one more not confirmed yet
      extras: [extra, ...people.filter((e) => e.id !== member.id).slice(0, 1).map((e) => ({ employeeId: e.id, skillId: sk("Python"), target: 3, mandatory: false, note: "To help automate the runbooks." }))],
      dismissed: [] as string[],
    };
    await db.insert(s.teamDraft).values({ managerId: manager.id, doc: doc as never, authorId: "demo:manager", authorName: manager.name });
  }

  // ---- requests for new skills and a category, at every stage
  {
    const cat = (name: string) => categories.find((c) => c.name === name)!.id!;
    const step = (by: string, action: string, note = "", daysAgo = 1) => ({ at: ago(daysAgo).toISOString(), by, action, note });
    await db.insert(s.catalogueRequest).values([
      { kind: "skill", name: "Service mesh", description: "Traffic, security and observability between services.", categoryId: cat("Cloud"), reason: "Two of our platforms run one now and nobody is rated on it.",
        status: "pending", requestedById: "demo:manager", requestedByEmployeeId: manager.id, requestedByName: manager.name, createdAt: ago(2), updatedAt: ago(2), history: [step(manager.name, "asked", "", 2)] },
      { kind: "category", name: "Finance operations", description: "Budgets, forecasts and cost reporting for technology.", reason: "We want to rate cost skills apart from the technical ones.",
        status: "pending", requestedById: "demo:director", requestedByEmployeeId: director.id, requestedByName: director.name, createdAt: ago(1), updatedAt: ago(1), history: [step(director.name, "asked", "", 1)] },
      { kind: "skill", name: "Kubernets operators", description: "", categoryId: cat("Cloud"), reason: "I write these.",
        status: "returned", requestedById: "demo:member", requestedByEmployeeId: member.id, requestedByName: member.name, createdAt: ago(6), updatedAt: ago(4),
        decidedById: "demo:coordinator", decidedByName: coordinator.name, decidedAt: ago(4), comment: "Is this a sub-skill of Kubernetes? Please check the spelling and say what it covers.",
        history: [step(member.name, "asked", "", 6), step(coordinator.name, "sent back", "Is this a sub-skill of Kubernetes? Please check the spelling and say what it covers.", 4)] },
      { kind: "skill", name: "Status page writing", description: "Telling customers plainly what is broken and when it will be back.", categoryId: cat("DevOps"), reason: "Part of our reliability work.",
        status: "rejected", requestedById: "demo:manager", requestedByEmployeeId: manager.id, requestedByName: manager.name, createdAt: ago(20), updatedAt: ago(18),
        decidedById: "demo:coordinator", decidedByName: coordinator.name, decidedAt: ago(18), comment: "Covered by Observability and Incident management for now. Ask again when a team does it as a practice.",
        history: [step(manager.name, "asked", "", 20), step(coordinator.name, "said no", "Covered by Observability and Incident management for now. Ask again when a team does it as a practice.", 18)] },
      { kind: "skill", name: "Batch scheduling", description: "Scheduling and running batch workloads.", categoryId: cat("DevOps"), reason: "The batch team is rated on it.",
        status: "approved", requestedById: "demo:director", requestedByEmployeeId: director.id, requestedByName: director.name, createdAt: ago(60), updatedAt: ago(58),
        decidedById: "demo:coordinator", decidedByName: coordinator.name, decidedAt: ago(58), comment: "", resultId: sk("Batch scheduling"),
        history: [step(director.name, "asked", "", 60), step(coordinator.name, "approved", "", 58)] },
    ]);
  }
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
    await tx.execute(sql`truncate table "rating_event", "rating", "team_need", "team_draft", "team_role_skill", "team_role_member", "team_role", "catalogue_request", "group_member", "sn_group", "employee", "skill", "skill_category", "grade", "proficiency_level", "email_message", "audit_log", "app_setting", "sync_run" cascade`);
  });
  return seedDemo(db);
}

export async function demoPersonas(db: DB): Promise<DemoPersonas | null> {
  const [row] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, DEMO_PERSONAS_KEY));
  return (row?.value as DemoPersonas | undefined) ?? null;
}
