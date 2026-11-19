// The next step for each kind of person, on a small organisation:
//
//   tia (the top)
//   └─ ann (manager)
//       ├─ bob   has rated nothing
//       └─ cat   sent both ratings, waiting for ann
//   fay (no manager, everything confirmed)
import test from "node:test";
import assert from "node:assert/strict";
import { createEngine, DEFAULT_SETTINGS, type Dataset, type Rating } from "../src/lib/engine/engine.ts";
import { nextSteps } from "../src/lib/next-steps.ts";

const NOW = Date.parse("2026-11-18T00:00:00Z");
const r = (employeeId: string, skillId: string, status: Rating["status"], level = 3): Rating => ({
  employeeId, skillId, selfLevel: level, selfAt: new Date(NOW - 5 * 86400e3),
  validatedLevel: status === "validated" ? level : null, validatedAt: status === "validated" ? new Date(NOW - 86400e3) : null,
  interest: false, status,
});
const emp = (id: string, managerId: string | null) =>
  ({ id, name: id[0].toUpperCase() + id.slice(1), email: `${id}@x`, title: "", roleId: "eng", gradeId: null, managerId, active: true, teamName: "" });

function engine(over: Partial<Dataset> = {}) {
  return createEngine({
    now: NOW,
    settings: { ...DEFAULT_SETTINGS },
    employees: [emp("tia", null), emp("ann", "tia"), emp("bob", "ann"), emp("cat", "ann"), emp("fay", null)],
    categories: [{ id: "c", name: "Cloud", sort: 1 }],
    skills: [
      { id: "ec2", name: "EC2", categoryId: "c", parentId: null, status: "active" },
      { id: "k8s", name: "Kubernetes", categoryId: "c", parentId: null, status: "active" },
    ],
    roles: [{ id: "eng", name: "Engineer" }],
    grades: [],
    roleSkills: [
      { roleId: "eng", gradeId: null, skillId: "ec2", target: 3, mandatory: true },
      { roleId: "eng", gradeId: null, skillId: "k8s", target: 2, mandatory: true },
    ],
    teamNeeds: [],
    ratings: [r("cat", "ec2", "submitted"), r("cat", "k8s", "submitted"), r("fay", "ec2", "validated"), r("fay", "k8s", "validated")],
    ...over,
  });
}
const as = (id: string | null, o: { role?: "admin" | "leader" | "manager" | "employee"; allPeople?: boolean } = {}) => ({
  role: o.role ?? "employee", allPeople: o.allPeople ?? false, homeScope: null,
  employee: id ? { id } : null, isAdmin: o.role === "admin",
});
const keys = (steps: { key: string }[]) => steps.map((s) => s.key);

test("someone who has rated nothing is told to rate their skills", () => {
  const [first] = nextSteps(engine(), as("bob"));
  assert.equal(first.key, "rate");
  assert.equal(first.kind, "do");
  assert.equal(first.href, "/my-skills");
  assert.match(first.detail, /2 skills/);
});

test("someone waiting on their manager has nothing to do, and is told so", () => {
  const steps = nextSteps(engine(), as("cat"));
  assert.deepEqual(keys(steps), ["waiting"]);
  assert.equal(steps[0].kind, "info");
});

test("someone with everything confirmed is up to date", () => {
  assert.deepEqual(keys(nextSteps(engine(), as("fay"))), ["done"]);
});

test("a manager confirms first, then reminds who has not started, then says what the team needs", () => {
  const steps = nextSteps(engine(), as("ann", { role: "manager" }));
  assert.deepEqual(keys(steps), ["confirm", "remind", "needs"]);
  assert.match(steps[0].title, /Confirm 2 ratings from 1 person/);
  assert.match(steps[1].detail, /Bob/);
});

test("a manager with a team need that nobody meets is pointed at it", () => {
  const e = engine({ teamNeeds: [{ managerId: "ann", skillId: "k8s", minLevel: 4, headcount: 2 }] });
  const steps = nextSteps(e, as("ann", { role: "manager" }));
  assert.ok(keys(steps).includes("short"));
  assert.ok(!keys(steps).includes("needs"));
});

test("a manager whose people have no role is asked to choose one for the team", () => {
  const noRole = engine({ employees: [emp("tia", null), emp("ann", "tia"), { ...emp("bob", "ann"), roleId: null }, { ...emp("cat", "ann"), roleId: null }] });
  const steps = nextSteps(noRole, as("ann", { role: "manager" }));
  const step = steps.find((s) => s.key === "team-role")!;
  assert.equal(step.title, "Choose a role for your team");
  assert.ok(!keys(nextSteps(engine(), as("ann", { role: "manager" }))).includes("team-role"), "not when everyone has one");
});

test("a leader sees how far the organisation has got", () => {
  const steps = nextSteps(engine(), as(null, { role: "leader", allPeople: true }));
  assert.equal(steps[0].key, "org-done");
});

test("an administrator is shown what the app still needs, and nothing once it is set up", () => {
  const e = engine();
  const admin = as(null, { role: "admin", allPeople: true });
  const todo = nextSteps(e, admin, { ssoActive: false, emailOn: false, draftSkills: 2, skills: 10 });
  assert.deepEqual(keys(todo), ["drafts", "sso", "email"]);
  const empty = nextSteps(createEngine({ ...emptyDataset() }), admin, { ssoActive: true, emailOn: true, draftSkills: 0, skills: 0 });
  assert.deepEqual(keys(empty), ["people", "skills"]);
  const done = nextSteps(e, admin, { ssoActive: true, emailOn: true, draftSkills: 0, skills: 10 });
  assert.deepEqual(keys(done), ["explore"]);
  assert.equal(done[0].kind, "info");
});

test("people without a role are an administrator's step", () => {
  const e = engine({ employees: [emp("tia", null), { ...emp("bob", "tia"), roleId: null }] });
  const steps = nextSteps(e, as(null, { role: "admin", allPeople: true }), { ssoActive: true, emailOn: true, draftSkills: 0, skills: 10 });
  assert.deepEqual(keys(steps), ["roles"]);
});

function emptyDataset(): Dataset {
  return { now: NOW, settings: { ...DEFAULT_SETTINGS }, employees: [], categories: [], skills: [], roles: [], grades: [], roleSkills: [], teamNeeds: [], ratings: [] };
}
