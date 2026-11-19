// Who has which role, on a small organisation:
//
//   tia (head of Operations)          chose IT Operations for everyone below
//   ├─ ann (Service Operations)       chose nothing
//   │   ├─ bob (Service Desk manager) chose nothing
//   │   │   ├─ cat
//   │   │   └─ dan                    has a role of his own: SRE
//   │   └─ eve (Batch manager)        chose Batch Operations for her team
//   │       └─ fay
//   └─ gus (ITSM)                     chose ServiceNow for his direct reports only
//       ├─ hal (CMDB manager)         chose nothing
//       │   └─ ivy
//       └─ jo
//   kim (nobody above, nobody below)
import test from "node:test";
import assert from "node:assert/strict";
import { resolveRoles, teamRoleReach, type RolePerson } from "../src/lib/team-roles.ts";

const p = (id: string, managerId: string | null, o: Partial<RolePerson> = {}): RolePerson => ({ id, managerId, roleId: null, ...o });
const ORG: RolePerson[] = [
  p("tia", null, { teamRoleId: "itops", teamRoleCascade: true }),
  p("ann", "tia"),
  p("bob", "ann"), p("cat", "bob"), p("dan", "bob", { roleId: "sre" }),
  p("eve", "ann", { teamRoleId: "batch" }), p("fay", "eve"),
  p("gus", "tia", { teamRoleId: "snow" }),
  p("hal", "gus"), p("ivy", "hal"), p("jo", "gus"),
  p("kim", null),
];
const role = (people: RolePerson[], id: string) => resolveRoles(people).get(id);

test("a role chosen for everyone below reaches every level, through managers who chose nothing", () => {
  assert.deepEqual(role(ORG, "ann"), { roleId: "itops", from: "tia" });
  assert.deepEqual(role(ORG, "bob"), { roleId: "itops", from: "tia" });
  assert.deepEqual(role(ORG, "cat"), { roleId: "itops", from: "tia" });
});

test("the manager who chose a role holds it too", () => {
  assert.deepEqual(role(ORG, "tia"), { roleId: "itops", from: "tia" });
  assert.deepEqual(role(ORG, "eve"), { roleId: "batch", from: "eve" });
});

test("a manager below changes it for their own team", () => {
  assert.deepEqual(role(ORG, "fay"), { roleId: "batch", from: "eve" });
  assert.deepEqual(role(ORG, "jo"), { roleId: "snow", from: "gus" });
});

test("a role chosen for direct reports only stops there: further down, the one from above applies", () => {
  assert.deepEqual(role(ORG, "hal"), { roleId: "snow", from: "gus" }, "hal reports to gus");
  assert.deepEqual(role(ORG, "ivy"), { roleId: "itops", from: "tia" }, "ivy is two below gus, whose choice was for direct reports");
});

test("nobody is forced: a role of one's own wins", () => {
  assert.deepEqual(role(ORG, "dan"), { roleId: "sre", from: null });
  const own = ORG.map((x) => (x.id === "eve" ? { ...x, roleId: "sre" } : x));
  assert.deepEqual(role(own, "eve"), { roleId: "sre", from: null }, "a manager with a role of her own keeps it");
  assert.deepEqual(role(own, "fay"), { roleId: "batch", from: "eve" }, "her team still follows what she chose for it");
});

test("no role reaches someone with nobody above, and a loop in the reporting lines ends", () => {
  assert.deepEqual(role(ORG, "kim"), { roleId: null, from: null });
  const loop = [p("a", "b"), p("b", "a")];
  assert.deepEqual(role(loop, "a"), { roleId: null, from: null });
});

test("who a choice reaches: direct reports, or everyone below until a manager who chose another", () => {
  const ids = (x: RolePerson[]) => x.map((e) => e.id).sort();
  const direct = teamRoleReach(ORG, "tia", false);
  assert.deepEqual(ids(direct.follow), ["ann"], "gus chose his own, so he does not follow");
  const all = teamRoleReach(ORG, "tia", true);
  assert.deepEqual(ids(all.follow), ["ann", "bob", "cat", "ivy"]);
  assert.deepEqual(ids(all.own), ["dan"], "people with a role of their own are listed apart: they keep it unless replaced");
  const bob = teamRoleReach(ORG, "bob", false);
  assert.deepEqual(ids(bob.follow), ["cat"]);
  assert.deepEqual(ids(bob.own), ["dan"]);
});
