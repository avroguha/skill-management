// A team's roles and needs (src/lib/team-setup.ts): what a manager may do, that every change
// is a draft with a line in Review, that each line can be taken back, and that confirming
// puts exactly the draft in force.
//
//   ann's team: bob, cat, dee report to her; gus reports to someone else
import test from "node:test";
import assert from "node:assert/strict";
import { applyOp, diffSetup, emptySetup, revertChange, rolesOfPerson, sanitize, validateSetup, type SetupContext, type SetupOp, type TeamSetup } from "../src/lib/team-setup.ts";

const ctx: SetupContext = { people: new Set(["bob", "cat", "dee"]), rateable: (id) => ["k8s", "ec2", "sql", "lead"].includes(id) };

/** Applies operations in turn; every one must be accepted. */
function build(from: TeamSetup, ...ops: SetupOp[]): TeamSetup {
  let s = from;
  for (const op of ops) {
    const r = applyOp(s, op, ctx);
    assert.ok(r.ok, `${op.op} was refused: ${r.ok ? "" : r.error}`);
    s = r.setup;
  }
  return s;
}
const refused = (s: TeamSetup, op: SetupOp) => {
  const r = applyOp(s, op, ctx);
  assert.equal(r.ok, false, `${op.op} should have been refused`);
  return r.ok ? "" : r.error;
};

const base = () => build(emptySetup(),
  { op: "addRole", id: "sre", name: "SRE", description: "Keeps production healthy" },
  { op: "addRole", id: "desk", name: "Service desk" },
  { op: "addMembers", roleId: "sre", employeeIds: ["bob", "cat"] },
  { op: "addMembers", roleId: "desk", employeeIds: ["dee"] },
  { op: "setSkills", roleId: "sre", skills: [{ skillId: "k8s", target: 3, mandatory: true }, { skillId: "ec2", target: 2, mandatory: false }] },
  { op: "setNeed", need: { skillId: "k8s", minLevel: 3, headcount: 2, note: "on-call" } },
);

test("a manager makes as many roles as the team needs; a name is unique within the team, whatever the case or spacing", () => {
  const s = base();
  assert.deepEqual(s.roles.map((r) => r.name), ["SRE", "Service desk"]);
  assert.match(refused(s, { op: "addRole", id: "x", name: " sre " }), /already has a role called “SRE”/);
  assert.match(refused(s, { op: "addRole", id: "x", name: "service-desk" }), /already has a role/);
  assert.match(refused(s, { op: "addRole", id: "x", name: "A" }), /Name the role/);
  assert.match(refused(s, { op: "updateRole", roleId: "desk", name: "SRE" }), /already has a role/);
  const renamed = build(s, { op: "updateRole", roleId: "desk", name: "Service Desk", description: "First line" });
  assert.deepEqual([renamed.roles[1].name, renamed.roles[1].description], ["Service Desk", "First line"], "its own name in another spelling is fine");
});

test("a copy of a role starts with the same skills and nobody in it", () => {
  const s = build(base(), { op: "addRole", id: "sre2", name: "SRE (nights)", copyOf: "sre" });
  const copy = s.roles.find((r) => r.id === "sre2")!;
  assert.deepEqual(copy.skills, s.roles[0].skills);
  assert.deepEqual(copy.members, []);
  assert.equal(copy.description, "Keeps production healthy");
  copy.skills[0].target = 5;
  assert.equal(s.roles[0].skills[0].target, 3, "the copy is its own");
});

test("several people are added to a role in one go; a person can be in several roles", () => {
  const s = build(base(), { op: "addMembers", roleId: "desk", employeeIds: ["bob", "cat", "dee"] });
  assert.deepEqual(s.roles[1].members.sort(), ["bob", "cat", "dee"]);
  assert.deepEqual(rolesOfPerson(s, "bob").map((r) => r.id), ["sre", "desk"]);
  assert.deepEqual(s.roles[0].members, ["bob", "cat"], "adding to another role takes nobody out of the first");
  assert.match(refused(s, { op: "addMembers", roleId: "desk", employeeIds: ["gus"] }), /report to this team's manager/, "only the manager's own people");
});

test("a person cannot be taken out of the only role they are in; out of one of several they can", () => {
  const s = base();
  assert.match(refused(s, { op: "removeMember", roleId: "sre", employeeId: "bob" }), /only role they are in/);
  const two = build(s, { op: "addMembers", roleId: "desk", employeeIds: ["bob"] });
  const one = build(two, { op: "removeMember", roleId: "sre", employeeId: "bob" });
  assert.deepEqual(rolesOfPerson(one, "bob").map((r) => r.id), ["desk"]);
  assert.match(refused(one, { op: "removeMember", roleId: "desk", employeeId: "bob" }), /only role/, "and then not out of the last");
});

test("moving a person (a drag from one role to another) takes them out of the first and into the second", () => {
  const s = build(base(), { op: "moveMember", from: "sre", to: "desk", employeeId: "bob" });
  assert.deepEqual(s.roles.map((r) => r.members), [["cat"], ["dee", "bob"]]);
  // from "no role yet" (an empty from): simply added
  const fresh = build(emptySetup(), { op: "addRole", id: "a", name: "Alpha" }, { op: "moveMember", from: "", to: "a", employeeId: "dee" });
  assert.deepEqual(fresh.roles[0].members, ["dee"]);
  assert.deepEqual(build(s, { op: "moveMember", from: "desk", to: "desk", employeeId: "bob" }), s, "onto the role they are in: nothing happens");
});

test("a role's skills: added with a level, changed, and removed - must-haves like any other", () => {
  let s = build(base(), { op: "setSkills", roleId: "sre", skills: [{ skillId: "k8s", target: 4, mandatory: false }, { skillId: "sql", target: 1, mandatory: true }] });
  assert.deepEqual(s.roles[0].skills, [{ skillId: "k8s", target: 4, mandatory: false }, { skillId: "ec2", target: 2, mandatory: false }, { skillId: "sql", target: 1, mandatory: true }]);
  s = build(s, { op: "removeSkill", roleId: "sre", skillId: "sql" });
  assert.ok(!s.roles[0].skills.some((k) => k.skillId === "sql"), "a must-have is removed like any skill");
  assert.match(refused(s, { op: "setSkills", roleId: "sre", skills: [{ skillId: "k8s", target: 6, mandatory: true }] }), /level from 1 to 5/);
  assert.match(refused(s, { op: "setSkills", roleId: "sre", skills: [{ skillId: "retired-skill", target: 3, mandatory: true }] }), /cannot be asked for/, "only skills that are in the catalogue");
});

test("deleting a role leaves its people in their other roles, or in none", () => {
  const s = build(base(), { op: "addMembers", roleId: "desk", employeeIds: ["bob"] }, { op: "removeRole", roleId: "sre" });
  assert.deepEqual(s.roles.map((r) => r.id), ["desk"]);
  assert.deepEqual(rolesOfPerson(s, "bob").map((r) => r.id), ["desk"]);
  assert.deepEqual(rolesOfPerson(s, "cat"), [], "cat was only in SRE: back to no role yet");
});

test("team needs: every need can be changed or removed, and one the roles imply stays off the list once removed", () => {
  let s = build(base(), { op: "setNeed", need: { skillId: "k8s", minLevel: 4, headcount: 1, note: "" } });
  assert.deepEqual(s.needs, [{ skillId: "k8s", minLevel: 4, headcount: 1, note: "" }], "set again: changed, not added twice");
  s = build(s, { op: "removeNeed", skillId: "k8s" });
  assert.deepEqual([s.needs, s.dismissed], [[], []], "the manager's own need: simply gone");
  s = build(s, { op: "removeNeed", skillId: "ec2", implied: true });
  assert.deepEqual(s.dismissed, ["ec2"], "one from the roles: kept off the list");
  assert.deepEqual(build(s, { op: "restoreNeed", skillId: "ec2" }).dismissed, []);
  assert.deepEqual(build(s, { op: "setNeed", need: { skillId: "ec2", minLevel: 2, headcount: 1, note: "" } }).dismissed, [], "setting it by hand puts it back too");
  assert.match(refused(s, { op: "setNeed", need: { skillId: "k8s", minLevel: 0, headcount: 1, note: "" } }), /level from 1 to 5/);
  assert.match(refused(s, { op: "setNeed", need: { skillId: "k8s", minLevel: 3, headcount: 0, note: "" } }), /How many people/);
});

test("Review lists every change against what is in force, one line each", () => {
  const live = base();
  const draft = build(live,
    { op: "addRole", id: "lead", name: "Team lead" },
    { op: "addMembers", roleId: "lead", employeeIds: ["bob"] },
    { op: "removeMember", roleId: "sre", employeeId: "bob" },
    { op: "updateRole", roleId: "desk", name: "Front desk" },
    { op: "setSkills", roleId: "sre", skills: [{ skillId: "k8s", target: 4, mandatory: true }, { skillId: "sql", target: 2, mandatory: true }] },
    { op: "removeSkill", roleId: "sre", skillId: "ec2" },
    { op: "setNeed", need: { skillId: "sql", minLevel: 2, headcount: 1, note: "" } },
    { op: "removeNeed", skillId: "k8s" },
    { op: "removeNeed", skillId: "ec2", implied: true },
  );
  assert.deepEqual(diffSetup(live, draft).map((c) => c.key).sort(), [
    "member_added:lead:bob", "member_removed:sre:bob", "need_added:sql", "need_dismissed:ec2", "need_removed:k8s",
    "role_added:lead", "role_renamed:desk", "skill_added:sre:sql", "skill_changed:sre:k8s", "skill_removed:sre:ec2",
  ]);
  assert.deepEqual(diffSetup(live, live), [], "no change, no lines");
  assert.deepEqual(diffSetup(live, build(live, { op: "moveRole", roleId: "desk", by: -1 })).map((c) => c.kind), ["roles_reordered"]);
  assert.deepEqual(diffSetup(live, build(live, { op: "removeRole", roleId: "sre" })).map((c) => [c.kind, "members" in c ? c.members : 0]), [["role_removed", 2]]);
});

test("each line can be taken back on its own, and taking all of them back leaves nothing to confirm", () => {
  const live = base();
  let draft = build(live,
    { op: "addRole", id: "lead", name: "Team lead" },
    { op: "addMembers", roleId: "lead", employeeIds: ["cat"] },
    { op: "updateRole", roleId: "desk", name: "Front desk", description: "new" },
    { op: "setSkills", roleId: "sre", skills: [{ skillId: "k8s", target: 5, mandatory: false }] },
    { op: "removeSkill", roleId: "sre", skillId: "ec2" },
    { op: "removeNeed", skillId: "k8s" },
    { op: "removeNeed", skillId: "sql", implied: true },
    { op: "moveRole", roleId: "desk", by: -1 },
  );
  const back = (key: string) => {
    const r = revertChange(live, draft, key, ctx);
    assert.ok(r.ok, `${key}: ${r.ok ? "" : r.error}`);
    draft = r.setup;
    assert.ok(!diffSetup(live, draft).some((c) => c.key === key), `${key} is gone from the list`);
  };
  back("skill_changed:sre:k8s");
  assert.deepEqual(draft.roles.find((r) => r.id === "sre")!.skills.find((k) => k.skillId === "k8s"), { skillId: "k8s", target: 3, mandatory: true });
  back("skill_removed:sre:ec2");
  back("need_removed:k8s");
  assert.deepEqual(draft.needs, live.needs);
  back("need_dismissed:sql");
  back("role_renamed:desk");
  back("role_described:desk");
  back("roles_reordered");
  back("role_added:lead");
  assert.deepEqual(diffSetup(live, draft), [], "everything taken back: the draft is what is in force");
  assert.deepEqual(revertChange(live, draft, "role_added:lead", ctx), { ok: true, setup: draft }, "a line that is already gone is no error");
});

test("taking a change back is refused when it would break a rule, with what to do instead", () => {
  const live = base();
  // bob: added to Service desk, then taken out of SRE. Taking back the first would leave him in no role.
  const draft = build(live, { op: "addMembers", roleId: "desk", employeeIds: ["bob"] }, { op: "removeMember", roleId: "sre", employeeId: "bob" });
  const r = revertChange(live, draft, "member_added:desk:bob", ctx);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /no role at all/);
  const other = revertChange(live, draft, "member_removed:sre:bob", ctx);
  assert.ok(other.ok && revertChange(live, other.setup, "member_added:desk:bob", ctx).ok, "the other way round works");
  // a deleted role cannot come back while another role has taken its name
  const swapped = build(live, { op: "removeRole", roleId: "sre" }, { op: "addRole", id: "new", name: "SRE" });
  const no = revertChange(live, swapped, "role_removed:sre", ctx);
  assert.match(no.ok ? "" : no.error, /another role has that name now/);
});

test("people who left or moved and skills that were retired drop out of a setup; what is left can be confirmed", () => {
  const s = build(base(), { op: "setNeed", need: { skillId: "lead", minLevel: 2, headcount: 1, note: "" } });
  const later: SetupContext = { people: new Set(["bob", "dee"]), rateable: (id) => id !== "ec2" && id !== "lead" };
  assert.match(validateSetup(s, later) ?? "", /no longer reports/);
  const clean = sanitize(s, later);
  assert.deepEqual(clean.roles[0].members, ["bob"], "cat reports to someone else now");
  assert.deepEqual(clean.roles[0].skills.map((k) => k.skillId), ["k8s"], "EC2 was retired");
  assert.deepEqual(clean.needs.map((n) => n.skillId), ["k8s"]);
  assert.equal(validateSetup(clean, later), null);
  assert.equal(validateSetup(base(), ctx), null);
});

test("a manager asks one person for skills beyond their roles: a draft line each, changed in place, taken back, kept to the team", () => {
  const live = base();
  const s = build(live,
    { op: "setExtras", employeeId: "dee", skills: [{ skillId: "k8s", target: 3, mandatory: true }], note: " On-call from March " },
    { op: "setExtras", employeeId: "bob", skills: [{ skillId: "sql", target: 2, mandatory: false }] });
  assert.deepEqual(s.extras.map((x) => [x.employeeId, x.skillId, x.target, x.note]), [["dee", "k8s", 3, "On-call from March"], ["bob", "sql", 2, ""]]);
  assert.deepEqual(diffSetup(live, s).map((c) => c.key), ["extra_added:dee:k8s", "extra_added:bob:sql"]);

  // asked again: the level changes; no note given keeps the reason
  const again = build(s, { op: "setExtras", employeeId: "dee", skills: [{ skillId: "k8s", target: 4, mandatory: true }] });
  assert.deepEqual(again.extras.find((x) => x.employeeId === "dee"), { employeeId: "dee", skillId: "k8s", target: 4, mandatory: true, note: "On-call from March" });
  assert.equal(again.extras.length, 2, "no second line for the same person and skill");

  // only the team's own people, only skills that can be rated, levels 1-5
  assert.match(refused(s, { op: "setExtras", employeeId: "gus", skills: [{ skillId: "k8s", target: 3, mandatory: true }] }), /report to this team's manager/);
  assert.match(refused(s, { op: "setExtras", employeeId: "dee", skills: [{ skillId: "old", target: 3, mandatory: true }] }), /cannot be asked for/);
  assert.match(refused(s, { op: "setExtras", employeeId: "dee", skills: [{ skillId: "k8s", target: 6, mandatory: true }] }), /1 to 5/);

  // once in force: a change and a removal are lines of their own, and each can be taken back
  const changed = build(s, { op: "setExtras", employeeId: "dee", skills: [{ skillId: "k8s", target: 4, mandatory: false }] }, { op: "removeExtra", employeeId: "bob", skillId: "sql" });
  assert.deepEqual(diffSetup(s, changed).map((c) => c.kind).sort(), ["extra_changed", "extra_removed"]);
  const back = revertChange(s, changed, "extra_changed:dee:k8s", ctx);
  assert.ok(back.ok);
  const back2 = revertChange(s, back.ok ? back.setup : changed, "extra_removed:bob:sql", ctx);
  assert.ok(back2.ok);
  assert.deepEqual(diffSetup(s, back2.ok ? back2.setup : changed), [], "everything taken back: nothing left to confirm");

  // someone who moved to another manager drops out of the draft; what is left can be confirmed
  const later: SetupContext = { people: new Set(["bob", "cat"]), rateable: ctx.rateable };
  const clean = sanitize(s, later);
  assert.deepEqual(clean.extras.map((x) => x.employeeId), ["bob"]);
  assert.equal(validateSetup(clean, later), null);
  assert.match(validateSetup(s, later) ?? "", /no longer reports/);
});
