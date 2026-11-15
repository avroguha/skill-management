// The talent to look for in an open position, and the training that would help a team,
// computed from the engine (no database, so it is unit-tested in test/advice.test.ts).
//
// Owner, 2026-11-15: "manager can add an open position and tool should suggest what type of
// talent they need to hire, if no open position then it should tell what skills training will
// be useful for the team". And, the same day: "No hire suggestion is still a no ... Not use
// suggesting that we need to hire". So positions exist only when a manager adds one; nothing
// here, or anywhere in the app, ever suggests that a team should hire or open a position.
//
// An open position (a role and grade, and/or skills the manager adds):
//  * The skills come from the role's targets (the grade-specific row wins), plus the skills
//    the manager adds. Each is put in one of three groups:
//      bring  - a team need for it is short (in the unit or any team below it: a director's
//               position counts the gaps of the teams under them), or it is mandatory and
//               nobody, or only one person, in the unit holds the level. The hire closes a gap.
//      coach  - mandatory, and two or more people in the team hold it: the hire should have
//               it, but can be brought up to the level by the team.
//      nice   - optional for the role.
//  * Team needs that are short and that the profile does not already cover are listed
//    apart: the hire could close them too, if the person also has them.
//  * No role chosen: the role whose targets cover most of what is asked (the added skills and
//    the team's short needs) is suggested, with the grade that closes the most of them.
//  * Internal candidates: people the viewer can see, outside the team, ranked by how many of
//    the bring + coach skills they already hold at the level.
//
// Training (always on the Training tab; on Open positions when no position is open):
//  * Per skill: the people below their own target (assessed only: an unassessed skill is
//    asked for a self-assessment first, not training), plus, for a team need that is short
//    (the unit's own or a team's below it), the people in that team one level below it.
//    Those with an open training plan for it are "booked".
//  * Ranked by weight: a mandatory gap counts twice its size, an optional one once, a short
//    team need three per missing person (three more when nobody holds it).
//  * How: three or more learners -> a course for the group; someone in the team at the level
//    -> coaching by them; nobody -> external training. A short team need nobody is within
//    one level of is flagged as one that will take longer (no other advice is attached).
import type { Engine, Employee } from "./engine.ts";

export interface PositionSpec {
  unitId: string;
  roleId: string | null;
  gradeId: string | null;
  /** skills the manager adds (or raises above the role's level) */
  skills: { skillId: string; level: number }[];
}

export type HireGroup = "bring" | "coach" | "nice";

export interface HireSkill {
  skillId: string;
  level: number;
  mandatory: boolean;
  /** role: from the role's targets; added: the manager added it; both */
  source: "role" | "added" | "both";
  group: HireGroup;
  /** people in the team at or above the level */
  teamHolders: number;
  /** a team need for this skill and how many people it is short (0 when met or none) */
  teamShort: number;
  why: string;
}

export interface Candidate { employeeId: string; matched: number; of: number; interested: number }

export interface HiringAdvice {
  roleId: string | null;
  gradeId: string | null;
  /** set when no role was chosen and one fits what is asked */
  suggestedRole: { roleId: string; gradeId: string | null; covers: number; of: number } | null;
  /** set when a role was chosen without a grade and its grades differ in what they close */
  suggestedGrade: { gradeId: string; closes: number } | null;
  skills: HireSkill[];
  /** short team needs this profile does not already include */
  /** short team needs (in the unit or a team below it) this profile does not already include */
  alsoCloses: { skillId: string; unitId: string; level: number; short: number; nobody: boolean }[];
  /** the categories of the bring skills, most first */
  focus: { categoryId: string; count: number }[];
  /** experienced: a bring skill at level 4+, or one nobody in the team holds at any level */
  experienced: boolean;
  candidates: Candidate[];
}

const GROUP_RANK: Record<HireGroup, number> = { bring: 0, coach: 1, nice: 2 };

/** The role's target per skill for a grade: the grade-specific row wins over the all-grades one. */
export function roleProfile(engine: Engine, roleId: string, gradeId: string | null) {
  const probe: Employee = {
    id: `#probe:${roleId}:${gradeId ?? ""}`, name: "", email: "", title: "", unitId: null,
    roleId, gradeId, managerId: "#probe", active: true,
  };
  const out = new Map<string, { level: number; mandatory: boolean }>();
  for (const sid of engine.requiredSkillIds(probe)) {
    const t = engine.targetFor(probe, sid);
    if (t) out.set(sid, { level: t.target, mandatory: t.mandatory });
  }
  return out;
}

/** The short team needs in a unit and the teams below it: the worst one per skill. */
export function shortNeedsBySkill(engine: Engine, unitId: string) {
  const out = new Map<string, ReturnType<Engine["coverage"]>>();
  const worse = (a: ReturnType<Engine["coverage"]>, b: ReturnType<Engine["coverage"]>) =>
    Number(a.count === 0) - Number(b.count === 0) || a.shortfall - b.shortfall || Number(a.unitId === unitId) - Number(b.unitId === unitId);
  for (const c of engine.coverageIn(unitId)) {
    if (c.shortfall <= 0) continue;
    const prev = out.get(c.skillId);
    if (!prev || worse(c, prev) > 0) out.set(c.skillId, c);
  }
  return out;
}

function teamState(engine: Engine, unitId: string) {
  const members = engine.membersOf(unitId);
  const needs = shortNeedsBySkill(engine, unitId);
  const holders = (skillId: string, level: number) => engine.find(unitId, skillId, level).length;
  const who = (needUnitId: string) => (needUnitId === unitId ? "The team" : engine.unitById.get(needUnitId)?.name ?? "A team below");
  return { members, needs, holders, who };
}

export function hiringAdvice(engine: Engine, spec: PositionSpec, pool: Employee[] = []): HiringAdvice {
  const { members, needs, holders, who } = teamState(engine, spec.unitId);
  const shortNeeds = [...needs.values()];

  /** Where a skill at a level falls for this team (see the rules at the top). */
  function classify(skillId: string, level: number, mandatory: boolean): { group: HireGroup; why: string } {
    const need = needs.get(skillId);
    if (need && level >= need.level) {
      return { group: "bring", why: need.count === 0 ? `${who(need.unitId)} needs ${need.headcount} at level ${need.level} and nobody has it.`
        : `${who(need.unitId)} needs ${need.headcount} at level ${need.level} and has ${need.count}.` };
    }
    if (!mandatory) return { group: "nice", why: "Optional for the role." };
    const n = holders(skillId, level);
    if (n === 0) return { group: "bring", why: "Nobody in the team has it at this level." };
    if (n === 1) return { group: "bring", why: "Only one person in the team has it at this level." };
    return { group: "coach", why: `${n} people in the team have it and can bring the hire up to the level.` };
  }

  // no role: suggest the one that covers most of what is asked
  let suggestedRole: HiringAdvice["suggestedRole"] = null;
  let roleId = spec.roleId;
  let gradeId = spec.gradeId;
  if (!roleId) {
    const asked = new Map<string, number>();
    for (const c of shortNeeds) asked.set(c.skillId, c.level);
    for (const s of spec.skills) asked.set(s.skillId, Math.max(asked.get(s.skillId) ?? 0, s.level));
    if (asked.size) {
      let best: NonNullable<HiringAdvice["suggestedRole"]> | null = null;
      for (const rid of engine.roles.map((r) => r.id)) {
        for (const gid of [null, ...gradeIdsOf(engine)]) {
          const prof = roleProfile(engine, rid, gid);
          let covers = 0;
          for (const [sid, lvl] of asked) if ((prof.get(sid)?.level ?? 0) >= lvl) covers += 1;
          if (!covers) continue;
          // more covered wins; then a role-wide profile over a graded one, then the lower grade
          const better = !best || covers > best.covers
            || (covers === best.covers && gradeRank(engine, gid) < gradeRank(engine, best.gradeId));
          if (better) best = { roleId: rid, gradeId: gid, covers, of: asked.size };
        }
      }
      if (best) { suggestedRole = best; roleId = best.roleId; gradeId = best.gradeId; }
    }
  }

  // a role without a grade: the grade that closes the most short skills, if grades differ
  let suggestedGrade: HiringAdvice["suggestedGrade"] = null;
  if (roleId && !gradeId && spec.roleId) {
    const closes = (gid: string | null) => {
      let n = 0;
      for (const [sid, t] of roleProfile(engine, roleId!, gid)) if (classify(sid, t.level, t.mandatory).group === "bring") n += 1;
      return n;
    };
    const base = closes(null);
    let best: { gradeId: string; closes: number } | null = null;
    for (const gid of gradeIdsOf(engine)) {
      const n = closes(gid);
      if (n > base && (!best || n > best.closes)) best = { gradeId: gid, closes: n };
    }
    suggestedGrade = best;
  }

  // the profile: the role's targets plus the added skills
  const want = new Map<string, { level: number; mandatory: boolean; source: HireSkill["source"] }>();
  if (roleId) for (const [sid, t] of roleProfile(engine, roleId, gradeId)) want.set(sid, { ...t, source: "role" });
  for (const s of spec.skills) {
    if (!engine.isRateable(s.skillId)) continue;
    const prev = want.get(s.skillId);
    want.set(s.skillId, { level: Math.max(prev?.level ?? 0, s.level), mandatory: true, source: prev ? "both" : "added" });
  }

  const skills: HireSkill[] = [];
  for (const [sid, w] of want) {
    const { group, why } = classify(sid, w.level, w.mandatory);
    skills.push({ skillId: sid, level: w.level, mandatory: w.mandatory, source: w.source, group, teamHolders: holders(sid, w.level), teamShort: needs.get(sid)?.shortfall ?? 0, why });
  }
  skills.sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || b.level - a.level
    || engine.skillLabel(a.skillId).localeCompare(engine.skillLabel(b.skillId)));

  const alsoCloses = shortNeeds.filter((c) => !want.has(c.skillId))
    .map((c) => ({ skillId: c.skillId, unitId: c.unitId, level: c.level, short: c.shortfall, nobody: c.count === 0 }))
    .sort((a, b) => Number(b.nobody) - Number(a.nobody) || b.short - a.short);

  const bring = skills.filter((s) => s.group === "bring");
  const focusMap = new Map<string, number>();
  for (const s of bring) {
    const cat = engine.skillById.get(s.skillId)?.categoryId ?? "";
    focusMap.set(cat, (focusMap.get(cat) ?? 0) + 1);
  }
  const focus = [...focusMap].map(([categoryId, count]) => ({ categoryId, count })).sort((a, b) => b.count - a.count);
  const experienced = bring.some((s) => s.level >= 4 || holders(s.skillId, 1) === 0);

  // internal candidates: people outside the team who already hold the must-haves
  const core = skills.filter((s) => s.group !== "nice");
  const inTeam = new Set(members.map((m) => m.id));
  const candidates: Candidate[] = [];
  if (core.length) {
    for (const e of pool) {
      if (!e.active || inTeam.has(e.id) || engine.isTop(e)) continue;
      let matched = 0, interested = 0;
      for (const s of core) {
        const { level } = engine.levelOf(e.id, s.skillId);
        if (level != null && level >= s.level) matched += 1;
        else if (engine.rating(e.id, s.skillId)?.interest) interested += 1;
      }
      if (matched * 2 >= core.length) candidates.push({ employeeId: e.id, matched, of: core.length, interested });
    }
    candidates.sort((a, b) => b.matched - a.matched || b.interested - a.interested
      || (engine.empById.get(a.employeeId)?.name ?? "").localeCompare(engine.empById.get(b.employeeId)?.name ?? ""));
  }

  return { roleId, gradeId, suggestedRole, suggestedGrade, skills, alsoCloses, focus, experienced, candidates: candidates.slice(0, 5) };
}

function gradeIdsOf(engine: Engine): string[] {
  return [...engine.gradeById.values()].sort((a, b) => a.rank - b.rank).map((g) => g.id);
}
function gradeRank(engine: Engine, gradeId: string | null): number {
  return gradeId ? engine.gradeById.get(gradeId)?.rank ?? 0 : -1;
}

// ---- training ------------------------------------------------------------------------

export interface Learner {
  employeeId: string; level: number | null; target: number; interest: boolean; booked: boolean; mandatory: boolean;
  /** target: below their own target; team: one level below a short team need */
  reason: "target" | "team";
}

export interface TrainingIdea {
  skillId: string;
  weight: number;
  learners: Learner[];
  /** people in the team at or above the highest level asked: who can coach */
  mentors: string[];
  /** a team need for this skill that is short */
  teamNeed: { unitId: string; level: number; headcount: number; have: number } | null;
  /** short team need with nobody within one level of it */
  slow: boolean;
  how: "course" | "coaching" | "external";
  why: string;
}

export function trainingAdvice(engine: Engine, people: Employee[], unitId: string | null, booked: { employeeId: string; skillId: string }[] = []): TrainingIdea[] {
  const isBooked = new Set(booked.map((b) => `${b.employeeId}|${b.skillId}`));
  const bySkill = new Map<string, { learners: Map<string, Learner>; weight: number; need: TrainingIdea["teamNeed"]; slow: boolean }>();
  const at = (sid: string) => {
    let x = bySkill.get(sid);
    if (!x) { x = { learners: new Map(), weight: 0, need: null, slow: false }; bySkill.set(sid, x); }
    return x;
  };

  for (const g of engine.individualGaps(people)) {
    if (g.level == null) continue; // not assessed yet: a self-assessment comes first
    const x = at(g.skillId);
    const b = isBooked.has(`${g.employeeId}|${g.skillId}`);
    x.learners.set(g.employeeId, { employeeId: g.employeeId, level: g.level, target: g.target, interest: g.interest, booked: b, mandatory: g.mandatory, reason: "target" });
    if (!b) x.weight += g.gap * (g.mandatory ? 2 : 1);
  }

  const team = unitId ? engine.membersOf(unitId) : people;
  if (unitId) {
    // short needs of the unit and of every team below it; learners come from the team that has the need
    const worst = shortNeedsBySkill(engine, unitId);
    for (const c of engine.coverageIn(unitId)) {
      if (c.shortfall <= 0) continue;
      const d = c; // the demand behind this coverage
      const x = at(d.skillId);
      if (worst.get(d.skillId) === c) x.need = { unitId: c.unitId, level: d.level, headcount: d.headcount, have: c.count };
      x.weight += c.shortfall * 3 + (c.count === 0 ? 3 : 0);
      let near = 0;
      for (const e of engine.membersOf(c.unitId)) {
        if (engine.isTop(e)) continue;
        const { level } = engine.levelOf(e.id, d.skillId);
        if (level == null || level !== d.level - 1) continue;
        near += 1;
        if (!x.learners.has(e.id)) {
          const r = engine.rating(e.id, d.skillId);
          x.learners.set(e.id, { employeeId: e.id, level, target: d.level, interest: !!r?.interest, booked: isBooked.has(`${e.id}|${d.skillId}`), mandatory: false, reason: "team" });
        }
      }
      if (near === 0) x.slow = true;
    }
  }

  const out: TrainingIdea[] = [];
  for (const [sid, x] of bySkill) {
    const learners = [...x.learners.values()].sort((a, b) => Number(a.booked) - Number(b.booked)
      || Number(b.interest) - Number(a.interest) || (b.level ?? 0) - (a.level ?? 0)
      || (engine.empById.get(a.employeeId)?.name ?? "").localeCompare(engine.empById.get(b.employeeId)?.name ?? ""));
    const open = learners.filter((l) => !l.booked);
    if (!open.length && !x.need) continue;
    const top = Math.max(2, ...learners.map((l) => l.target), x.need?.level ?? 0);
    const learnerIds = new Set(learners.map((l) => l.employeeId));
    const who = team
      .map((e) => ({ id: e.id, level: engine.levelOf(e.id, sid).level ?? -1 }))
      .filter((m) => !learnerIds.has(m.id) && m.level >= top)
      .sort((a, b) => b.level - a.level || (engine.empById.get(a.id)?.name ?? "").localeCompare(engine.empById.get(b.id)?.name ?? ""))
      .map((m) => m.id);
    const how: TrainingIdea["how"] = open.length >= 3 ? "course" : who.length ? "coaching" : "external";
    const parts: string[] = [];
    const below = open.filter((l) => l.reason === "target");
    const req = below.filter((l) => l.mandatory).length;
    if (below.length) parts.push(`${below.length} below their target${req && req < below.length ? ` (${req} required)` : req ? " (required)" : ""}`);
    if (x.need) parts.push(`${x.need.unitId === unitId ? "the team" : engine.unitById.get(x.need.unitId)?.name ?? "a team below"} needs ${x.need.headcount} at level ${x.need.level} and has ${x.need.have}`);
    const bookedN = learners.length - open.length;
    if (bookedN) parts.push(`${bookedN} already booked`);
    out.push({
      skillId: sid, weight: x.weight, learners, mentors: who, teamNeed: x.need, slow: x.slow && !!x.need, how,
      why: parts.join("; ").replace(/^./, (c) => c.toUpperCase()) + ".",
    });
  }
  return out.sort((a, b) => b.weight - a.weight || b.learners.length - a.learners.length
    || engine.skillLabel(a.skillId).localeCompare(engine.skillLabel(b.skillId)));
}
