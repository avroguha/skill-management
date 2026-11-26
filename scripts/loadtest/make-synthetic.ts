// Builds a synthetic organisation of about 10,000 people as a backup file, for load tests.
//   node scripts/loadtest/make-synthetic.ts [people=10000] [out=synthetic-10k.json.gz]
// Starts from the demo organisation (catalogue, roles, grades, levels) plus admin/admin, then
// adds a hierarchy under the demo's top person: VPs > directors > managers > team members,
// each team member with a role, a grade and self and confirmed ratings on most of their
// role's skills. Restore the file into a separate test instance (Settings › Data & backups),
// never into real data.
import fs from "node:fs";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://";
process.env.BETTER_AUTH_SECRET ??= "synthetic";
delete process.env.DATABASE_URL;

const target = Number(process.argv[2] ?? 10000);
const out = process.argv[3] ?? "synthetic-10k.json.gz";
const { getDb, closeDb } = await import("../../src/db/index.ts");
const B = await import("../../src/lib/backup.ts");

const db = await getDb("demo");
const { createLocalAdmin } = await import("../../src/db/seed.ts");
await createLocalAdmin(db);
const q = async <T>(s: ReturnType<typeof sql>) => ((await db.execute(s)) as unknown as { rows: T[] }).rows;

let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const { MADE_UP_FIRST: FIRST, MADE_UP_LAST: LAST, MADE_UP_PLACES } = await import("../../src/db/made-up-names.ts");

const [top] = await q<{ id: string }>(sql`select id from employee where manager_id is null and active order by name limit 1`);
// the demo's roles, by name, are the patterns: every synthetic team gets its own copy of two of them
const demoRoles = await q<{ id: string; name: string; description: string }>(sql`select distinct on (name) id, name, description from team_role order by name, id`);
const grades = await q<{ id: string; rank: number }>(sql`select id, rank from grade order by rank`);
const demoRoleSkills = await q<{ role_id: string; skill_id: string; target: number; mandatory: boolean }>(sql`select role_id, skill_id, target, mandatory from team_role_skill`);
const leaf = new Set((await q<{ id: string }>(sql`select id from skill s where status = 'active' and not exists (select 1 from skill c where c.parent_id = s.id and c.status = 'active')`)).map((r) => r.id));

type Emp = Record<string, unknown>;
const emps: Emp[] = [];
const teamRoles: Record<string, unknown>[] = [];
const roleMembers: Record<string, unknown>[] = [];
const roleSkills: Record<string, unknown>[] = [];
const asked = new Map<string, { skill_id: string; target: number }[]>(); // person -> what their role asks for
const ratings: Record<string, unknown>[] = [];
let n = 0;
const person = (managerId: string, teamName: string, gradeId: string, title: string): string => {
  n += 1;
  const id = crypto.randomUUID();
  const first = pick(FIRST), last = pick(LAST);
  emps.push({ id, name: `${first} ${last}`, email: `syn${n}@synthetic.avro.test`, title, team_name: teamName, grade_id: gradeId, manager_id: managerId, active: true, location: pick(MADE_UP_PLACES), source: "manual" });
  return id;
};
const g = (rank: number) => grades.find((x) => x.rank === rank)?.id ?? grades[grades.length - 1].id;

// 8 VPs > 8 directors each > 10 managers each > team members to reach the target
const managers: string[] = [];
for (let v = 0; v < 8; v++) {
  const vp = person(top.id, `Division ${v + 1}`, g(5), "Vice President");
  for (let d = 0; d < 8; d++) {
    const dir = person(vp, `Department ${v + 1}.${d + 1}`, g(5), "Director");
    for (let m = 0; m < 10; m++) managers.push(person(dir, `Team ${v + 1}.${d + 1}.${m + 1}`, g(4), "Engineering Manager"));
  }
}
const perTeam = Math.max(1, Math.round((target - n) / managers.length));
for (const m of managers) {
  // two roles of the team's own, each a copy of a demo role's skills
  const mine = [pick(demoRoles), pick(demoRoles)].filter((r, i, a) => a.findIndex((x) => x.name === r.name) === i).map((r, i) => {
    const id = crypto.randomUUID();
    teamRoles.push({ id, manager_id: m, name: r.name, description: r.description, sort: i + 1 });
    const skills = demoRoleSkills.filter((k) => k.role_id === r.id);
    for (const k of skills) roleSkills.push({ role_id: id, skill_id: k.skill_id, target: k.target, mandatory: k.mandatory });
    return { id, name: r.name, skills };
  });
  for (let i = 0; i < perTeam; i++) {
    const role = pick(mine);
    const id = person(m, "", g(1 + Math.floor(rnd() * 4)), role.name);
    roleMembers.push({ role_id: role.id, employee_id: id });
    asked.set(id, role.skills);
  }
}

// ratings on most of the skills each person's role asks for
const now = Date.now();
for (const e of emps) {
  const skills = (asked.get(String(e.id)) ?? []).filter((r) => leaf.has(r.skill_id));
  for (const r of skills) {
    if (rnd() < 0.25) continue;
    const self = Math.max(0, Math.min(5, r.target + Math.floor(rnd() * 3) - 1));
    const validated = rnd() < 0.7 ? Math.max(0, Math.min(5, self - (rnd() < 0.4 ? 1 : 0))) : null;
    const at = new Date(now - Math.floor(rnd() * 400) * 86400e3).toISOString();
    ratings.push({ employee_id: e.id, skill_id: r.skill_id, self_level: self, self_at: at, validated_level: validated, validated_at: validated == null ? null : at, status: validated == null ? (rnd() < 0.3 ? "submitted" : "draft") : "validated", interest: rnd() < 0.1 });
  }
}

const load = async (table: string, rows: Record<string, unknown>[]) => {
  for (let i = 0; i < rows.length; i += 2000) {
    const chunk = JSON.stringify(rows.slice(i, i + 2000));
    const cols = Object.keys(rows[0]);
    const list = sql.join(cols.map((c) => sql.identifier(c)), sql`, `);
    await db.execute(sql`insert into ${sql.identifier(table)} (${list}) select ${list} from json_populate_recordset(null::${sql.identifier(table)}, ${chunk}::json) on conflict do nothing`);
  }
};
await load("employee", emps);
await load("team_role", teamRoles);
await load("team_role_member", roleMembers);
await load("team_role_skill", roleSkills);
await load("rating", ratings);
const total = (await q<{ n: number }>(sql`select count(*)::int as n from employee where active`))[0].n;
const file = B.encodeBackup(await B.exportBackup(db, "synthetic", "manual"));
fs.writeFileSync(out, file);
console.log(`synthetic: ${total} active people, ${managers.length} new teams, ${ratings.length} new ratings -> ${out} (${(file.length / 1048576).toFixed(1)} MB)`);
await closeDb();
