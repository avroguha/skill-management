// Hiring and training advice (src/lib/engine/advice.ts), on a small hand-built organisation:
//
//   Acme
//   ├─ Cloud team   ann (Engineer, Senior: EC2 4, SQL 3), bob (Engineer, Junior: EC2 2),
//   │               cat (Engineer, Junior: EC2 1, Kubernetes 2)
//   └─ Ops          fay (Engineer, Junior: EC2 4, SQL 3)  <- outside the team, already qualified
//
// Engineer: EC2 3 (Senior 4), Kubernetes 2 optional, Senior also SQL 3.
import test from "node:test";
import assert from "node:assert/strict";
import { createEngine, DEFAULT_SETTINGS, type Dataset, type Rating } from "../src/lib/engine/engine.ts";
import { hiringAdvice, trainingAdvice, roleProfile } from "../src/lib/engine/advice.ts";

const NOW = Date.parse("2026-11-15T00:00:00Z");
const ago = new Date(NOW - 20 * 86400e3);
const r = (employeeId: string, skillId: string, level: number, o: Partial<Rating> = {}): Rating => ({
  employeeId, skillId, selfLevel: level, selfAt: ago, validatedLevel: level, validatedAt: ago, interest: false, status: "validated", ...o,
});

function dataset(over: Partial<Dataset> = {}): Dataset {
  return {
    now: NOW,
    settings: { ...DEFAULT_SETTINGS },
    units: [
      { id: "acme", name: "Acme", kind: "company", parentId: null, managerId: "tia" },
      { id: "cloud", name: "Cloud team", kind: "team", parentId: "acme", managerId: "ann" },
      { id: "ops", name: "Ops", kind: "team", parentId: "acme", managerId: null },
    ],
    employees: [
      { id: "tia", name: "Tia", email: "", title: "CEO", unitId: "acme", roleId: null, gradeId: null, managerId: null, active: true },
      { id: "ann", name: "Ann", email: "", title: "", unitId: "cloud", roleId: "eng", gradeId: "sr", managerId: "tia", active: true },
      { id: "bob", name: "Bob", email: "", title: "", unitId: "cloud", roleId: "eng", gradeId: "jr", managerId: "ann", active: true },
      { id: "cat", name: "Cat", email: "", title: "", unitId: "cloud", roleId: "eng", gradeId: "jr", managerId: "ann", active: true },
      { id: "fay", name: "Fay", email: "", title: "", unitId: "ops", roleId: "eng", gradeId: "jr", managerId: "tia", active: true },
    ],
    categories: [{ id: "cloudc", name: "Cloud", sort: 1 }, { id: "datac", name: "Data", sort: 2 }],
    skills: [
      { id: "ec2", name: "EC2", categoryId: "cloudc", parentId: null, status: "active" },
      { id: "k8s", name: "Kubernetes", categoryId: "cloudc", parentId: null, status: "active" },
      { id: "s3", name: "S3", categoryId: "cloudc", parentId: null, status: "active" },
      { id: "sql", name: "SQL", categoryId: "datac", parentId: null, status: "active" },
    ],
    roles: [{ id: "eng", name: "Engineer" }, { id: "ana", name: "Analyst" }],
    grades: [{ id: "jr", name: "Junior", rank: 1 }, { id: "sr", name: "Senior", rank: 2 }],
    roleSkills: [
      { roleId: "eng", gradeId: null, skillId: "ec2", target: 3, mandatory: true },
      { roleId: "eng", gradeId: "sr", skillId: "ec2", target: 4, mandatory: true },
      { roleId: "eng", gradeId: null, skillId: "k8s", target: 2, mandatory: false },
      { roleId: "eng", gradeId: "sr", skillId: "sql", target: 3, mandatory: true },
      { roleId: "ana", gradeId: null, skillId: "sql", target: 3, mandatory: true },
    ],
    unitRequirements: [],
    employeeTargets: [],
    ratings: [
      r("ann", "ec2", 4), r("ann", "sql", 3),
      r("bob", "ec2", 2),
      r("cat", "ec2", 1), r("cat", "k8s", 2),
      r("fay", "ec2", 4), r("fay", "sql", 3),
    ],
    ...over,
  };
}

const groups = (a: ReturnType<typeof hiringAdvice>) => Object.fromEntries(a.skills.map((s) => [s.skillId, `${s.group} ${s.level}`]));

test("a role's profile: the grade-specific target wins over the all-grades one", () => {
  const e = createEngine(dataset());
  assert.deepEqual(Object.fromEntries([...roleProfile(e, "eng", "sr")].map(([k, v]) => [k, v.level])), { ec2: 4, k8s: 2, sql: 3 });
  assert.deepEqual(Object.fromEntries([...roleProfile(e, "eng", null)].map(([k, v]) => [k, v.level])), { ec2: 3, k8s: 2 });
});

test("hiring: what the team is short of is to bring, what two people hold can be coached, optional is nice to have", () => {
  const e = createEngine(dataset());
  const jr = hiringAdvice(e, { unitId: "cloud", roleId: "eng", gradeId: "jr", skills: [] });
  // only ann holds EC2 at 3: one holder, so the hire must bring it
  assert.deepEqual(groups(jr), { ec2: "bring 3", k8s: "nice 2" });
  assert.match(jr.skills[0].why, /Only one person/);

  // bob reaches 3: two holders, so a junior can be coached
  const e2 = createEngine(dataset({ ratings: [...dataset().ratings.filter((x) => !(x.employeeId === "bob" && x.skillId === "ec2")), r("bob", "ec2", 3)] }));
  assert.deepEqual(groups(hiringAdvice(e2, { unitId: "cloud", roleId: "eng", gradeId: "jr", skills: [] })), { ec2: "coach 3", k8s: "nice 2" });

  const sr = hiringAdvice(e, { unitId: "cloud", roleId: "eng", gradeId: "sr", skills: [] });
  assert.deepEqual(groups(sr), { ec2: "bring 4", sql: "bring 3", k8s: "nice 2" });
  assert.equal(sr.experienced, true, "a level 4 skill to bring asks for an experienced hire");
  assert.deepEqual(sr.focus, [{ categoryId: "cloudc", count: 1 }, { categoryId: "datac", count: 1 }]);
});

test("hiring: a short team need makes even an optional skill one to bring; one the profile lacks is listed apart", () => {
  const e = createEngine(dataset({ unitRequirements: [
    { unitId: "cloud", skillId: "k8s", minLevel: 2, headcount: 2 },
    { unitId: "cloud", skillId: "s3", minLevel: 3, headcount: 1 },
  ] }));
  const a = hiringAdvice(e, { unitId: "cloud", roleId: "eng", gradeId: "jr", skills: [] });
  assert.equal(groups(a).k8s, "bring 2");
  assert.match(a.skills.find((s) => s.skillId === "k8s")!.why, /needs 2 at level 2 and has 1/);
  assert.deepEqual(a.alsoCloses, [{ skillId: "s3", unitId: "cloud", level: 3, short: 1, nobody: true }]);
  // added by the manager: then it is part of the profile, to bring
  const b = hiringAdvice(e, { unitId: "cloud", roleId: "eng", gradeId: "jr", skills: [{ skillId: "s3", level: 3 }] });
  assert.equal(groups(b).s3, "bring 3");
  assert.equal(b.skills.find((s) => s.skillId === "s3")!.source, "added");
  assert.deepEqual(b.alsoCloses, []);
});

test("hiring and training for a unit with teams below it count the short needs of those teams", () => {
  const e = createEngine(dataset({ unitRequirements: [{ unitId: "cloud", skillId: "k8s", minLevel: 3, headcount: 1 }] }));
  const a = hiringAdvice(e, { unitId: "acme", roleId: "ana", gradeId: null, skills: [] });
  assert.deepEqual(a.alsoCloses, [{ skillId: "k8s", unitId: "cloud", level: 3, short: 1, nobody: true }]);
  const b = hiringAdvice(e, { unitId: "acme", roleId: "eng", gradeId: null, skills: [{ skillId: "k8s", level: 3 }] });
  assert.match(b.skills.find((s) => s.skillId === "k8s")!.why, /^Cloud team needs 1 at level 3 and nobody has it/);
  const k8s = trainingAdvice(e, e.membersOf("acme"), "acme").find((i) => i.skillId === "k8s")!;
  assert.deepEqual(k8s.learners.map((l) => l.employeeId), ["cat"], "one level below, in the team with the need");
  assert.match(k8s.why, /Cloud team needs 1 at level 3 and has 0/);
});

test("hiring: no role chosen - the role and grade that cover most of what is asked are suggested", () => {
  const e = createEngine(dataset({ unitRequirements: [{ unitId: "cloud", skillId: "k8s", minLevel: 2, headcount: 2 }] }));
  const a = hiringAdvice(e, { unitId: "cloud", roleId: null, gradeId: null, skills: [{ skillId: "sql", level: 3 }] });
  // Analyst covers SQL only; Engineer Senior covers SQL and Kubernetes
  assert.deepEqual(a.suggestedRole, { roleId: "eng", gradeId: "sr", covers: 2, of: 2 });
  assert.equal(a.roleId, "eng");
  assert.equal(groups(a).sql, "bring 3");
  // nothing asked and no role: nothing to go on
  const none = hiringAdvice(createEngine(dataset()), { unitId: "cloud", roleId: null, gradeId: null, skills: [] });
  assert.equal(none.suggestedRole, null);
  assert.deepEqual(none.skills, []);
});

test("hiring: a role without a grade suggests the grade that closes more of the team's gaps", () => {
  const e = createEngine(dataset());
  const a = hiringAdvice(e, { unitId: "cloud", roleId: "eng", gradeId: null, skills: [] });
  assert.deepEqual(a.suggestedGrade, { gradeId: "sr", closes: 2 });
});

test("hiring: people outside the team who already hold the must-haves come first", () => {
  const e = createEngine(dataset());
  const pool = [...e.empById.values()];
  const a = hiringAdvice(e, { unitId: "cloud", roleId: "eng", gradeId: "sr", skills: [] }, pool);
  assert.deepEqual(a.candidates, [{ employeeId: "fay", matched: 2, of: 2, interested: 0 }], "team members and the top person are never candidates");
});

test("training: people below their target, who can coach them, and what is already booked", () => {
  const e = createEngine(dataset());
  const team = e.membersOf("cloud");
  const ideas = trainingAdvice(e, team, "cloud");
  const ec2 = ideas.find((i) => i.skillId === "ec2")!;
  assert.deepEqual(ec2.learners.map((l) => [l.employeeId, l.level, l.target]), [["bob", 2, 3], ["cat", 1, 3]]);
  assert.deepEqual(ec2.mentors, ["ann"]);
  assert.equal(ec2.how, "coaching");
  assert.equal(ec2.weight, 2 * 1 + 2 * 2, "a mandatory gap counts twice its size");
  assert.match(ec2.why, /2 below their target \(required\)/);
  // an unassessed required skill is not a training idea (k8s for ann and bob is optional and unrated)
  assert.equal(ideas.some((i) => i.skillId === "k8s"), false);

  const booked = trainingAdvice(e, team, "cloud", [{ employeeId: "cat", skillId: "ec2" }]).find((i) => i.skillId === "ec2")!;
  assert.equal(booked.weight, 2);
  assert.equal(booked.learners.at(-1)!.booked, true, "booked people go last");
  assert.match(booked.why, /1 already booked/);
  // everyone booked: nothing left to suggest
  assert.equal(trainingAdvice(e, team, "cloud", [{ employeeId: "cat", skillId: "ec2" }, { employeeId: "bob", skillId: "ec2" }]).some((i) => i.skillId === "ec2"), false);
});

test("training: a short team need adds the people one level below it, and flags it when nobody is close", () => {
  const e = createEngine(dataset({ unitRequirements: [
    { unitId: "cloud", skillId: "k8s", minLevel: 3, headcount: 2 },
    { unitId: "cloud", skillId: "s3", minLevel: 3, headcount: 1 },
  ] }));
  const ideas = trainingAdvice(e, e.membersOf("cloud"), "cloud");
  const k8s = ideas.find((i) => i.skillId === "k8s")!;
  assert.deepEqual(k8s.learners.map((l) => [l.employeeId, l.reason]), [["cat", "team"]], "cat is at 2, one below the need");
  assert.equal(k8s.slow, false);
  assert.equal(k8s.weight, 2 * 3 + 3, "two missing, nobody holds it");
  const s3 = ideas.find((i) => i.skillId === "s3")!;
  assert.deepEqual(s3.learners, []);
  assert.equal(s3.slow, true, "nobody is within one level: hiring may be faster");
  assert.equal(s3.how, "external");
  // three learners or more: a course
  const many = createEngine(dataset({ roleSkills: [...dataset().roleSkills, { roleId: "eng", gradeId: null, skillId: "s3", target: 3, mandatory: true }],
    ratings: [...dataset().ratings, r("ann", "s3", 1), r("bob", "s3", 2), r("cat", "s3", 1)] }));
  const s3b = trainingAdvice(many, many.membersOf("cloud"), "cloud").find((i) => i.skillId === "s3")!;
  assert.equal(s3b.how, "course");
  assert.equal(s3b.learners.length, 3);
});
