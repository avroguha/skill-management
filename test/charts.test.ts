// Charts an operator builds (src/lib/charts/query.ts), on a small organisation:
//
//   Acme (tia)
//   ├─ Cloud team (ann)  ann (Engineer, Senior), bob (Engineer, Junior), cat (Engineer, Junior)
//   └─ Data team         dan (Analyst), eve (Analyst)        dan → eve; ann → bob, cat, dan
//
// Engineer: EC2 3 (Senior 4), Kubernetes 2 optional. Analyst: SQL 3.
import test from "node:test";
import assert from "node:assert/strict";
import { createEngine, DEFAULT_SETTINGS, type Dataset, type Rating } from "../src/lib/engine/engine.ts";
import { runChart, checkSpec, DEFAULT_SPEC, type ChartSpec } from "../src/lib/charts/query.ts";

const NOW = Date.parse("2026-11-15T00:00:00Z");
const ago = new Date(NOW - 20 * 86400e3);
const r = (employeeId: string, skillId: string, level: number | null, self: number | null = level, o: Partial<Rating> = {}): Rating => ({
  employeeId, skillId, selfLevel: self, selfAt: self == null ? null : ago, validatedLevel: level, validatedAt: level == null ? null : ago,
  interest: false, status: level == null ? "submitted" : "validated", ...o,
});

const ds: Dataset = {
  now: NOW, settings: { ...DEFAULT_SETTINGS },
  units: [
    { id: "acme", name: "Acme", kind: "company", parentId: null, managerId: "tia" },
    { id: "cloud", name: "Cloud team", kind: "team", parentId: "acme", managerId: "ann", sort: 1 },
    { id: "data", name: "Data team", kind: "team", parentId: "acme", managerId: null, sort: 2 },
  ],
  employees: [
    { id: "tia", name: "Tia", email: "", title: "", unitId: "acme", roleId: null, gradeId: null, managerId: null, active: true },
    { id: "ann", name: "Ann", email: "", title: "", unitId: "cloud", roleId: "eng", gradeId: "sr", managerId: "tia", active: true },
    { id: "bob", name: "Bob", email: "", title: "", unitId: "cloud", roleId: "eng", gradeId: "jr", managerId: "ann", active: true },
    { id: "cat", name: "Cat", email: "", title: "", unitId: "cloud", roleId: "eng", gradeId: "jr", managerId: "ann", active: true },
    { id: "dan", name: "Dan", email: "", title: "", unitId: "data", roleId: "ana", gradeId: null, managerId: "ann", active: true },
    { id: "eve", name: "Eve", email: "", title: "", unitId: "data", roleId: "ana", gradeId: null, managerId: "dan", active: true },
  ],
  categories: [{ id: "cloudc", name: "Cloud", sort: 1 }, { id: "datac", name: "Data", sort: 2 }],
  skills: [
    { id: "ec2", name: "EC2", categoryId: "cloudc", parentId: null, status: "active" },
    { id: "k8s", name: "Kubernetes", categoryId: "cloudc", parentId: null, status: "active" },
    { id: "sql", name: "SQL", categoryId: "datac", parentId: null, status: "active" },
  ],
  roles: [{ id: "eng", name: "Engineer" }, { id: "ana", name: "Analyst" }],
  grades: [{ id: "jr", name: "Junior", rank: 1 }, { id: "sr", name: "Senior", rank: 2 }],
  roleSkills: [
    { roleId: "eng", gradeId: null, skillId: "ec2", target: 3, mandatory: true },
    { roleId: "eng", gradeId: "sr", skillId: "ec2", target: 4, mandatory: true },
    { roleId: "eng", gradeId: null, skillId: "k8s", target: 2, mandatory: false },
    { roleId: "ana", gradeId: null, skillId: "sql", target: 3, mandatory: true },
  ],
  unitRequirements: [], employeeTargets: [],
  ratings: [
    r("ann", "ec2", 4), r("ann", "k8s", 3), r("ann", "sql", 3, 3, { interest: true }),
    r("bob", "ec2", 2, 3), r("bob", "k8s", 2),
    r("cat", "ec2", 1),
    r("dan", "sql", 4),
    r("eve", "sql", null, 2, { interest: true }),
  ],
};
const e = createEngine(ds);
const spec = (o: Partial<ChartSpec>): ChartSpec => ({ ...DEFAULT_SPEC, scope: { kind: "unit", id: "acme" }, ...o });
const values = (res: ReturnType<typeof runChart>, key = "value") => Object.fromEntries(res.rows.map((row) => [row.label, row[key]]));

test("on target % by team adds up to the whole organisation, pair by pair", () => {
  const res = runChart(e, spec({ measure: "on_target", groupBy: "team" }));
  // Cloud: ann ec2 4/4 met, k8s 3/2 met; bob ec2 2/3, k8s 2/2 met; cat ec2 1/3, k8s - -> 3 of 6
  // Data: dan sql 4/3 met; eve sql unassessed -> 1 of 2
  assert.deepEqual(values(res), { "Cloud team": 50, "Data team": 50 });
  assert.equal(res.total, 50, "4 of 8 pairs");
  assert.equal(res.people, 6);
  assert.deepEqual(res.rows.map((x) => x.label), ["Cloud team", "Data team"], "teams keep the organisation's order");
});

test("not assessed is never 0: assessed % and below target count only what is rated", () => {
  assert.deepEqual(values(runChart(e, spec({ measure: "assessed", groupBy: "category" }))), { Cloud: 83, Data: 50 });
  assert.deepEqual(values(runChart(e, spec({ measure: "below_target", groupBy: "person" }))), { Bob: 1, Cat: 1 });
  assert.deepEqual(values(runChart(e, spec({ measure: "critical", groupBy: "skill" }))), { EC2: 1 }, "cat at 1 where 3 is needed");
});

test("a level distribution counts ratings per level, never an average level", () => {
  const res = runChart(e, spec({ measure: "ratings", groupBy: "category", splitBy: "level", type: "stacked" }), [], ["None", "Awareness", "Working", "Proficient", "Advanced"]);
  assert.deepEqual(res.series.map((s) => s.label), ["1 Awareness", "2 Working", "3 Proficient", "4 Advanced"]);
  const cloud = res.rows.find((x) => x.label === "Cloud")!;
  assert.deepEqual([cloud["1"], cloud["2"], cloud["3"], cloud["4"]], [1, 2, 1, 1]);
  // self-assessed levels instead: bob's EC2 counts at 3
  const self = runChart(createEngine(ds, { basis: "self" }), spec({ measure: "ratings", groupBy: "level", basis: "self", filters: { skillId: "ec2" } }));
  assert.deepEqual(values(self), { "1": 1, "3": 1, "4": 1 });
});

test("people at a level count each person once per bar; want to learn reads the interest flag", () => {
  assert.deepEqual(values(runChart(e, spec({ measure: "holders", groupBy: "category", minLevel: 3 }))), { Cloud: 1, Data: 2 },
    "ann holds two cloud skills at 3+, counted once");
  assert.deepEqual(values(runChart(e, spec({ measure: "wanted", groupBy: "skill" }))), { SQL: 2 });
});

test("people by grade and role, with filters", () => {
  assert.deepEqual(values(runChart(e, spec({ measure: "people", groupBy: "grade" }))), { Junior: 2, Senior: 1, "No grade": 3 });
  const r2 = runChart(e, spec({ measure: "people", groupBy: "role", filters: { roleId: "eng" } }));
  assert.deepEqual(values(r2), { Engineer: 3 });
  assert.equal(r2.total, 3);
});

test("a leader's hierarchy groups by their direct reports' teams", () => {
  const res = runChart(e, spec({ scope: { kind: "leader", id: "ann" }, measure: "people", groupBy: "team" }));
  assert.equal(res.scopeLabel, "Ann's organisation");
  assert.deepEqual(values(res), { Ann: 1, "Dan's team": 2, "Direct reports": 2 });
});

test("months come from the monthly snapshots of the unit; combinations that make no sense are refused", () => {
  const snaps = [
    { unitId: "acme", period: "2026-10", required: 10, met: 4, assessed: 8, people: 6 },
    { unitId: "acme", period: "2026-09", required: 10, met: 3, assessed: 7, people: 6 },
    { unitId: "cloud", period: "2026-10", required: 6, met: 3, assessed: 5, people: 3 },
  ];
  const res = runChart(e, spec({ measure: "on_target", groupBy: "month", type: "line" }), snaps);
  assert.deepEqual(res.rows.map((x) => [x.key, x.label, x.value]), [["2026-09", "Sept 2026", 30], ["2026-10", "Oct 2026", 40]]);
  assert.equal(res.total, 40);
  const led = runChart(e, spec({ scope: { kind: "leader", id: "ann" }, measure: "on_target", groupBy: "month" }), snaps);
  assert.deepEqual(led.rows.map((x) => x.key), ["2026-10"], "a leader's history is the unit they run");

  assert.match(checkSpec({ measure: "people", groupBy: "skill", splitBy: "none", type: "bar" })!, /team, role, grade or person/);
  assert.match(checkSpec({ measure: "on_target", groupBy: "level", splitBy: "none", type: "bar" })!, /Levels go with ratings/);
  assert.match(checkSpec({ measure: "on_target", groupBy: "team", splitBy: "none", type: "heatmap" })!, /needs something to split by/);
  assert.match(checkSpec({ measure: "on_target", groupBy: "team", splitBy: "team", type: "bar" })!, /other than/);
  assert.match(checkSpec({ measure: "ratings", groupBy: "month", splitBy: "none", type: "line" })!, /Over months/);
  assert.equal(checkSpec({ measure: "on_target", groupBy: "team", splitBy: "category", type: "heatmap" }), null);
  assert.deepEqual(runChart(e, spec({ measure: "people", groupBy: "skill" })).rows, [], "a refused chart draws nothing");
});

test("the biggest bars are kept, and the chart says what was left out", () => {
  const res = runChart(e, spec({ measure: "ratings", groupBy: "person", limit: 2 }));
  assert.deepEqual(res.rows.map((x) => x.label), ["Ann", "Bob"]);
  assert.match(res.notes.join(" "), /The 2 largest of 4/, "eve has no validated rating: no bar");
});
