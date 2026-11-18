// The engine's rules, one test each. A small hand-built organisation (v2: a team is a manager
// and everyone below them):
//
//   tia (CEO, the top)
//   ├─ ann (manager, Engineer Senior)      "Cloud"
//   │   ├─ bob (Engineer Junior)
//   │   └─ cat (Engineer Junior)
//   └─ dan (manager, Engineer Junior)
//       ├─ eve (Analyst)
//       └─ ivy (Analyst)
//   fay (Engineer Junior, no manager, nobody below)  <- spare AWS capacity
//   gus (has left)
import test from "node:test";
import assert from "node:assert/strict";
import { createEngine, gapCategory, ALL, DEFAULT_SETTINGS, type Dataset, type Rating } from "../src/lib/engine/engine.ts";

const NOW = Date.parse("2026-11-18T00:00:00Z");
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

const emp = (id: string, managerId: string | null, roleId: string | null, gradeId: string | null, o: { active?: boolean; teamName?: string } = {}) =>
  ({ id, name: id[0].toUpperCase() + id.slice(1), email: `${id}@x`, title: "", roleId, gradeId, managerId, active: o.active ?? true, teamName: o.teamName ?? "" });

function dataset(over: Partial<Dataset> = {}): Dataset {
  return {
    now: NOW,
    settings: { ...DEFAULT_SETTINGS },
    employees: [
      emp("tia", null, null, null),
      emp("ann", "tia", "eng", "sr", { teamName: "Cloud" }),
      emp("bob", "ann", "eng", "jr"),
      emp("cat", "ann", "eng", "jr"),
      emp("dan", "tia", "eng", "jr"),
      emp("eve", "dan", "ana", null),
      emp("ivy", "dan", "ana", null),
      emp("fay", null, "eng", "jr"),
      emp("gus", "ann", "eng", "jr", { active: false }),
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
    teamNeeds: [{ managerId: "ann", skillId: "k8s", minLevel: 2, headcount: 2 }],
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
  assert.equal(gapCategory(null, 3), "not_required");
  assert.equal(gapCategory(3, null), "unassessed");
  assert.equal(gapCategory(3, 3), "meets");
  assert.equal(gapCategory(3, 5), "meets");
  assert.equal(gapCategory(3, 2), "minor");
  assert.equal(gapCategory(4, 2), "significant");
  assert.equal(gapCategory(5, 2), "critical");
  assert.equal(gapCategory(3, 1), "critical");
  assert.equal(gapCategory(2, 0), "significant");
});

test("targets: grade-specific beats all-grades; managers and the top have none unless managers assess", () => {
  const e = createEngine(dataset());
  const at = (id: string, s: string) => e.targetFor(e.empById.get(id)!, s);
  assert.deepEqual(at("bob", "ec2"), { target: 3, mandatory: true, source: "role" });
  assert.equal(at("ann", "ec2"), null, "ann manages people: not asked to rate herself");
  assert.equal(at("tia", "ec2"), null);
  assert.equal(e.assesses(e.empById.get("fay")!), true, "nobody below and nobody above: still rates");
  const m = createEngine(dataset({ settings: { ...DEFAULT_SETTINGS, managersAssess: true } }));
  assert.deepEqual(m.targetFor(m.empById.get("ann")!, "ec2"), { target: 4, mandatory: true, source: "grade" });
  assert.equal(m.targetFor(m.empById.get("tia")!, "ec2"), null, "the top is never asked");
});

test("only active leaf skills are required or rated", () => {
  const e = createEngine(dataset());
  assert.deepEqual(e.requiredSkillIds(e.empById.get("bob")!).sort(), ["ec2", "k8s"]);
  assert.equal(e.isRateable("aws"), false);
  assert.equal(e.isRateable("old"), false);
  assert.equal(e.isRateable("ec2"), true);
});

test("confirmed basis ignores self ratings; self basis uses them", () => {
  const e = createEngine(dataset());
  assert.equal(e.cell(e.empById.get("eve")!, "sql").level, null);
  const s = createEngine(dataset(), { basis: "self" });
  assert.equal(s.cell(s.empById.get("eve")!, "sql").level, 4);
});

test("stale ratings are flagged, and only excluded from on-target when the setting says so", () => {
  const old = { validatedAt: daysAgo(400) };
  const ds = dataset({ ratings: [rating("bob", "ec2", 3, 3, old)] });
  const e = createEngine(ds);
  const c = e.cell(e.empById.get("bob")!, "ec2");
  assert.equal(c.stale, true);
  assert.equal(c.met, true);
  const x = createEngine({ ...ds, settings: { ...DEFAULT_SETTINGS, excludeStale: true } });
  assert.equal(x.cell(x.empById.get("bob")!, "ec2").met, false);
});

test("teams: a manager and everyone below; the leaver is nowhere", () => {
  const e = createEngine(dataset());
  assert.deepEqual(e.membersOf("ann").map((x) => x.id), ["ann", "bob", "cat"]);
  assert.deepEqual(e.reportsOf("tia").map((x) => x.id), ["ann", "bob", "cat", "dan", "eve", "ivy"]);
  assert.equal(e.membersOf(ALL).length, 8);
  assert.deepEqual(e.tops.map((x) => x.id), ["tia"]);
  assert.equal(e.teamLabel("ann"), "Cloud");
  assert.equal(e.teamLabel("dan"), "Dan's team");
  assert.deepEqual(e.chainOf("bob").map((x) => x.id), ["tia", "ann"]);
});

test("roll-up counts pairs on target among people asked; managers and leavers are left out", () => {
  const e = createEngine(dataset());
  const a = e.aggregate(e.membersOf("ann"));
  // bob: ec2 2<3, k8s -; cat: ec2 1<3, k8s 2>=2 -> 1 of 4
  assert.deepEqual({ people: a.people, required: a.required, met: a.met, assessed: a.assessed }, { people: 2, required: 4, met: 1, assessed: 3 });
  assert.equal(a.pct, 25);
});

test("implicit team need: two or more direct reports need a mandatory skill; optional skills create none", () => {
  const e = createEngine(dataset());
  const d = e.demands("ann");
  const ec2 = d.find((x) => x.skillId === "ec2")!;
  assert.deepEqual({ level: ec2.level, headcount: ec2.headcount, explicit: ec2.explicit }, { level: 3, headcount: 1, explicit: false });
  assert.ok(d.find((x) => x.skillId === "k8s")!.explicit, "k8s is the manager's own need");
  assert.ok(e.demands("dan").some((x) => x.skillId === "sql" && !x.explicit), "two analysts need SQL");
  assert.deepEqual(e.demands("tia"), [], "ann and dan manage: they are asked for nothing, so they imply nothing");
});

test("coverage: one holder, a shortfall, and nobody; worst first", () => {
  const e = createEngine(dataset());
  const ec2 = e.coverage(e.demands("ann").find((x) => x.skillId === "ec2")!);
  assert.deepEqual({ count: ec2.count, spof: ec2.spof, holders: ec2.holders }, { count: 1, spof: true, holders: ["ann"] });
  const k8s = e.coverage(e.demands("ann").find((x) => x.skillId === "k8s")!);
  assert.deepEqual({ count: k8s.count, shortfall: k8s.shortfall }, { count: 1, shortfall: 1 });
  const sql = e.coverage(e.demands("dan").find((x) => x.skillId === "sql")!);
  assert.equal(sql.critical, true, "eve's self-rating does not count until confirmed");
  assert.deepEqual(e.shortNeeds("tia").map((c) => `${c.managerId}:${c.skillId}`), ["dan:sql", "ann:k8s", "ann:ec2"]);
});

test("who elsewhere has what a team is short of, and which teams a person could strengthen", () => {
  const e = createEngine(dataset());
  assert.deepEqual(e.holdersOutside("dan", "sql", 3).map((x) => x.id), ["ann"]);
  assert.deepEqual(e.holdersOutside("ann", "ec2", 3).map((x) => x.id), ["fay", "dan"], "highest level first; ann's own team left out");
  const fits = e.fitsFor(e.empById.get("ann")!);
  assert.deepEqual(fits.map((f) => [f.managerId, f.skills.map((s) => s.skillId)]), [["dan", ["sql"]]]);
  assert.deepEqual(e.fitsFor(e.empById.get("fay")!).map((f) => f.managerId), ["ann"], "fay's EC2 4 strengthens ann's team");
  assert.deepEqual(e.fitsFor(e.empById.get("bob")!), [], "nothing bob has is short anywhere he is not");
});

test("progress: not started, in progress, waiting, sent back, done, not asked", () => {
  const ds = dataset();
  ds.ratings.push(rating("ivy", "sql", null, 2, { status: "returned" }));
  const e = createEngine(ds);
  const st = (id: string) => e.progress(e.empById.get(id)!).state;
  assert.equal(st("bob"), "in_progress", "k8s is not rated yet");
  assert.equal(st("cat"), "done");
  assert.equal(st("eve"), "waiting");
  assert.equal(st("ivy"), "sent_back");
  assert.equal(st("ann"), "not_asked");
  const fresh = createEngine(dataset());
  assert.equal(fresh.progress(fresh.empById.get("ivy")!).state, "not_started");
  assert.deepEqual(fresh.progress(fresh.empById.get("ivy")!).missing, ["sql"]);
});

test("KPIs for a team and the whole organisation", () => {
  const e = createEngine(dataset());
  const k = e.kpis("tia");
  assert.equal(k.people, 7);
  assert.equal(k.asked, 4, "bob, cat, eve, ivy");
  assert.equal(k.done, 2, "cat done, eve waiting");
  assert.equal(k.notStarted, 1);
  assert.equal(k.short, 2);
  assert.equal(k.nobody, 1);
  assert.equal(k.spof, 1);
  assert.equal(k.pendingConfirmation, 1);
  assert.equal(e.kpis(ALL).people, 8);
});

test("team heatmap: the teams below as rows; people in no team as their own row at the top", () => {
  const e = createEngine(dataset());
  const h = e.teamHeatmap("tia");
  assert.deepEqual(h.rows.map((r) => r.name), ["Cloud", "Dan's team"]);
  assert.deepEqual(h.columns.map((c) => c.name), ["Cloud", "Data"]);
  assert.equal(h.rows[0].cells.cloudc.required, 4);
  const all = e.teamHeatmap(ALL);
  assert.deepEqual(all.rows.map((r) => r.name), ["Cloud", "Dan's team", "Not in a team"], "one head: the whole organisation opens one level down");
  assert.equal(all.rows.find((r) => r.name === "Not in a team")!.people, 1, "fay");
});

test("people heatmap: a manager's direct reports, worst rows first, the team's needs as columns", () => {
  const e = createEngine(dataset());
  const h = e.peopleHeatmap("ann");
  assert.deepEqual(h.rows.map((r) => r.employee.id), ["bob", "cat"]);
  assert.deepEqual(h.columns.map((c) => c.id).sort(), ["ec2", "k8s"]);
  assert.equal(h.columns.find((c) => c.id === "k8s")!.coverage!.shortfall, 1);
  assert.deepEqual(e.peopleHeatmap("tia", { everyone: true }).rows.map((r) => r.employee.id).sort(), ["ann", "bob", "cat", "dan", "eve", "ivy"]);
});

test("person profile: fit and what the next grade asks for", () => {
  const e = createEngine(dataset());
  const p = e.personProfile(e.empById.get("bob")!);
  assert.equal(p.required, 2);
  assert.equal(p.met, 0);
  assert.equal(p.nextGrade?.grade.id, "sr");
  assert.deepEqual(p.nextGrade?.missing.map((m) => [m.skillId, m.target]).sort(), [["ec2", 4], ["k8s", 2], ["sql", 3]]);
});

test("people finder: confirmed level at or above, best first", () => {
  const e = createEngine(dataset());
  assert.deepEqual(e.find(ALL, "ec2", 3).map((x) => x.e.id), ["ann", "fay", "dan"]);
  assert.deepEqual(e.find("ann", "ec2", 3).map((x) => x.e.id), ["ann"]);
});

test("a loop in the reporting lines does not hang", () => {
  const ds = dataset();
  ds.employees.find((x) => x.id === "tia")!.managerId = "bob";
  const e = createEngine(ds);
  assert.ok(e.reportsOf("ann").length < 10);
  assert.ok(e.chainOf("bob").length < 10);
});

test("talent: holders, need and on-target agree with the plain roll-ups", () => {
  const e = createEngine(dataset());
  const t = e.talent("tia");
  const ec2 = t.skills.get("ec2")!;
  assert.equal(ec2.holders, 4, "ann, bob, cat, dan (fay is not in tia's tree)");
  assert.equal(ec2.needed, 2);
  assert.equal(ec2.onTarget, 0);
  assert.equal(t.skills.get("sql")!.extra, 1, "ann holds SQL at 3 without being asked");
});
