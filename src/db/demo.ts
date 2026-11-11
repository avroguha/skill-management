// Demo organisation for evaluating the app (SEED_DEMO=true, empty database only).
// Deterministic: a fixed random seed, so every install shows the same picture.
// The company, people and e-mail addresses are made up (Avro Corp, avro.com).
//
// It plants a few weak spots on purpose so the views have something to say:
// a team with one Discovery pattern author (single point of failure), an
// infrastructure-as-code team that is weak in Terraform, a security operations
// team short of threat modellers, a data team short of Kafka, and stale ratings.
import { hashPassword } from "better-auth/crypto";
import type { DB } from "./index.ts";
import * as s from "./schema.ts";
import { createEngine, DEFAULT_SETTINGS, type Dataset } from "../lib/engine/engine.ts";

type SkillDef = string | [string, string[]];
const TAXONOMY: [string, string, SkillDef[]][] = [
  ["Cloud", "Public cloud platforms and the tooling around them.", [["AWS", ["EC2", "S3", "IAM", "Lambda"]], ["Azure", ["Virtual Machines", "AKS", "Entra ID"]], "Kubernetes", "Terraform"]],
  ["Programming", "Languages and the craft of writing code.", ["Python", "Java", "TypeScript", "Go", "SQL"]],
  ["Data", "Storing, moving and making sense of data.", ["PostgreSQL", "Kafka", "Spark", "Data modelling", "Power BI"]],
  ["DevOps", "Building, shipping and running software.", ["CI/CD pipelines", "Git", "Ansible", "Observability", "Linux administration"]],
  ["Security", "Keeping systems and data safe.", ["Identity and access management", "Threat modelling", "Vulnerability management", "Network security"]],
  ["IT Service Management", "Running IT as a service.", ["Incident management", "Change management", "CMDB", ["Discovery", ["Patterns", "Probes and sensors"]]]],
  ["Ways of working", "How people work together.", ["Agile delivery", "Stakeholder management", "Technical writing", "Mentoring"]],
];

// [skill path, target for all grades, mandatory]
type Req = [string, number, boolean?];
const ROLES: Record<string, { description: string; skills: Req[] }> = {
  "Cloud Engineer": { description: "Builds and runs cloud infrastructure.", skills: [["AWS/EC2", 3], ["AWS/S3", 3], ["AWS/IAM", 3], ["Kubernetes", 3], ["Terraform", 3], ["Linux administration", 3], ["Python", 2], ["Observability", 2, false]] },
  "Site Reliability Engineer": { description: "Keeps production healthy.", skills: [["Kubernetes", 3], ["Observability", 3], ["Linux administration", 4], ["Incident management", 3], ["Python", 3], ["Ansible", 2], ["AWS/EC2", 2, false]] },
  "Data Engineer": { description: "Builds data pipelines and platforms.", skills: [["Python", 3], ["SQL", 4], ["PostgreSQL", 3], ["Kafka", 3], ["Spark", 3], ["Data modelling", 3], ["Git", 2]] },
  "Data Analyst": { description: "Turns data into decisions.", skills: [["SQL", 3], ["Power BI", 3], ["Data modelling", 2], ["Python", 2, false], ["Stakeholder management", 3]] },
  "Software Engineer": { description: "Builds applications.", skills: [["TypeScript", 3], ["Java", 3], ["Git", 3], ["CI/CD pipelines", 3], ["SQL", 2], ["Agile delivery", 2], ["Go", 2, false]] },
  "Security Engineer": { description: "Designs and operates security controls.", skills: [["Identity and access management", 3], ["Threat modelling", 3], ["Vulnerability management", 3], ["Network security", 3], ["AWS/IAM", 3], ["Azure/Entra ID", 2], ["Python", 2, false]] },
  "Service Analyst": { description: "Runs incident and change processes.", skills: [["Incident management", 3], ["Change management", 3], ["CMDB", 2], ["Stakeholder management", 3], ["Technical writing", 2, false]] },
  "Platform Analyst": { description: "Owns the CMDB and discovery.", skills: [["CMDB", 3], ["Discovery/Patterns", 3], ["Discovery/Probes and sensors", 3], ["Change management", 2], ["Python", 2, false], ["Linux administration", 2]] },
  "Engineering Manager": { description: "Leads a team.", skills: [["Stakeholder management", 4], ["Mentoring", 4], ["Agile delivery", 3], ["Technical writing", 3]] },
  Director: { description: "Leads a department or division.", skills: [["Stakeholder management", 5], ["Mentoring", 4], ["Agile delivery", 3]] },
};

const GRADES: [string, number, number][] = [
  // name, rank, ability offset
  ["Associate", 1, -0.6], ["Engineer", 2, 0], ["Senior", 3, 0.85], ["Lead", 4, 1.1], ["Principal", 5, 1.4],
];

interface TeamDef { name: string; team: [string, number][]; weak?: Record<string, number>; needs?: [string, number, number][] }
interface UnitDef { name: string; kind: string; head: string; children: (UnitDef | TeamDef)[] }

const ORG: UnitDef = {
  name: "Avro Corp", kind: "company", head: "Director", children: [
    { name: "Technology", kind: "division", head: "Director", children: [
      { name: "Cloud Platform", kind: "department", head: "Director", children: [
        { name: "Compute & Containers", team: [["Cloud Engineer", 5], ["Site Reliability Engineer", 2]], needs: [["Kubernetes", 3, 3]] },
        { name: "Infrastructure as Code", team: [["Cloud Engineer", 4]], weak: { Terraform: -1.6 } },
        { name: "Reliability", team: [["Site Reliability Engineer", 5]], needs: [["Observability", 4, 2]] },
      ] },
      { name: "Data & Analytics", kind: "department", head: "Director", children: [
        { name: "Data Platform", team: [["Data Engineer", 6]], weak: { Kafka: -1.3 }, needs: [["Kafka", 3, 3]] },
        { name: "Insights", team: [["Data Analyst", 5], ["Data Engineer", 1]] },
      ] },
      { name: "Application Engineering", kind: "department", head: "Director", children: [
        { name: "Customer Apps", team: [["Software Engineer", 7]], needs: [["TypeScript", 4, 2]] },
        { name: "Internal Tools", team: [["Software Engineer", 4], ["Data Engineer", 1]] },
      ] },
      { name: "Security", kind: "department", head: "Director", children: [
        { name: "Identity", team: [["Security Engineer", 4]] },
        { name: "Security Operations", team: [["Security Engineer", 4], ["Site Reliability Engineer", 1]], weak: { "Threat modelling": -1.5 }, needs: [["Threat modelling", 4, 2]] },
      ] },
    ] },
    { name: "Operations", kind: "division", head: "Director", children: [
      { name: "Service Operations", kind: "department", head: "Director", children: [
        { name: "Service Desk", team: [["Service Analyst", 7]] },
        { name: "Major Incidents", team: [["Service Analyst", 3], ["Site Reliability Engineer", 2]], needs: [["Incident management", 4, 2]] },
      ] },
      { name: "IT Service Management", kind: "department", head: "Director", children: [
        { name: "CMDB & Discovery", team: [["Platform Analyst", 5]], weak: { "Discovery/Patterns": -1.4 }, needs: [["Discovery/Patterns", 3, 3]] },
        { name: "Change & Release", team: [["Service Analyst", 4]] },
      ] },
    ] },
  ],
};

const FIRST = ["Aarav", "Priya", "Liam", "Olivia", "Noah", "Emma", "Arjun", "Ananya", "Lucas", "Mia", "Rohan", "Sofia", "Ethan", "Isha", "James", "Ava", "Karthik", "Meera", "Daniel", "Chloe", "Vikram", "Neha", "Samuel", "Grace", "Aditya", "Riya", "Oliver", "Zara", "Rahul", "Nina", "Jacob", "Leah", "Siddharth", "Aisha", "Henry", "Ella", "Manish", "Kavya", "Leo", "Maya"];
const LAST = ["Sharma", "Patel", "Smith", "Johnson", "Iyer", "Brown", "Reddy", "Williams", "Nair", "Taylor", "Gupta", "Anderson", "Menon", "Thomas", "Rao", "Clark", "Kulkarni", "Lewis", "Das", "Walker", "Joshi", "Hall", "Bose", "Young", "Pillai", "King", "Mehta", "Wright", "Chopra", "Green"];
const LOCATIONS = ["Bengaluru", "Pune", "London", "Boston"];

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

export async function seedDemo(db: DB): Promise<void> {
  const rnd = mulberry32(20261112);
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
    const leadership = name === "Engineering Manager" || name === "Director";
    for (const [path, target, mandatory = true] of r.skills) {
      roleSkills.push({ roleId: roleId.get(name)!, gradeId: null, skillId: sk(path), target, mandatory });
      if (leadership || !mandatory || target < 3) continue;
      roleSkills.push({ roleId: roleId.get(name)!, gradeId: gradeByName.get("Associate")!.id, skillId: sk(path), target: target - 1, mandatory });
      for (const g of ["Senior", "Lead", "Principal"]) {
        roleSkills.push({ roleId: roleId.get(name)!, gradeId: gradeByName.get(g)!.id, skillId: sk(path), target: Math.min(5, target + 1), mandatory });
      }
    }
  }

  // ---- organisation and people
  const units: (typeof s.orgUnit.$inferInsert & { id: string })[] = [];
  const employees: (typeof s.employee.$inferInsert & { id: string; roleName: string; ability: number; weak: Record<string, number> })[] = [];
  const unitReqs: (typeof s.unitRequirement.$inferInsert)[] = [];
  const usedNames = new Set<string>();
  const person = (unitId: string, roleName: string, gradeName: string, managerId: string | null, weak: Record<string, number> = {}) => {
    let name = "";
    do name = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`; while (usedNames.has(name));
    usedNames.add(name);
    const g = GRADES.find(([n]) => n === gradeName)!;
    const e = {
      id: crypto.randomUUID(),
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@avro.com`,
      title: roleName === "Director" ? "Director" : `${gradeName === "Engineer" ? "" : `${gradeName} `}${roleName}`.trim(),
      unitId,
      roleId: roleId.get(roleName)!,
      gradeId: gradeByName.get(gradeName)!.id,
      managerId,
      location: LOCATIONS[Math.floor(rnd() * LOCATIONS.length)],
      roleName,
      ability: gauss() * 0.6 + g[2] + 0.3,
      weak,
    };
    employees.push(e);
    return e;
  };
  const pickGrade = () => {
    const x = rnd();
    return x < 0.2 ? "Associate" : x < 0.6 ? "Engineer" : x < 0.85 ? "Senior" : x < 0.95 ? "Lead" : "Principal";
  };

  let sort = 0;
  const build = (def: UnitDef | TeamDef, parentId: string | null, parentHead: string | null) => {
    const id = crypto.randomUUID();
    const isTeam = "team" in def;
    const unit = { id, name: def.name, kind: isTeam ? "team" : (def as UnitDef).kind, parentId, managerId: null as string | null, sort: sort++ };
    units.push(unit);
    if (isTeam) {
      const t = def as TeamDef;
      const mgr = person(id, "Engineering Manager", "Lead", parentHead);
      unit.managerId = mgr.id;
      for (const [roleName, n] of t.team) for (let i = 0; i < n; i++) person(id, roleName, pickGrade(), mgr.id, t.weak ?? {});
      for (const [path, minLevel, headcount] of t.needs ?? []) unitReqs.push({ unitId: id, skillId: sk(path), minLevel, headcount, note: "Demo: team demand set by the manager" });
    } else {
      const u = def as UnitDef;
      const head = person(id, u.head, "Principal", parentHead);
      unit.managerId = head.id;
      for (const c of u.children) build(c, id, head.id);
    }
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
  const ratings: (typeof s.rating.$inferInsert)[] = [];
  const events: (typeof s.ratingEvent.$inferInsert)[] = [];
  const cycleOld = crypto.randomUUID();
  const cycleNow = crypto.randomUUID();
  for (const e of employees) {
    const req = roleReqs.get(e.roleId!) ?? new Map<string, number>();
    const extra = rateable.filter((x) => !req.has(x.id)).sort(() => rnd() - 0.5).slice(0, Math.floor(rnd() * 4));
    const targets: [string, number][] = [...req.entries(), ...extra.map((x) => [x.id, 1] as [string, number])];
    for (const [skillId, target] of targets) {
      if (rnd() < 0.07) continue; // never rated
      const weak = e.weak[pathOf.get(skillId) ?? ""] ?? 0;
      const truth = clamp(target + e.ability + weak + gauss() * 0.7 - (req.has(skillId) ? 0 : 1.2));
      const self = clamp(truth + (rnd() < 0.35 ? 1 : 0) - (rnd() < 0.07 ? 1 : 0));
      const stale = rnd() < 0.08;
      const validated = rnd() < 0.8;
      const selfAt = stale ? ago(400 + rnd() * 140) : ago(10 + rnd() * 200);
      const validatedAt = validated ? new Date(selfAt.getTime() + (2 + rnd() * 12) * DAY) : null;
      const interest = rnd() < 0.25;
      ratings.push({
        employeeId: e.id, skillId,
        selfLevel: self, selfAt, selfComment: "",
        validatedLevel: validated ? truth : null, validatedAt, validatedBy: validated ? e.managerId : null,
        evidence: validated && truth >= 4 ? "Demo: led the work on a recent project" : "",
        interest,
        status: validated ? "validated" : "submitted",
        cycleId: selfAt.getTime() > Date.parse("2026-10-01") ? cycleNow : cycleOld,
      });
      events.push({ employeeId: e.id, skillId, kind: "submit", level: self, actorId: null, at: selfAt });
      if (validated) events.push({ employeeId: e.id, skillId, kind: "validate", level: truth, actorId: null, at: validatedAt! });
    }
  }

  // ---- a couple of per-person targets, set by the manager with a reason
  const empTargets: (typeof s.employeeTarget.$inferInsert)[] = [];
  const cloudEngineers = employees.filter((e) => e.roleName === "Cloud Engineer").slice(0, 2);
  for (const e of cloudEngineers) empTargets.push({ employeeId: e.id, skillId: sk("Azure/AKS"), target: 3, reason: "Demo: joining the Azure migration next quarter", setBy: e.managerId });

  // ---- training plans for a handful of gaps
  const plans: (typeof s.trainingPlan.$inferInsert)[] = [];
  for (const r of ratings.filter((x) => x.validatedLevel != null && x.validatedLevel <= 2 && x.interest).slice(0, 12)) {
    const name = skills.find((x) => x.id === r.skillId)!.name;
    plans.push({
      employeeId: r.employeeId, skillId: r.skillId, targetLevel: Math.min(5, (r.validatedLevel ?? 0) + 1),
      title: `${name} course and a pairing assignment`, dueOn: new Date(now + (30 + rnd() * 90) * DAY).toISOString().slice(0, 10),
      status: rnd() < 0.4 ? "in_progress" : "planned",
    });
  }

  // ---- write
  await db.insert(s.skillCategory).values(categories);
  await insertChunks(skills, (c) => db.insert(s.skill).values(c));
  await db.insert(s.jobRole).values(roles);
  await db.insert(s.grade).values(grades);
  await insertChunks(roleSkills, (c) => db.insert(s.roleSkill).values(c));
  await insertChunks(units, (c) => db.insert(s.orgUnit).values(c));
  await insertChunks(employees.map(({ roleName: _r, ability: _a, weak: _w, ...e }) => e), (c) => db.insert(s.employee).values(c));
  await db.insert(s.unitRequirement).values(unitReqs);
  await db.insert(s.employeeTarget).values(empTargets);
  await db.insert(s.assessmentCycle).values([
    { id: cycleOld, name: "2026 H1 assessment", startsOn: "2026-04-01", dueOn: "2026-05-31", status: "closed" },
    { id: cycleNow, name: "2026 H2 assessment", startsOn: "2026-10-01", dueOn: "2026-12-15", status: "open" },
  ]);
  await insertChunks(ratings, (c) => db.insert(s.rating).values(c));
  await insertChunks(events, (c) => db.insert(s.ratingEvent).values(c));
  if (plans.length) await db.insert(s.trainingPlan).values(plans);

  // ---- twelve months of roll-ups, so the trend line has history (synthetic, improving)
  const ds: Dataset = {
    now,
    settings: DEFAULT_SETTINGS,
    units: units.map((u) => ({ id: u.id, name: u.name, kind: u.kind!, parentId: u.parentId ?? null, managerId: u.managerId ?? null })),
    employees: employees.map((e) => ({ id: e.id, name: e.name, email: e.email, title: e.title!, unitId: e.unitId!, roleId: e.roleId!, gradeId: e.gradeId!, managerId: e.managerId ?? null, active: true })),
    categories: categories.map((c) => ({ id: c.id!, name: c.name, sort: c.sort! })),
    skills: skills.map((x) => ({ id: x.id, name: x.name, categoryId: x.categoryId, parentId: x.parentId ?? null, status: "active" })),
    roles: roles.map((r) => ({ id: r.id, name: r.name })),
    grades: grades.map((g) => ({ id: g.id, name: g.name, rank: g.rank })),
    roleSkills: roleSkills.map((r) => ({ roleId: r.roleId, gradeId: r.gradeId ?? null, skillId: r.skillId, target: r.target, mandatory: r.mandatory ?? true })),
    unitRequirements: unitReqs.map((r) => ({ unitId: r.unitId, skillId: r.skillId, minLevel: r.minLevel, headcount: r.headcount ?? 1 })),
    employeeTargets: empTargets.map((t) => ({ employeeId: t.employeeId, skillId: t.skillId, target: t.target, reason: t.reason ?? "" })),
    ratings: ratings.map((r) => ({
      employeeId: r.employeeId, skillId: r.skillId, selfLevel: r.selfLevel ?? null, selfAt: r.selfAt ?? null,
      validatedLevel: r.validatedLevel ?? null, validatedAt: r.validatedAt ?? null, interest: !!r.interest, status: r.status!,
    })),
  };
  const current = createEngine(ds).snapshotRows();
  const snaps: (typeof s.snapshot.$inferInsert)[] = [];
  const thisMonth = new Date(now);
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - i, 1));
    const period = d.toISOString().slice(0, 7);
    for (const r of current) {
      const f = 1 - i * 0.028 - (i ? rnd() * 0.02 : 0);
      const fa = 1 - i * 0.045;
      snaps.push({
        unitId: r.unitId, period, required: r.required,
        met: Math.max(0, Math.round(r.met * f)), assessed: Math.max(0, Math.round(r.assessed * fa)),
        people: r.people, avgLevel: r.avgLevel == null ? null : Math.round((r.avgLevel - i * 0.04) * 100) / 100,
        takenAt: d,
      });
    }
  }
  await insertChunks(snaps, (c) => db.insert(s.snapshot).values(c));

  // ---- three sign-ins to see the app as each audience (demo only; password "demo")
  const ceo = employees.find((e) => e.roleName === "Director" && !e.managerId)!;
  const compute = units.find((u) => u.name === "Compute & Containers")!;
  const mgr = employees.find((e) => e.id === compute.managerId)!;
  const member = employees.find((e) => e.unitId === compute.id && e.id !== mgr.id)!;
  const hash = await hashPassword("demo");
  for (const [username, role, emp] of [["exec", "executive", ceo], ["manager", "manager", mgr], ["employee", "employee", member]] as const) {
    const id = crypto.randomUUID();
    const t = new Date();
    await db.insert(s.user).values({ id, name: emp.name, email: emp.email, emailVerified: true, username, displayUsername: username, role, mustChangePassword: false, createdAt: t, updatedAt: t });
    await db.insert(s.account).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash, createdAt: t, updatedAt: t });
    await db.update(s.employee).set({ userId: id }).where((await import("drizzle-orm")).eq(s.employee.id, emp.id));
  }
  await db.insert(s.auditLog).values({ actorName: "system", action: "seed", entity: "demo", detail: { employees: employees.length, ratings: ratings.length } });
  console.log(`seed: demo organisation with ${employees.length} people, ${skills.length} skills, ${ratings.length} ratings`);
}
