// A team's setup: its roles (who is in each, which skills each asks for), what the team
// needs, and the skills the manager asks of one person beyond their roles (extras). A role is
// a grouping the manager makes inside their own team; its name is unique in that team only,
// and a person can be in several.
//
// Nothing a manager changes here counts at once. Every change goes into a DRAFT of the whole
// setup; the Review section lists what differs from what is in force, each line can be
// undone, and Confirm puts the draft in force (Discard throws it away).
//
// Pure: a setup and an operation in, a setup out (test/team-setup.test.ts). Reading and
// writing the database is in team-setup-db.ts.
import { sameName } from "./similar.ts";
import { isTint, nextTint } from "./role-colors.ts";

export interface SetupSkill { skillId: string; target: number; mandatory: boolean }
export interface SetupRole {
  id: string; name: string; description: string;
  /** its tint (role-colors.ts); "" = the next colour the team does not use yet */
  color: string;
  members: string[]; skills: SetupSkill[];
}
export interface SetupNeed { skillId: string; minLevel: number; headcount: number; note: string }
/** A skill asked of one person, beyond their roles, with why (shown to them). */
export interface SetupExtra { employeeId: string; skillId: string; target: number; mandatory: boolean; note: string }
export interface TeamSetup {
  roles: SetupRole[];
  needs: SetupNeed[];
  extras: SetupExtra[];
  /** needs the roles imply that the manager took off the list */
  dismissed: string[];
}

export const emptySetup = (): TeamSetup => ({ roles: [], needs: [], extras: [], dismissed: [] });

export interface SetupContext {
  /** who can be put in this team's roles: the people reporting to its manager */
  people: ReadonlySet<string>;
  /** a skill that can be asked for: active, and not a heading with sub-skills */
  rateable: (skillId: string) => boolean;
}

export type SetupOp =
  | { op: "addRole"; id: string; name: string; description?: string; color?: string; copyOf?: string | null }
  | { op: "updateRole"; roleId: string; name: string; description?: string; color?: string }
  | { op: "removeRole"; roleId: string }
  | { op: "moveRole"; roleId: string; by: -1 | 1 }
  | { op: "addMembers"; roleId: string; employeeIds: string[] }
  | { op: "removeMember"; roleId: string; employeeId: string }
  | { op: "moveMember"; from: string; to: string; employeeId: string }
  | { op: "setSkills"; roleId: string; skills: SetupSkill[] }
  | { op: "removeSkill"; roleId: string; skillId: string }
  | { op: "setNeed"; need: SetupNeed }
  | { op: "removeNeed"; skillId: string; implied?: boolean }
  | { op: "restoreNeed"; skillId: string }
  | { op: "setExtras"; employeeId: string; skills: SetupSkill[]; note?: string }
  | { op: "removeExtra"; employeeId: string; skillId: string };

export type Applied = { ok: true; setup: TeamSetup } | { ok: false; error: string };

const clone = (s: TeamSetup): TeamSetup => ({
  roles: s.roles.map((r) => ({ ...r, members: [...r.members], skills: r.skills.map((k) => ({ ...k })) })),
  needs: s.needs.map((n) => ({ ...n })),
  extras: (s.extras ?? []).map((x) => ({ ...x })),
  dismissed: [...s.dismissed],
});
const fail = (error: string): Applied => ({ ok: false, error });
const level = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;
const NOT_A_TINT = "Choose one of the colours offered: a role's colour is always a soft tint.";

/** The roles a person is in. */
export function rolesOfPerson(setup: TeamSetup, employeeId: string): SetupRole[] {
  return setup.roles.filter((r) => r.members.includes(employeeId));
}

function checkName(setup: TeamSetup, name: string, exceptId?: string): string | null {
  const n = name.trim();
  if (n.length < 2) return "Name the role (at least two letters).";
  if (n.length > 80) return "A role name has at most 80 characters.";
  const taken = setup.roles.find((r) => r.id !== exceptId && sameName(r.name, n));
  return taken ? `This team already has a role called “${taken.name}”. Role names are unique within a team.` : null;
}

/** One change to a setup. Refused with a reason when it would break a rule. */
export function applyOp(setup: TeamSetup, op: SetupOp, ctx: SetupContext): Applied {
  const s = clone(setup);
  const role = (id: string) => s.roles.find((r) => r.id === id);
  switch (op.op) {
    case "addRole": {
      const bad = checkName(s, op.name);
      if (bad) return fail(bad);
      if (!op.id || role(op.id)) return fail("That role could not be added. Try again.");
      if (op.color && !isTint(op.color)) return fail(NOT_A_TINT);
      const from = op.copyOf ? role(op.copyOf) : undefined;
      // a new role takes a colour the team does not use yet, so it stands apart at once
      const color = op.color || nextTint(s.roles.map((r) => r.color));
      s.roles.push({ id: op.id, name: op.name.trim(), description: (op.description ?? from?.description ?? "").trim().slice(0, 500), color, members: [], skills: from ? from.skills.map((k) => ({ ...k })) : [] });
      return { ok: true, setup: s };
    }
    case "updateRole": {
      const r = role(op.roleId);
      if (!r) return fail("That role is no longer there.");
      const bad = checkName(s, op.name, r.id);
      if (bad) return fail(bad);
      if (op.color && !isTint(op.color)) return fail(NOT_A_TINT);
      r.name = op.name.trim();
      if (op.description != null) r.description = op.description.trim().slice(0, 500);
      if (op.color) r.color = op.color;
      return { ok: true, setup: s };
    }
    case "removeRole": {
      if (!role(op.roleId)) return fail("That role is no longer there.");
      s.roles = s.roles.filter((r) => r.id !== op.roleId);
      return { ok: true, setup: s };
    }
    case "moveRole": {
      const i = s.roles.findIndex((r) => r.id === op.roleId);
      const j = i + op.by;
      if (i < 0) return fail("That role is no longer there.");
      if (j < 0 || j >= s.roles.length) return { ok: true, setup: s };
      [s.roles[i], s.roles[j]] = [s.roles[j]!, s.roles[i]!];
      return { ok: true, setup: s };
    }
    case "addMembers": {
      const r = role(op.roleId);
      if (!r) return fail("That role is no longer there.");
      const ids = [...new Set(op.employeeIds)];
      if (!ids.length) return fail("Choose at least one person.");
      const outside = ids.filter((id) => !ctx.people.has(id));
      if (outside.length) return fail("Only people who report to this team's manager can be put in its roles.");
      for (const id of ids) if (!r.members.includes(id)) r.members.push(id);
      return { ok: true, setup: s };
    }
    case "removeMember": {
      const r = role(op.roleId);
      if (!r || !r.members.includes(op.employeeId)) return fail("They are not in that role any more.");
      if (rolesOfPerson(s, op.employeeId).length <= 1) return fail("This is the only role they are in, so they cannot be taken out of it. Move them to another role instead.");
      r.members = r.members.filter((id) => id !== op.employeeId);
      return { ok: true, setup: s };
    }
    case "moveMember": {
      const from = role(op.from), to = role(op.to);
      if (!to) return fail("That role is no longer there.");
      if (!ctx.people.has(op.employeeId)) return fail("Only people who report to this team's manager can be put in its roles.");
      if (from && from.id === to.id) return { ok: true, setup: s };
      if (!to.members.includes(op.employeeId)) to.members.push(op.employeeId);
      if (from) from.members = from.members.filter((id) => id !== op.employeeId);
      return { ok: true, setup: s };
    }
    case "setSkills": {
      const r = role(op.roleId);
      if (!r) return fail("That role is no longer there.");
      if (!op.skills.length) return fail("Choose at least one skill.");
      for (const k of op.skills) {
        if (!level(k.target)) return fail("A level from 1 to 5.");
        if (!ctx.rateable(k.skillId)) return fail("One of those skills cannot be asked for: it is retired, or it has sub-skills (choose one of them).");
        const had = r.skills.find((x) => x.skillId === k.skillId);
        if (had) { had.target = k.target; had.mandatory = !!k.mandatory; }
        else r.skills.push({ skillId: k.skillId, target: k.target, mandatory: !!k.mandatory });
      }
      return { ok: true, setup: s };
    }
    case "removeSkill": {
      const r = role(op.roleId);
      if (!r) return fail("That role is no longer there.");
      r.skills = r.skills.filter((k) => k.skillId !== op.skillId);
      return { ok: true, setup: s };
    }
    case "setNeed": {
      const n = op.need;
      if (!ctx.rateable(n.skillId)) return fail("That skill cannot be asked for: it is retired, or it has sub-skills (choose one of them).");
      if (!level(n.minLevel)) return fail("A level from 1 to 5.");
      if (!Number.isInteger(n.headcount) || n.headcount < 1 || n.headcount > 500) return fail("How many people: a whole number from 1 to 500.");
      const next: SetupNeed = { skillId: n.skillId, minLevel: n.minLevel, headcount: n.headcount, note: (n.note ?? "").trim().slice(0, 300) };
      const i = s.needs.findIndex((x) => x.skillId === n.skillId);
      if (i >= 0) s.needs[i] = next; else s.needs.push(next);
      s.dismissed = s.dismissed.filter((id) => id !== n.skillId);
      return { ok: true, setup: s };
    }
    case "removeNeed": {
      s.needs = s.needs.filter((n) => n.skillId !== op.skillId);
      // one the roles imply would come straight back: keep it off the list
      if (op.implied && !s.dismissed.includes(op.skillId)) s.dismissed.push(op.skillId);
      return { ok: true, setup: s };
    }
    case "restoreNeed": {
      s.dismissed = s.dismissed.filter((id) => id !== op.skillId);
      return { ok: true, setup: s };
    }
    case "setExtras": {
      if (!ctx.people.has(op.employeeId)) return fail("Only people who report to this team's manager can be asked for skills here.");
      if (!op.skills.length) return fail("Choose at least one skill.");
      for (const k of op.skills) {
        if (!level(k.target)) return fail("A level from 1 to 5.");
        if (!ctx.rateable(k.skillId)) return fail("One of those skills cannot be asked for: it is retired, or it has sub-skills (choose one of them).");
        const had = s.extras.find((x) => x.employeeId === op.employeeId && x.skillId === k.skillId);
        // a note given here replaces the old one; none given keeps it
        const note = op.note != null ? op.note.trim().slice(0, 300) : had?.note ?? "";
        if (had) { had.target = k.target; had.mandatory = !!k.mandatory; had.note = note; }
        else s.extras.push({ employeeId: op.employeeId, skillId: k.skillId, target: k.target, mandatory: !!k.mandatory, note });
      }
      return { ok: true, setup: s };
    }
    case "removeExtra": {
      s.extras = s.extras.filter((x) => !(x.employeeId === op.employeeId && x.skillId === op.skillId));
      return { ok: true, setup: s };
    }
  }
}

/** Drops what no longer exists: people who left or moved to another manager, skills that were retired. */
export function sanitize(setup: TeamSetup, ctx: SetupContext): TeamSetup {
  const s = clone(setup);
  for (const r of s.roles) {
    r.members = [...new Set(r.members)].filter((id) => ctx.people.has(id));
    const seen = new Set<string>();
    r.skills = r.skills.filter((k) => ctx.rateable(k.skillId) && !seen.has(k.skillId) && !!seen.add(k.skillId));
  }
  const seen = new Set<string>();
  s.needs = s.needs.filter((n) => ctx.rateable(n.skillId) && !seen.has(n.skillId) && !!seen.add(n.skillId));
  s.dismissed = [...new Set(s.dismissed)].filter((id) => !seen.has(id));
  const pairs = new Set<string>();
  s.extras = s.extras.filter((x) => ctx.people.has(x.employeeId) && ctx.rateable(x.skillId) && !pairs.has(`${x.employeeId}|${x.skillId}`) && !!pairs.add(`${x.employeeId}|${x.skillId}`));
  return s;
}

// ---- what differs between what is in force and the draft ------------------------------------

export type Change =
  | { key: string; kind: "role_added"; roleId: string; role: string; members: number; skills: number }
  | { key: string; kind: "role_removed"; roleId: string; role: string; members: number; skills: number }
  | { key: string; kind: "role_renamed"; roleId: string; role: string; from: string }
  | { key: string; kind: "role_described"; roleId: string; role: string }
  | { key: string; kind: "role_coloured"; roleId: string; role: string; from: string; color: string }
  | { key: string; kind: "roles_reordered" }
  | { key: string; kind: "member_added" | "member_removed"; roleId: string; role: string; employeeId: string }
  | { key: string; kind: "skill_added" | "skill_removed"; roleId: string; role: string; skillId: string; target: number; mandatory: boolean }
  | { key: string; kind: "skill_changed"; roleId: string; role: string; skillId: string; from: { target: number; mandatory: boolean }; target: number; mandatory: boolean }
  | { key: string; kind: "need_added" | "need_removed"; skillId: string; minLevel: number; headcount: number }
  | { key: string; kind: "need_changed"; skillId: string; from: SetupNeed; minLevel: number; headcount: number }
  | { key: string; kind: "need_dismissed" | "need_restored"; skillId: string }
  | { key: string; kind: "extra_added" | "extra_removed"; employeeId: string; skillId: string; target: number; mandatory: boolean }
  | { key: string; kind: "extra_changed"; employeeId: string; skillId: string; from: SetupExtra; target: number; mandatory: boolean };

/** Every difference between two setups, one line each. Empty = the same. */
export function diffSetup(live: TeamSetup, draft: TeamSetup): Change[] {
  const out: Change[] = [];
  const liveRoles = new Map(live.roles.map((r) => [r.id, r]));
  const draftRoles = new Map(draft.roles.map((r) => [r.id, r]));
  for (const r of live.roles) {
    if (!draftRoles.has(r.id)) out.push({ key: `role_removed:${r.id}`, kind: "role_removed", roleId: r.id, role: r.name, members: r.members.length, skills: r.skills.length });
  }
  for (const r of draft.roles) {
    const was = liveRoles.get(r.id);
    if (!was) out.push({ key: `role_added:${r.id}`, kind: "role_added", roleId: r.id, role: r.name, members: r.members.length, skills: r.skills.length });
    else {
      if (was.name !== r.name) out.push({ key: `role_renamed:${r.id}`, kind: "role_renamed", roleId: r.id, role: r.name, from: was.name });
      if (was.description !== r.description) out.push({ key: `role_described:${r.id}`, kind: "role_described", roleId: r.id, role: r.name });
      if ((was.color || "") !== (r.color || "")) out.push({ key: `role_coloured:${r.id}`, kind: "role_coloured", roleId: r.id, role: r.name, from: was.color || "", color: r.color || "" });
    }
    const hadMembers = new Set(was?.members ?? []);
    for (const id of r.members) if (!hadMembers.has(id)) out.push({ key: `member_added:${r.id}:${id}`, kind: "member_added", roleId: r.id, role: r.name, employeeId: id });
    const hasMembers = new Set(r.members);
    for (const id of was?.members ?? []) if (!hasMembers.has(id)) out.push({ key: `member_removed:${r.id}:${id}`, kind: "member_removed", roleId: r.id, role: r.name, employeeId: id });
    const hadSkills = new Map((was?.skills ?? []).map((k) => [k.skillId, k]));
    for (const k of r.skills) {
      const h = hadSkills.get(k.skillId);
      if (!h) out.push({ key: `skill_added:${r.id}:${k.skillId}`, kind: "skill_added", roleId: r.id, role: r.name, skillId: k.skillId, target: k.target, mandatory: k.mandatory });
      else if (h.target !== k.target || h.mandatory !== k.mandatory) out.push({ key: `skill_changed:${r.id}:${k.skillId}`, kind: "skill_changed", roleId: r.id, role: r.name, skillId: k.skillId, from: { target: h.target, mandatory: h.mandatory }, target: k.target, mandatory: k.mandatory });
    }
    const hasSkills = new Set(r.skills.map((k) => k.skillId));
    for (const k of was?.skills ?? []) if (!hasSkills.has(k.skillId)) out.push({ key: `skill_removed:${r.id}:${k.skillId}`, kind: "skill_removed", roleId: r.id, role: r.name, skillId: k.skillId, target: k.target, mandatory: k.mandatory });
  }
  // the order of the roles both have
  const both = (list: SetupRole[], other: Map<string, SetupRole>) => list.filter((r) => other.has(r.id)).map((r) => r.id).join("|");
  if (both(live.roles, draftRoles) !== both(draft.roles, liveRoles)) out.push({ key: "roles_reordered", kind: "roles_reordered" });

  const liveNeeds = new Map(live.needs.map((n) => [n.skillId, n]));
  const draftNeeds = new Map(draft.needs.map((n) => [n.skillId, n]));
  for (const n of draft.needs) {
    const was = liveNeeds.get(n.skillId);
    if (!was) out.push({ key: `need_added:${n.skillId}`, kind: "need_added", skillId: n.skillId, minLevel: n.minLevel, headcount: n.headcount });
    else if (was.minLevel !== n.minLevel || was.headcount !== n.headcount || was.note !== n.note) out.push({ key: `need_changed:${n.skillId}`, kind: "need_changed", skillId: n.skillId, from: was, minLevel: n.minLevel, headcount: n.headcount });
  }
  for (const n of live.needs) if (!draftNeeds.has(n.skillId)) out.push({ key: `need_removed:${n.skillId}`, kind: "need_removed", skillId: n.skillId, minLevel: n.minLevel, headcount: n.headcount });
  const wasOff = new Set(live.dismissed), isOff = new Set(draft.dismissed);
  for (const id of draft.dismissed) if (!wasOff.has(id)) out.push({ key: `need_dismissed:${id}`, kind: "need_dismissed", skillId: id });
  for (const id of live.dismissed) if (!isOff.has(id)) out.push({ key: `need_restored:${id}`, kind: "need_restored", skillId: id });

  const pair = (x: SetupExtra) => `${x.employeeId}:${x.skillId}`;
  const liveExtras = new Map((live.extras ?? []).map((x) => [pair(x), x]));
  const draftExtras = new Map((draft.extras ?? []).map((x) => [pair(x), x]));
  for (const x of draft.extras ?? []) {
    const was = liveExtras.get(pair(x));
    if (!was) out.push({ key: `extra_added:${pair(x)}`, kind: "extra_added", employeeId: x.employeeId, skillId: x.skillId, target: x.target, mandatory: x.mandatory });
    else if (was.target !== x.target || was.mandatory !== x.mandatory || was.note !== x.note) out.push({ key: `extra_changed:${pair(x)}`, kind: "extra_changed", employeeId: x.employeeId, skillId: x.skillId, from: was, target: x.target, mandatory: x.mandatory });
  }
  for (const x of live.extras ?? []) if (!draftExtras.has(pair(x))) out.push({ key: `extra_removed:${pair(x)}`, kind: "extra_removed", employeeId: x.employeeId, skillId: x.skillId, target: x.target, mandatory: x.mandatory });
  return out;
}

/** Takes one change back: that part of the draft becomes what is in force again. */
export function revertChange(live: TeamSetup, draft: TeamSetup, key: string, ctx: SetupContext): Applied {
  const change = diffSetup(live, draft).find((c) => c.key === key);
  if (!change) return { ok: true, setup: draft }; // already gone
  const s = clone(draft);
  const liveRole = (id: string) => live.roles.find((r) => r.id === id);
  const role = (id: string) => s.roles.find((r) => r.id === id);
  switch (change.kind) {
    case "role_added":
      s.roles = s.roles.filter((r) => r.id !== change.roleId);
      break;
    case "role_removed": {
      const was = liveRole(change.roleId)!;
      const bad = checkName(s, was.name);
      if (bad) return fail(`“${was.name}” cannot come back: another role has that name now. Rename it first.`);
      const at = Math.min(live.roles.findIndex((r) => r.id === was.id), s.roles.length);
      s.roles.splice(Math.max(0, at), 0, { ...was, members: was.members.filter((id) => ctx.people.has(id)), skills: was.skills.filter((k) => ctx.rateable(k.skillId)).map((k) => ({ ...k })) });
      break;
    }
    case "role_renamed": {
      const was = liveRole(change.roleId)!;
      if (checkName(s, was.name, was.id)) return fail(`It cannot be called “${was.name}” again: another role has that name now.`);
      role(change.roleId)!.name = was.name;
      break;
    }
    case "role_described":
      role(change.roleId)!.description = liveRole(change.roleId)!.description;
      break;
    case "role_coloured":
      role(change.roleId)!.color = liveRole(change.roleId)!.color;
      break;
    case "roles_reordered": {
      const order = new Map(live.roles.map((r, i) => [r.id, i]));
      s.roles.sort((a, b) => (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6));
      break;
    }
    case "member_added": {
      if (rolesOfPerson(s, change.employeeId).length <= 1) return fail("That would leave them in no role at all. Take back their removal from the other role first.");
      const r = role(change.roleId)!;
      r.members = r.members.filter((id) => id !== change.employeeId);
      break;
    }
    case "member_removed":
      if (ctx.people.has(change.employeeId)) role(change.roleId)!.members.push(change.employeeId);
      break;
    case "skill_added": {
      const r = role(change.roleId)!;
      r.skills = r.skills.filter((k) => k.skillId !== change.skillId);
      break;
    }
    case "skill_removed":
      role(change.roleId)!.skills.push({ skillId: change.skillId, target: change.target, mandatory: change.mandatory });
      break;
    case "skill_changed": {
      const k = role(change.roleId)!.skills.find((x) => x.skillId === change.skillId)!;
      k.target = change.from.target;
      k.mandatory = change.from.mandatory;
      break;
    }
    case "need_added":
      s.needs = s.needs.filter((n) => n.skillId !== change.skillId);
      break;
    case "need_removed":
      s.needs.push({ ...live.needs.find((n) => n.skillId === change.skillId)! });
      s.dismissed = s.dismissed.filter((id) => id !== change.skillId);
      break;
    case "need_changed":
      s.needs = s.needs.map((n) => (n.skillId === change.skillId ? { ...change.from } : n));
      break;
    case "need_dismissed":
      s.dismissed = s.dismissed.filter((id) => id !== change.skillId);
      break;
    case "need_restored":
      if (!s.dismissed.includes(change.skillId) && !s.needs.some((n) => n.skillId === change.skillId)) s.dismissed.push(change.skillId);
      break;
    case "extra_added":
      s.extras = s.extras.filter((x) => !(x.employeeId === change.employeeId && x.skillId === change.skillId));
      break;
    case "extra_removed":
      if (ctx.people.has(change.employeeId)) s.extras.push({ ...live.extras.find((x) => x.employeeId === change.employeeId && x.skillId === change.skillId)! });
      break;
    case "extra_changed":
      s.extras = s.extras.map((x) => (x.employeeId === change.employeeId && x.skillId === change.skillId ? { ...change.from } : x));
      break;
  }
  return { ok: true, setup: s };
}

/** Whether a whole setup can be put in force; the first thing that is wrong, else null. */
export function validateSetup(setup: TeamSetup, ctx: SetupContext): string | null {
  const ids = new Set<string>();
  for (const r of setup.roles) {
    if (!r.id || ids.has(r.id)) return "Two roles got mixed up. Discard the changes and try again.";
    ids.add(r.id);
    const bad = checkName(setup, r.name, r.id);
    if (bad) return bad;
    if (r.color && !isTint(r.color)) return `“${r.name}” has a colour that is not one of the tints offered.`;
    if (r.members.some((id) => !ctx.people.has(id))) return `Someone in “${r.name}” no longer reports to this team's manager. Open the page again: they are taken out of the draft.`;
    for (const k of r.skills) {
      if (!level(k.target)) return `“${r.name}” asks for a level that is not 1 to 5.`;
      if (!ctx.rateable(k.skillId)) return `“${r.name}” asks for a skill that was retired. Open the page again: it is taken out of the draft.`;
    }
  }
  for (const n of setup.needs) {
    if (!level(n.minLevel) || !Number.isInteger(n.headcount) || n.headcount < 1) return "A team need has a level or a number of people that is not valid.";
    if (!ctx.rateable(n.skillId)) return "A team need is for a skill that was retired. Open the page again: it is taken out of the draft.";
  }
  for (const x of setup.extras ?? []) {
    if (!ctx.people.has(x.employeeId)) return "A skill is asked of someone who no longer reports to this team's manager. Open the page again: it is taken out of the draft.";
    if (!level(x.target)) return "A skill asked of one person has a level that is not 1 to 5.";
    if (!ctx.rateable(x.skillId)) return "A skill asked of one person was retired. Open the page again: it is taken out of the draft.";
  }
  return null;
}
