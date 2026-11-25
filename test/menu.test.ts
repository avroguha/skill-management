// The menu: one description of where everything is. These tests hold it to what makes it
// obvious: every entry says what is behind it, a page's sections are a sub menu with an
// address each, and every "I want to ..." line leads to a page the person can open.
import test from "node:test";
import assert from "node:assert/strict";
import { buildMenu, locate, tasksFor, SETTINGS_SECTIONS, TEAM_SECTIONS, type MenuFor } from "../src/lib/menu.ts";

const member: MenuFor = { hasProfile: true, isManager: false, canSeeTeams: false, isAdmin: false };
const manager: MenuFor = { hasProfile: true, isManager: true, canSeeTeams: true, isAdmin: false, waiting: 9 };
const leader: MenuFor = { hasProfile: true, isManager: false, canSeeTeams: true, isAdmin: false };
const admin: MenuFor = { hasProfile: false, isManager: false, canSeeTeams: true, isAdmin: true, draftSkills: 2 };
const everyone = { member, manager, leader, admin };
const labels = (f: MenuFor) => buildMenu(f).flatMap((g) => g.items.map((i) => i.label));

test("the first group is called Menu and every group has a heading", () => {
  for (const f of Object.values(everyone)) {
    const groups = buildMenu(f);
    assert.equal(groups[0].label, "Menu");
    assert.equal(groups[0].items[0].href, "/");
    for (const g of groups) { assert.ok(g.label.trim(), "a heading"); assert.ok(g.items.length, `${g.label} is not empty`); }
    assert.equal(new Set(groups.map((g) => g.label)).size, groups.length, "no heading twice");
  }
});

test("every entry and every sub menu entry says what is behind it", () => {
  for (const item of buildMenu({ ...manager, isAdmin: true }).flatMap((g) => g.items)) {
    assert.ok(item.hint.length >= 8 && item.hint.length <= 34, `${item.label}: a short second line, got "${item.hint}"`);
    for (const s of item.sub ?? []) assert.ok(s.hint.length >= 8, `${item.label} › ${s.label} has a hint`);
  }
});

test("each person sees what is theirs, and nothing they cannot open", () => {
  assert.deepEqual(labels(member), ["Home", "My skills", "Roles", "Skills", "Help"]);
  assert.deepEqual(labels(manager), ["Home", "My skills", "My team", "Insights", "People", "Org chart", "Roles", "Skills", "Help"]);
  assert.deepEqual(labels(leader), ["Home", "My skills", "Teams", "Insights", "People", "Org chart", "Roles", "Skills", "Help"]);
  assert.deepEqual(labels(admin), ["Home", "Teams", "Insights", "People", "Org chart", "Roles", "Skills", "Settings", "Help"]);
});

test("a team's sections and the settings sections are sub menus, each with its own address", () => {
  const items = buildMenu({ ...manager, isAdmin: true, draftSkills: 2 }).flatMap((g) => g.items);
  const team = items.find((i) => i.key === "team")!;
  assert.deepEqual(team.sub!.map((s) => s.label), ["To confirm", "People", "Team needs", "Skills grid"]);
  assert.deepEqual(team.sub!.map((s) => s.href), TEAM_SECTIONS.map((s) => `/team?tab=${s.key}`));
  assert.equal(team.open, true, "a manager's team is open from the start: nobody has to find the sections");
  assert.equal(buildMenu(admin).flatMap((g) => g.items).find((i) => i.key === "team")!.open, false, "Teams, for someone without a team, opens when they go there");
  assert.equal(team.sub![0].badge, 9);
  assert.equal(team.sub![0].attention, true);
  const settings = items.find((i) => i.key === "settings")!;
  assert.deepEqual(settings.sub!.map((s) => s.href), SETTINGS_SECTIONS.map((s) => s.href));
  assert.equal(settings.sub!.find((s) => s.href === "/settings/skills")!.badge, 2);
  for (const i of items) if (i.sub) assert.equal(new Set(i.sub.map((s) => s.href)).size, i.sub.length);
  assert.ok(!items.some((i) => !i.sub && i.subParam), "a sub menu parameter only where there is a sub menu");
});

test("an address finds its place: entry and sub menu entry", () => {
  const groups = buildMenu({ ...manager, isAdmin: true });
  const at = (path: string, q: Record<string, string> = {}) => {
    const l = locate(groups, path, (n) => q[n] ?? null);
    return l ? [l.group.label, l.item.label, l.sub?.label ?? null] : null;
  };
  assert.deepEqual(at("/"), ["Menu", "Home", null]);
  assert.deepEqual(at("/team", { tab: "needs" }), ["My work", "My team", "Team needs"]);
  assert.deepEqual(at("/team"), ["My work", "My team", null]);
  assert.deepEqual(at("/people/abc"), ["The organisation", "People", null]);
  assert.deepEqual(at("/settings"), ["Administration", "Settings", "Overview"]);
  assert.deepEqual(at("/settings/servicenow/groups/x"), ["Administration", "Settings", "ServiceNow"]);
  assert.deepEqual(at("/settings/skills"), ["Administration", "Settings", "Skills"]);
  assert.deepEqual(at("/skills/abc"), ["Roles and skills", "Skills", null]);
  assert.equal(at("/change-password"), null);
});

test("every 'I want to' line leads to a page that person has in their menu", () => {
  for (const [who, f] of Object.entries(everyone)) {
    const groups = buildMenu(f);
    const tasks = tasksFor(f);
    assert.ok(tasks.length >= 4, `${who} has things to do`);
    assert.equal(new Set(tasks.map((t) => t.key)).size, tasks.length);
    for (const t of tasks) {
      const [path, query = ""] = t.href.split("?");
      const q = new URLSearchParams(query);
      const l = locate(groups, path, (n) => q.get(n));
      assert.ok(l, `${who}: "${t.text}" leads to ${t.href}, which is not in their menu`);
      if (query) assert.ok(l.sub, `${who}: "${t.text}" names a section that exists`);
      assert.match(t.text, /^[A-Z]/);
    }
  }
  assert.ok(!tasksFor(member).some((t) => t.href.startsWith("/team") || t.href.startsWith("/settings")));
  assert.ok(tasksFor(manager).some((t) => t.href === "/team?tab=confirm"));
});
