// Who may see what (src/lib/access.ts), above all the operator role:
//
//   Acme (tia)
//   ├─ Platform (ann)    ann → bob, cat
//   │   └─ Cloud team    bob, cat
//   └─ Ops (oli)         oli → fay, gus
import test from "node:test";
import assert from "node:assert/strict";
import { createEngine, DEFAULT_SETTINGS, type Dataset } from "../src/lib/engine/engine.ts";
import { buildAccess, mayChart, asRole } from "../src/lib/access.ts";

function dataset(): Dataset {
  const emp = (id: string, unitId: string, managerId: string | null) =>
    ({ id, name: id, email: `${id}@x`, title: "", unitId, roleId: null, gradeId: null, managerId, active: true });
  return {
    now: Date.parse("2026-11-15T00:00:00Z"), settings: { ...DEFAULT_SETTINGS },
    units: [
      { id: "acme", name: "Acme", kind: "company", parentId: null, managerId: "tia" },
      { id: "plat", name: "Platform", kind: "department", parentId: "acme", managerId: "ann" },
      { id: "cloud", name: "Cloud team", kind: "team", parentId: "plat", managerId: null },
      { id: "ops", name: "Ops", kind: "team", parentId: "acme", managerId: "oli" },
    ],
    employees: [
      emp("tia", "acme", null), emp("ann", "plat", "tia"), emp("bob", "cloud", "ann"), emp("cat", "cloud", "ann"),
      emp("oli", "ops", "tia"), emp("fay", "ops", "oli"), emp("gus", "ops", "oli"),
    ],
    categories: [], skills: [], roles: [], grades: [], roleSkills: [], unitRequirements: [], employeeTargets: [], ratings: [],
  };
}

const e = createEngine(dataset());
const who = (id: string) => e.empById.get(id)!;
const sorted = (s: Set<string>) => [...s].sort();

test("an operator who leads a team: their own hierarchy, with the rights of its manager", () => {
  const a = buildAccess(e, "operator", who("ann"), []);
  assert.equal(a.role, "operator", "the operator role is kept, not turned into manager");
  assert.equal(a.canBuildCharts, true);
  assert.equal(a.canSeeOrg, true);
  assert.deepEqual(sorted(a.employeeIds), ["ann", "bob", "cat"]);
  assert.deepEqual(sorted(a.reportIds), ["bob", "cat"], "they still validate their own reports");
  assert.deepEqual(sorted(a.manageUnitIds), ["cloud", "plat"], "and edit their own teams' needs");
  assert.deepEqual(a.chartScopes, [{ kind: "leader", id: "ann" }]);
});

test("an operator given another leader and a unit reads them, read-only", () => {
  const a = buildAccess(e, "operator", who("ann"), [{ kind: "leader", id: "oli" }, { kind: "unit", id: "cloud" }]);
  assert.deepEqual(sorted(a.employeeIds), ["ann", "bob", "cat", "fay", "gus", "oli"]);
  assert.deepEqual(sorted(a.unitIds), ["cloud", "ops", "plat"]);
  assert.deepEqual(sorted(a.reportIds), ["bob", "cat"], "nothing to validate in an assigned hierarchy");
  assert.equal(a.manageUnitIds.has("ops"), false, "no editing in an assigned hierarchy");
  assert.deepEqual(a.chartScopes, [{ kind: "leader", id: "ann" }, { kind: "leader", id: "oli" }, { kind: "unit", id: "cloud" }]);
  assert.equal(mayChart(a, { kind: "leader", id: "oli" }), true);
  assert.equal(mayChart(a, { kind: "unit", id: "ops" }), true, "a unit inside a hierarchy they read");
  assert.equal(mayChart(a, { kind: "unit", id: "acme" }), false, "not the company above it");
  assert.equal(mayChart(a, { kind: "leader", id: "tia" }), false);
});

test("an operator who leads nobody sees only what they were given; scopes that no longer exist are ignored", () => {
  const a = buildAccess(e, "operator", who("fay"), [{ kind: "unit", id: "plat" }, { kind: "unit", id: "gone" }, { kind: "leader", id: "nobody" }]);
  assert.deepEqual(sorted(a.employeeIds), ["ann", "bob", "cat", "fay"]);
  assert.deepEqual(a.chartScopes, [{ kind: "unit", id: "plat" }]);
  assert.equal(a.homeUnitId, "plat", "they land on what they were given");
  assert.equal(a.reportIds.size, 0);
});

test("scopes count only for operators; executives and admins chart anything; managers and employees chart nothing", () => {
  const m = buildAccess(e, "employee", who("ann"), [{ kind: "leader", id: "oli" }]);
  assert.equal(m.role, "manager");
  assert.equal(m.employeeIds.has("oli"), false, "a scope given to a non-operator does nothing");
  assert.equal(m.canBuildCharts, false);
  assert.equal(mayChart(m, { kind: "leader", id: "ann" }), false);
  const x = buildAccess(e, "executive", who("tia"), []);
  assert.equal(x.chartScopes, "all");
  assert.equal(mayChart(x, { kind: "unit", id: "ops" }), true);
  assert.equal(buildAccess(e, "employee", who("bob"), []).canBuildCharts, false);
  assert.equal(asRole("operator"), "operator");
  assert.equal(asRole("superuser"), "employee");
});
