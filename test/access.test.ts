// Who may see what (src/lib/access.ts), v2: managers come from the reporting lines.
//
//   tia (top)
//   ├─ ann → bob, cat
//   └─ oli → fay, gus
import test from "node:test";
import assert from "node:assert/strict";
import { createEngine, ALL, DEFAULT_SETTINGS, type Dataset } from "../src/lib/engine/engine.ts";
import { buildAccess, maySeeScope, asRole } from "../src/lib/access.ts";

function dataset(): Dataset {
  const emp = (id: string, managerId: string | null) => ({ id, name: id, email: `${id}@x`, title: "", roleId: null, gradeId: null, managerId, active: true });
  return {
    now: Date.parse("2026-11-18T00:00:00Z"), settings: { ...DEFAULT_SETTINGS },
    employees: [emp("tia", null), emp("ann", "tia"), emp("bob", "ann"), emp("cat", "ann"), emp("oli", "tia"), emp("fay", "oli"), emp("gus", "oli")],
    categories: [], skills: [], roles: [], grades: [], roleSkills: [], teamNeeds: [], ratings: [],
  };
}
const engine = createEngine(dataset());
const who = (id: string) => engine.empById.get(id)!;

test("an employee sees themselves only and confirms nobody", () => {
  const a = buildAccess(engine, "employee", who("bob"));
  assert.equal(a.role, "employee");
  assert.deepEqual([...a.employeeIds], ["bob"]);
  assert.equal(a.reportIds.size, 0);
  assert.equal(a.canSeeTeams, false);
  assert.equal(a.homeScope, null);
});

test("someone with people reporting to them is a manager by themselves: they see everyone below and confirm their direct reports", () => {
  const a = buildAccess(engine, "employee", who("tia"));
  assert.equal(a.role, "manager");
  assert.equal(a.employeeIds.size, 7);
  assert.deepEqual([...a.reportIds].sort(), ["ann", "oli"], "only the direct reports: ann confirms bob and cat");
  assert.deepEqual([...a.manageIds].sort(), ["ann", "oli", "tia"], "they may set the needs of their own team and every team below");
  assert.equal(a.homeScope, "tia");
  const ann = buildAccess(engine, "employee", who("ann"));
  assert.deepEqual([...ann.employeeIds].sort(), ["ann", "bob", "cat"]);
  assert.equal(maySeeScope(ann, "oli"), false, "a peer's team is not theirs");
  assert.equal(maySeeScope(ann, "ann"), true);
  assert.equal(maySeeScope(ann, ALL), false);
});

test("a leader reads the whole organisation but confirms only their own people", () => {
  const a = buildAccess(engine, "leader", who("bob"));
  assert.equal(a.allPeople, true);
  assert.equal(a.homeScope, ALL);
  assert.equal(a.reportIds.size, 0);
  assert.equal(a.manageIds.size, 0, "reading everything is not managing it");
  assert.equal(maySeeScope(a, "oli"), true);
});

test("an administrator may do everything; nobody confirms their own ratings except an administrator stepping in", () => {
  const a = buildAccess(engine, "admin", null);
  assert.equal(a.allPeople, true);
  assert.equal(a.reportIds.size, 7);
  assert.deepEqual([...a.manageIds].sort(), ["ann", "oli", "tia"]);
});

test("v1 roles map onto v2's: executive and operator become leader", () => {
  assert.equal(asRole("executive"), "leader");
  assert.equal(asRole("operator"), "leader");
  assert.equal(asRole("admin"), "admin");
  assert.equal(asRole(null), "employee");
});
