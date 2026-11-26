// Upgrading a database from before roles belonged to teams. Roles were one list for the whole
// organisation: a manager chose one for the team (optionally "for everyone below"), and a
// person could have one of their own. The upgrade (drizzle/0002 and 0003) turns that into
// roles of each team, keeping for every person the role that counted for them.
//
// The same rule exists in code for old data that arrives later (a version-1 import, an old
// backup): src/lib/legacy-roles.ts. Both are run on one organisation here and must agree.
//
//   tia (top)             chose "Ops" for everyone below
//   ├─ ann (manager)      chose "SRE" for her team
//   │   ├─ bob            follows ann's choice                      -> SRE, in ann's team
//   │   └─ cat            has "Analyst" of her own                  -> Analyst, in ann's team
//   ├─ dan (manager)      chose nothing                             -> Ops, in tia's team
//   │   ├─ eve            follows tia's choice, two levels up       -> Ops, in dan's team
//   │   └─ gus            has left                                  -> nothing
//   └─ oli (manager)      chose "SRE", not for everyone below       -> SRE, in tia's team (a manager holds the role they chose)
//       └─ pat (manager)  chose nothing                             -> SRE, in oli's team (oli is pat's direct manager)
//           └─ quin       oli's choice does not reach here; tia's does -> Ops, in pat's team
//   zed (nobody above, role "Ops" of his own)                       -> nothing: no team to have a role in
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { convertLegacyRoles, teamRoleId, type LegacyPerson } from "../src/lib/legacy-roles.ts";
import { ROLE_TINTS, isTint } from "../src/lib/role-colors.ts";

const dir = path.join(import.meta.dirname, "..", "drizzle");
const statements = (tag: string) => fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean);

const people: (LegacyPerson & { name: string })[] = [
  { id: "tia", name: "Tia", managerId: null, active: true, roleId: null, teamRoleId: "ops", teamRoleCascade: true },
  { id: "ann", name: "Ann", managerId: "tia", active: true, roleId: null, teamRoleId: "sre", teamRoleCascade: false },
  { id: "bob", name: "Bob", managerId: "ann", active: true, roleId: null },
  { id: "cat", name: "Cat", managerId: "ann", active: true, roleId: "ana" },
  { id: "dan", name: "Dan", managerId: "tia", active: true, roleId: null },
  { id: "eve", name: "Eve", managerId: "dan", active: true, roleId: null },
  { id: "gus", name: "Gus", managerId: "dan", active: false, roleId: "ops" },
  { id: "oli", name: "Oli", managerId: "tia", active: true, roleId: null, teamRoleId: "sre", teamRoleCascade: false },
  { id: "pat", name: "Pat", managerId: "oli", active: true, roleId: null },
  { id: "quin", name: "Quin", managerId: "pat", active: true, roleId: null },
  { id: "zed", name: "Zed", managerId: null, active: true, roleId: "ops" },
];
const roles = [{ id: "ops", name: "Ops", description: "Runs things" }, { id: "sre", name: "SRE", description: "" }, { id: "ana", name: "Analyst", description: "" }, { id: "unused", name: "Nobody has this", description: "" }];
const roleSkills = [
  { roleId: "ops", gradeId: null, skillId: "k1", target: 2, mandatory: true },
  { roleId: "ops", gradeId: "g1", skillId: "k1", target: 4, mandatory: true }, // a grade's own level: the level for every grade wins
  { roleId: "sre", gradeId: "g1", skillId: "k1", target: 3, mandatory: false }, // only per grade: the highest counts
  { roleId: "sre", gradeId: "g2", skillId: "k1", target: 5, mandatory: true },
  { roleId: "sre", gradeId: null, skillId: "k2", target: 3, mandatory: false },
  { roleId: "ana", gradeId: null, skillId: "k2", target: 1, mandatory: true },
];
const sort = <T,>(rows: T[]) => rows.map((r) => JSON.stringify(r)).sort();

test("in code: every person keeps the role that counted for them, as a role of their manager's team", () => {
  const c = convertLegacyRoles(people, roles, roleSkills);
  const of = (id: string) => c.members.filter((m) => m.employeeId === id).map((m) => { const r = c.roles.find((x) => x.id === m.roleId)!; return `${r.name} in ${r.managerId}'s team`; });
  assert.deepEqual(of("bob"), ["SRE in ann's team"]);
  assert.deepEqual(of("cat"), ["Analyst in ann's team"], "her own role wins over the team's");
  assert.deepEqual(of("dan"), ["Ops in tia's team"]);
  assert.deepEqual(of("eve"), ["Ops in dan's team"], "the choice made for everyone below reaches two levels down");
  assert.deepEqual(of("ann"), ["SRE in tia's team"], "a manager held the role they chose for their team");
  assert.deepEqual(of("pat"), ["SRE in oli's team"], "a direct manager's choice always reaches");
  assert.deepEqual(of("quin"), ["Ops in pat's team"], "oli's choice was not for everyone below; tia's was");
  assert.deepEqual([of("gus"), of("zed"), of("tia")], [[], [], []], "someone who left, and people with nobody above, are in no team's role");
  assert.equal(c.roles.filter((r) => r.name === "SRE").length, 3, "the same old role becomes one role per team that used it");
  assert.ok(!c.roles.some((r) => r.name === "Nobody has this"), "a role nobody had is not carried over");
  const skills = (managerId: string, roleId: string) => c.skills.filter((k) => k.roleId === teamRoleId(managerId, roleId)).map((k) => [k.skillId, k.target, k.mandatory]).sort();
  assert.deepEqual(skills("dan", "ops"), [["k1", 2, true]], "the level for every grade, not a grade's own");
  assert.deepEqual(skills("ann", "sre"), [["k1", 5, true], ["k2", 3, false]], "only per grade: the highest; a must-have when any grade said so");
});

test("the database upgrade does the same, moves suggested skills to requests, and removes the old tables", async () => {
  const db = new PGlite();
  await db.waitReady;
  for (const tag of ["0000_v2", "0001_team_roles"]) for (const stmt of statements(tag)) await db.exec(stmt);
  await db.exec(`
    insert into grade (id, name, rank) values ('g1', 'Junior', 1), ('g2', 'Senior', 2);
    insert into skill_category (id, name, sort) values ('c1', 'Cloud', 1);
    insert into skill (id, category_id, name, status, description) values ('k1', 'c1', 'Kubernetes', 'active', ''), ('k2', 'c1', 'SQL', 'active', ''), ('k3', 'c1', 'Quantum computing', 'draft', 'Suggested by Bob');
    insert into job_role (id, name, description) values ${roles.map((r) => `('${r.id}', '${r.name}', '${r.description}')`).join(", ")};
    insert into role_skill (id, role_id, grade_id, skill_id, target, mandatory) values
      ${roleSkills.map((k, i) => `('rs${i}', '${k.roleId}', ${k.gradeId ? `'${k.gradeId}'` : "null"}, '${k.skillId}', ${k.target}, ${k.mandatory})`).join(", ")};
    insert into employee (id, name, email, manager_id, active, role_id, team_role_id, team_role_cascade) values
      ${people.map((p) => `('${p.id}', '${p.name}', '${p.id}@avro.com', ${p.managerId ? `'${p.managerId}'` : "null"}, ${p.active}, ${p.roleId ? `'${p.roleId}'` : "null"}, ${p.teamRoleId ? `'${p.teamRoleId}'` : "null"}, ${!!p.teamRoleCascade})`).join(", ")};
    insert into rating (employee_id, skill_id, self_level, status) values ('bob', 'k1', 3, 'submitted');
    insert into team_need (id, manager_id, skill_id, min_level, headcount) values ('n1', 'ann', 'k1', 3, 2);
  `);
  // the migrator applies an upgrade in one transaction
  await db.transaction(async (tx) => {
    for (const tag of ["0002_team_roles_requests", "0003_drop_global_roles"]) for (const stmt of statements(tag)) await tx.exec(stmt);
  });

  const expected = convertLegacyRoles(people, roles, roleSkills);
  const got = {
    roles: (await db.query<{ id: string; manager_id: string; name: string; description: string }>(`select id, manager_id, name, description from team_role`)).rows.map((r) => ({ id: r.id, managerId: r.manager_id, name: r.name, description: r.description })),
    members: (await db.query<{ role_id: string; employee_id: string }>(`select role_id, employee_id from team_role_member`)).rows.map((r) => ({ roleId: r.role_id, employeeId: r.employee_id })),
    skills: (await db.query<{ role_id: string; skill_id: string; target: number; mandatory: boolean }>(`select role_id, skill_id, target, mandatory from team_role_skill`)).rows.map((r) => ({ roleId: r.role_id, skillId: r.skill_id, target: r.target, mandatory: r.mandatory })),
  };
  assert.deepEqual(sort(got.roles), sort(expected.roles));
  assert.deepEqual(sort(got.members), sort(expected.members));
  assert.deepEqual(sort(got.skills), sort(expected.skills));
  assert.ok(got.roles.length >= 7, "and it is not empty");

  // a skill someone suggested is a request now, waiting for a coordinator
  const requests = (await db.query<{ kind: string; name: string; status: string; category_id: string; reason: string }>(`select kind, name, status, category_id, reason from catalogue_request`)).rows;
  assert.deepEqual(requests, [{ kind: "skill", name: "Quantum computing", status: "pending", category_id: "c1", reason: "Suggested by Bob" }]);
  assert.deepEqual((await db.query<{ name: string }>(`select name from skill order by name`)).rows.map((r) => r.name), ["Kubernetes", "SQL"]);

  // nothing else was touched, and the old model is gone
  assert.equal((await db.query(`select 1 from rating`)).rows.length, 1);
  assert.deepEqual((await db.query<{ dismissed: boolean }>(`select dismissed from team_need`)).rows, [{ dismissed: false }]);
  const tables = (await db.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public'`)).rows.map((r) => r.table_name);
  assert.ok(!tables.includes("job_role") && !tables.includes("role_skill"));
  const cols = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'employee'`)).rows.map((r) => r.column_name);
  assert.ok(!cols.includes("role_id") && !cols.includes("team_role_id") && !cols.includes("team_role_cascade") && cols.includes("grade_id"));
  // the next upgrade (0004) gives every role that is there a soft colour: one of the tints,
  // a different one for each role of a team
  await db.transaction(async (tx) => { for (const stmt of statements("0004_role_colour")) await tx.exec(stmt); });
  const coloured = (await db.query<{ manager_id: string; color: string }>(`select manager_id, color from team_role`)).rows;
  assert.ok(coloured.length >= 7 && coloured.every((r) => isTint(r.color)), "every role has one of the tints");
  const perTeam = new Map<string, string[]>();
  for (const r of coloured) perTeam.set(r.manager_id, [...(perTeam.get(r.manager_id) ?? []), r.color]);
  for (const [m, list] of perTeam) assert.equal(new Set(list).size, list.length, `the roles of ${m}'s team have different colours`);
  assert.deepEqual(/ARRAY\[([^\]]+)\]/.exec(statements("0004_role_colour").join(" "))![1]!.split(",").map((x) => x.trim().replace(/'/g, "")), ROLE_TINTS.map((t) => t.key), "the upgrade uses the app's own list of tints, in its order");

  // changes to a team's roles tell every worker to rebuild its picture
  const v = async () => Number((await db.query<{ v: number }>(`select v from data_version where id = 1`)).rows[0].v);
  const before = await v();
  await db.exec(`insert into team_role (id, manager_id, name) values ('x', 'ann', 'New')`);
  assert.equal(await v(), before + 1);
  await db.close();
});
