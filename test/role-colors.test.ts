// A role's colour (src/lib/role-colors.ts): always a soft tint from one list, a different
// one for each role of a team unless the manager chose otherwise.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLE_TINTS, isTint, nextTint, tintColor, tintName, tintsFor } from "../src/lib/role-colors.ts";
import { applyOp, diffSetup, emptySetup, revertChange, validateSetup, type SetupContext, type SetupOp, type TeamSetup } from "../src/lib/team-setup.ts";

test("every colour offered is a tint: one lightness, a low strength, only the hue differs", () => {
  assert.ok(ROLE_TINTS.length >= 10, "enough colours for the roles of one team");
  assert.equal(new Set(ROLE_TINTS.map((t) => t.key)).size, ROLE_TINTS.length);
  assert.equal(new Set(ROLE_TINTS.map((t) => t.name)).size, ROLE_TINTS.length);
  for (const t of ROLE_TINTS) {
    const m = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(tintColor(t.key));
    assert.ok(m, `${t.key} is an oklch colour`);
    assert.equal(Number(m[1]), 0.74, `${t.key}: every tint has the same lightness`);
    assert.ok(Number(m[2]) <= 0.1, `${t.key}: nothing bright (strength ${m[2]})`);
  }
  // and it is only ever laid thinly over the page: no class paints the colour at full strength on a surface
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  for (const cls of ["tint-band", "tint-chip"]) {
    const rule = new RegExp(`\\.${cls} \\{[^}]*background-color: color-mix\\(in oklab, var\\(--tint\\) (\\d+)%`).exec(css);
    assert.ok(rule, `${cls} mixes the tint into the background`);
    assert.ok(Number(rule[1]) <= 25, `${cls} uses at most a quarter of the colour`);
  }
});

test("a role without a colour takes the first one its team does not use; a chosen colour is kept", () => {
  assert.equal(nextTint([]), ROLE_TINTS[0].key);
  assert.equal(nextTint([ROLE_TINTS[0].key, ROLE_TINTS[2].key]), ROLE_TINTS[1].key);
  assert.equal(nextTint(["", null, undefined, "#ff0000"]), ROLE_TINTS[0].key, "what is not a tint does not count as used");
  // all used once, one used twice: the least used comes next
  const all = ROLE_TINTS.map((t) => t.key);
  assert.equal(nextTint([...all, all[0]]), all[1]);

  const tints = tintsFor([{ id: "a", color: "" }, { id: "b", color: "mint" }, { id: "c" }, { id: "d", color: "not-a-colour" }]);
  assert.equal(tints.get("b"), "mint");
  assert.equal(new Set(tints.values()).size, 4, "four roles, four colours");
  assert.ok([...tints.values()].every(isTint));
  assert.equal(tintName("mint"), "Mint");
  assert.equal(tintName("nothing"), "");
});

const ctx: SetupContext = { people: new Set(["bob"]), rateable: () => true };
const apply = (s: TeamSetup, op: SetupOp) => { const r = applyOp(s, op, ctx); assert.ok(r.ok, r.ok ? "" : r.error); return r.setup; };

test("a manager's roles: each new one gets its own colour, the manager can choose another, only a tint is accepted", () => {
  let s = apply(emptySetup(), { op: "addRole", id: "sre", name: "SRE" });
  s = apply(s, { op: "addRole", id: "desk", name: "Service desk" });
  s = apply(s, { op: "addRole", id: "lead", name: "Team lead", color: "rose" });
  const [sre, desk, lead] = s.roles;
  assert.ok(isTint(sre!.color) && isTint(desk!.color));
  assert.notEqual(sre!.color, desk!.color, "two roles of a team do not start with the same colour");
  assert.equal(lead!.color, "rose");

  const live = s;
  const draft = apply(live, { op: "updateRole", roleId: "sre", name: "SRE", color: "lilac" });
  assert.equal(draft.roles[0]!.color, "lilac");
  // a change of colour is a draft like any other: one line in Review, and it can be taken back
  const changes = diffSetup(live, draft);
  assert.deepEqual(changes.map((c) => c.key), ["role_coloured:sre"]);
  const back = revertChange(live, draft, "role_coloured:sre", ctx);
  assert.ok(back.ok);
  assert.deepEqual(diffSetup(live, back.setup), []);

  for (const bad of ["#ff0000", "red", "oklch(0.6 0.3 20)"]) {
    const r = applyOp(live, { op: "updateRole", roleId: "sre", name: "SRE", color: bad }, ctx);
    assert.equal(r.ok, false, `${bad} is refused`);
    const n = applyOp(live, { op: "addRole", id: "x", name: "Another", color: bad }, ctx);
    assert.equal(n.ok, false, `${bad} is refused for a new role`);
  }
  assert.equal(validateSetup(draft, ctx), null);
  assert.match(validateSetup({ ...draft, roles: [{ ...draft.roles[0]!, color: "#ff0000" }] }, ctx) ?? "", /colour/);
  // renaming keeps the colour
  assert.equal(apply(draft, { op: "updateRole", roleId: "sre", name: "Reliability" }).roles[0]!.color, "lilac");
});
