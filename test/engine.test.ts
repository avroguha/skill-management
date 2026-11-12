// The engine's rules, one test each. A small hand-built organisation:
//
//   Acme (company)
//   ├─ Platform (department)
//   │   ├─ Cloud team      ann (Engineer, Senior), bob (Engineer, Junior), cat (Engineer, Junior)
//   │   └─ Data team       dan (Engineer, Junior), eve (Analyst), ivy (Analyst)
//   └─ Ops (team)          fay (Engineer, Junior)  <- spare AWS capacity
import test from "node:test";
import assert from "node:assert/strict";
import { createEngine, gapCategory, DEFAULT_SETTINGS, type Dataset, type Rating } from "../src/lib/engine/engine.ts";

const NOW = Date.parse("2026-11-12T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86400e3);

function rating(employeeId: string, skillId: string, validated: number | null, self: number | null = validated, o: Partial<Rating> = {}): Rating {
  return {
    employeeId, skillId,
    selfLevel: self, selfAt: self == null ? null : daysAgo(30),
    validatedLevel: validated, validatedAt: validated == null ? null : daysAgo(20),
    interest: false, status: validated == null ? "submitted" : "validated",
    ...o,
  };
}

function dataset(over: Partial<Dataset> = {}): Dataset {
  return {
    now: NOW,
    settings: { ...DEFAULT_SETTINGS },
    units: [
      { id: "acme", name: "Acme", kind: "company", parentId: null, managerId: null },
      { id: "plat", name: "Platform", kind: "department", parentId: "acme", managerId: "ann" },
      { id: "cloud", name: "Cloud team", kind: "team", parentId: "plat", managerId: "ann" },
      { id: "data", name: "Data team", kind: "team", parentId: "plat", managerId: null },
      { id: "ops", name: "Ops", kind: "team", parentId: "acme", managerId: null },
    ],
    employees: [
      { id: "ann", name: "Ann", email: "ann@x", title: "", unitId: "cloud", roleId: "eng", gradeId: "sr", managerId: null, active: true },
      { id: "bob", name: "Bob", email: "bob@x", title: "", unitId: "cloud", roleId: "eng", gradeId: "jr", managerId: "ann", active: true },
      { id: "cat", name: "Cat", email: "cat@x", title: "", unitId: "cloud", roleId: "eng", gradeId: "jr", managerId: "ann", active: true },
      { id: "dan", name: "Dan", email: "dan@x", title: "", unitId: "data", roleId: "eng", gradeId: "jr", managerId: "ann", active: true },
      { id: "eve", name: "Eve", email: "eve@x", title: "", unitId: "data", roleId: "ana", gradeId: null, managerId: "dan", active: true },
      { id: "ivy", name: "Ivy", email: "ivy@x", title: "", unitId: "data", roleId: "ana", gradeId: null, managerId: "dan", active: true },
      { id: "fay", name: "Fay", email: "fay@x", title: "", unitId: "ops", roleId: "eng", gradeId: "jr", managerId: null, active: true },
      { id: "gus", name: "Gus", email: "gus@x", title: "", unitId: "ops", roleId: "eng", gradeId: "jr", managerId: null, active: false },
    ],
    categories: [{ id: "cloudc", name: "Cloud", sort: 1 }, { id: "datac", name: "Data", sort: 2 }],
    skills: [
      { id: "aws", name: "AWS", categoryId: "cloudc", parentId: null, status: "active" },
      { id: "ec2", name: "EC2", categoryId: "cloudc", parentId: "aws", status: "active" },
      { id: "s3", name: "S3", categoryId: "cloudc", parentId: "aws", status: "active" },
      { id: "k8s", name: "Kubernetes", categoryId: "cloudc", parentId: null, status: "active" },
      { id: "sql", name: "SQL", categoryId: "datac", parentId: null, status: "active" },
      { id: "old", name: "Old", categoryId: "datac", parentId: null, status: "retired" },
    ],
    roles: [{ id: "eng", name: "Engineer" }, { id: "ana", name: "Analyst" }],
    grades: [{ id: "jr", name: "Junior", rank: 1 }, { id: "sr", name: "Senior", rank: 2 }],
    roleSkills: [
      { roleId: "eng", gradeId: null, skillId: "ec2", target: 3, mandatory: true },
      { roleId: "eng", gradeId: "sr", skillId: "ec2", target: 4, mandatory: true },
      { roleId: "eng", gradeId: null, skillId: "k8s", target: 2, mandatory: false },
      { roleId: "eng", gradeId: "sr", skillId: "sql", target: 3, mandatory: true },
      { roleId: "ana", gradeId: null, skillId: "sql", target: 3, mandatory: true },
      { roleId: "eng", gradeId: null, skillId: "aws", target: 3, mandatory: true }, // a heading: ignored
      { roleId: "eng", gradeId: null, skillId: "old", target: 3, mandatory: true }, // retired: ignored
    ],
    unitRequirements: [],
    employeeTargets: [],
    ratings: [
      rating("ann", "ec2", 4), rating("ann", "sql", 3),
      rating("bob", "ec2", 2, 3),
      rating("cat", "ec2", 1, 2), rating("cat", "k8s", 2),
      rating("dan", "ec2", 3),
      rating("eve", "sql", null, 4),
      rating("fay", "ec2", 4), rating("fay", "s3", 3),
    ],
    ...over,
  };
}

test("gap categories, including critical for a far-off high target and unassessed never 0", () => {
  assert.equal(gapCategory(3, 3), "meets");
  assert.equal(gapCategory(3, 5), "meets");
  assert.equal(gapCategory(3, 2), "minor");
  assert.equal(gapCategory(4, 2), "significant");
  assert.equal(gapCategory(3, 1), "critical");
  assert.equal(gapCategory(5, 2), "critical");
  assert.equal(gapCategory(2, 0), "significant");
  assert.equal(gapCategory(3, null), "unassessed");
  assert.equal(gapCategory(null, 4), "not_required");
});

test("target precedence: person override > grade-specific > all-grades, with the source reported", () => {
  const e = createEngine(dataset({ employeeTargets: [{ employeeId: "bob", skillId: "k8s", target: 4, reason: "project" }] }));
  const ann = e.empById.get("ann")!, bob = e.empById.get("bob")!;
  assert.deepEqual([e.targetFor(ann, "ec2")?.target, e.targetFor(ann, "ec2")?.source], [4, "grade"]);
  assert.deepEqual([e.targetFor(bob, "ec2")?.target, e.targetFor(bob, "ec2")?.source], [3, "role"]);
  const k = e.targetFor(bob, "k8s")!;
  assert.deepEqual([k.target, k.source, k.mandatory, k.reason], [4, "person", false, "project"]);
});

test("only active leaf skills are required or rated", () => {
  const e = createEngine(dataset());
  assert.equal(e.isRateable("aws"), false, "AWS has active sub-skills");
  assert.equal(e.isRateable("old"), false, "retired");
  assert.equal(e.isRateable("ec2"), true);
  assert.deepEqual(e.requiredSkillIds(e.empById.get("bob")!).sort(), ["ec2", "k8s"]);
  // retiring both sub-skills turns the heading back into a rateable skill
  const ds = dataset();
  ds.skills = ds.skills.map((s) => (s.parentId === "aws" ? { ...s, status: "retired" } : s));
  assert.equal(createEngine(ds).isRateable("aws"), true);
});

test("validated basis ignores self ratings; self basis uses them", () => {
  const v = createEngine(dataset());
  const s = createEngine(dataset(), { basis: "self" });
  const eve = v.empById.get("eve")!;
  assert.equal(v.cell(eve, "sql").category, "unassessed");
  assert.equal(v.cell(eve, "sql").met, false);
  assert.equal(s.cell(eve, "sql").category, "meets");
});

test("stale ratings are flagged, and only excluded from on-target when the setting says so", () => {
  const ds = dataset();
  ds.ratings = ds.ratings.map((r) => (r.employeeId === "dan" ? { ...r, validatedAt: daysAgo(400) } : r));
  const keep = createEngine(ds);
  const dan = keep.empById.get("dan")!;
  assert.equal(keep.cell(dan, "ec2").stale, true);
  assert.equal(keep.cell(dan, "ec2").met, true);
  ds.settings = { ...ds.settings, excludeStale: true };
  assert.equal(createEngine(ds).cell(dan, "ec2").met, false);
});

test("roll-up counts pairs on target and adds up the tree; inactive people are left out", () => {
  const e = createEngine(dataset());
  const cloud = e.aggregate(e.membersOf("cloud"));
  // ann: ec2 4/4 met, sql 3/3 met, k8s unassessed; bob: ec2 2/3, k8s none; cat: ec2 1/3, k8s 2/2 met
  assert.deepEqual([cloud.required, cloud.met, cloud.assessed], [7, 3, 5]);
  const data = e.aggregate(e.membersOf("data"));
  const plat = e.aggregate(e.membersOf("plat"));
  assert.equal(plat.required, cloud.required + data.required);
  assert.equal(plat.met, cloud.met + data.met);
  assert.equal(e.membersOf("ops").length, 1, "Gus is inactive");
  assert.equal(e.membersOf("acme").length, 7);
});

test("implicit team demand: one person at the role baseline (lowest mandatory target); optional skills create none", () => {
  const e = createEngine(dataset());
  const d = e.demands("cloud");
  const ec2 = d.find((x) => x.skillId === "ec2")!;
  assert.deepEqual([ec2.level, ec2.headcount, ec2.explicit], [3, 1, false], "Ann (senior) needs 4, Bob and Cat 3");
  assert.equal(d.find((x) => x.skillId === "k8s"), undefined, "k8s is not mandatory");
  assert.equal(d.find((x) => x.skillId === "sql"), undefined, "only Ann (senior) needs SQL: her gap, not a team need");
  assert.equal(e.demands("plat").length, 0, "no direct members, no explicit requirement");
});

test("coverage: single point of failure when exactly one person holds the level", () => {
  const e = createEngine(dataset());
  const ec2 = e.coverage(e.demands("cloud").find((x) => x.skillId === "ec2")!);
  assert.deepEqual([ec2.count, ec2.spof, ec2.critical, ec2.shortfall], [1, true, false, 0]);
  assert.deepEqual(ec2.holders, ["ann"]);
});

test("explicit requirement: the shortfall is the people missing at the level", () => {
  const e = createEngine(dataset({ unitRequirements: [{ unitId: "cloud", skillId: "ec2", minLevel: 3, headcount: 5 }] }));
  const c = e.shortNeeds("acme").find((x) => x.unitId === "cloud" && x.skillId === "ec2")!;
  // holders at >=3: Ann only; 5 needed
  assert.deepEqual([c.count, c.headcount, c.shortfall, c.explicit], [1, 5, 4, true]);
});

test("short needs: nobody first, then the biggest shortfall, then single holders; covered needs left out", () => {
  const e = createEngine(dataset());
  const needs = e.shortNeeds("acme");
  const sqlData = needs.find((x) => x.unitId === "data" && x.skillId === "sql")!;
  assert.equal(sqlData.critical, true, "Eve and Ivy both need SQL; Eve is self-rated only, Ivy unrated");
  assert.equal(needs[0].critical, true);
  const ec2Cloud = needs.find((x) => x.unitId === "cloud" && x.skillId === "ec2")!;
  assert.deepEqual([ec2Cloud.spof, ec2Cloud.shortfall], [true, 0], "covered, but by one person");
  assert.ok(needs.every((x) => x.shortfall > 0 || x.spof));
});

test("individual gaps: everyone below their own target, or not assessed; no suggestion attached", () => {
  const e = createEngine(dataset());
  const gaps = e.individualGaps(e.membersOf("cloud"));
  const by = (emp: string, s: string) => gaps.find((n) => n.employeeId === emp && n.skillId === s);
  assert.equal(by("bob", "ec2")?.category, "minor");
  assert.equal(by("cat", "ec2")?.category, "critical", "target 3, level 1: critical even though the gap is 2");
  assert.equal(by("bob", "k8s")?.category, "unassessed");
  assert.equal(by("ann", "ec2"), undefined, "met");
  assert.ok(gaps.every((g) => !("action" in g)));
});

test("calibration: average self minus validated per team, needing at least three pairs", () => {
  const e = createEngine(dataset());
  const c = e.calibration("acme");
  const cloud = c.find((x) => x.unitId === "cloud")!;
  // ann 4-4, 3-3; bob 3-2; cat 2-1, 2-2 -> (0+0+1+1+0)/5
  assert.deepEqual([cloud.n, cloud.delta], [5, 0.4]);
  assert.equal(c.find((x) => x.unitId === "data"), undefined, "only one pair with both levels");
});

test("KPIs for a scope", () => {
  const e = createEngine(dataset());
  const k = e.kpis("cloud");
  assert.equal(k.people, 3);
  assert.equal(k.required, 7);
  assert.equal(k.onTargetPct, 43);
  assert.equal(k.assessedPct, 71);
  assert.equal(k.spof, 1, "ec2: Ann is the only holder");
  assert.equal(k.criticalGaps, 0);
  assert.equal(createEngine(dataset()).kpis("data").pendingValidation, 1);
});

test("unit heatmap: child units as rows, direct members as their own row, categories as columns", () => {
  const e = createEngine(dataset());
  const h = e.unitHeatmap("acme");
  assert.deepEqual(h.rows.map((r) => r.id), ["ops", "plat"].sort((a, b) => (a === "ops" ? 1 : -1)).sort((a, b) => (e.unitById.get(a)!.name.localeCompare(e.unitById.get(b)!.name))));
  assert.deepEqual(h.columns.map((c) => c.id), ["cloudc", "datac"]);
  const plat = h.rows.find((r) => r.id === "plat")!;
  assert.equal(plat.cells.cloudc.required + plat.cells.datac.required, plat.total.required);
  const cat = e.unitHeatmap("acme", { categoryId: "cloudc" });
  assert.deepEqual(cat.columns.map((c) => c.name).sort(), ["AWS › EC2", "AWS › S3", "Kubernetes"]);
});

test("people heatmap: worst rows first, coverage on each demanded column, hide-met drops all-green columns", () => {
  const e = createEngine(dataset());
  const h = e.peopleHeatmap("cloud");
  assert.equal(h.rows[0].employee.id, "bob", "two unmet (ec2, k8s) and alphabetically before Cat");
  const ec2 = h.columns.find((c) => c.id === "ec2")!;
  assert.equal(ec2.coverage?.spof, true);
  const hidden = e.peopleHeatmap("cloud", { hideMet: true });
  assert.equal(hidden.columns.find((c) => c.id === "sql"), undefined, "SQL is met by the only person who needs it");
  assert.ok(hidden.columns.find((c) => c.id === "ec2"), "EC2 stays: Bob and Cat are below target");
});

test("person profile: role fit, next grade, over-qualification", () => {
  const e = createEngine(dataset());
  const fay = e.personProfile(e.empById.get("fay")!);
  assert.equal(fay.roleFitPct, 50, "ec2 met, k8s unassessed");
  assert.equal(fay.nextGrade?.grade.id, "sr");
  assert.deepEqual(fay.nextGrade?.missing.map((m) => m.skillId).sort(), ["k8s", "sql"]);
  const ds = dataset();
  ds.ratings.push(rating("bob", "k8s", 5));
  const bob = createEngine(ds).personProfile(createEngine(ds).empById.get("bob")!);
  assert.deepEqual(bob.overqualified.map((c) => c.skillId), ["k8s"]);
});

test("people finder and manager scope", () => {
  const e = createEngine(dataset());
  assert.deepEqual(e.find("acme", "ec2", 3).map((x) => x.e.id), ["ann", "fay", "dan"]);
  assert.deepEqual(e.reportsOf("ann").map((x) => x.id), ["bob", "cat", "dan", "eve", "ivy"]);
});

test("a cycle in the unit tree does not hang", () => {
  const ds = dataset();
  ds.units = ds.units.map((u) => (u.id === "acme" ? { ...u, parentId: "cloud" } : u));
  const e = createEngine(ds);
  assert.ok(e.subtreeUnitIds("plat").length <= 5);
  assert.ok(e.ancestors("cloud").length <= 5);
});
