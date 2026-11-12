// Builds a synthetic organisation of about 10,000 people as a backup file, for load tests.
//   node scripts/loadtest/make-synthetic.ts [people=10000] [out=synthetic-10k.json.gz]
// Starts from the demo (catalogue, roles, grades, levels, the demo accounts: admin/admin,
// exec, manager, employee with password demo), then adds a hierarchy under the demo's top
// person: VPs > directors > managers > team members, each team member with a role, a grade
// and self and validated ratings on most of their role's skills. Restore the file into a
// separate test instance (Admin › Import & export), never into real data.
import fs from "node:fs";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://";
process.env.SEED_DEMO = "true";
process.env.BETTER_AUTH_SECRET ??= "synthetic";
delete process.env.DATABASE_URL;

const target = Number(process.argv[2] ?? 10000);
const out = process.argv[3] ?? "synthetic-10k.json.gz";
const { getDb, closeDb } = await import("../../src/db/index.ts");
const B = await import("../../src/lib/backup.ts");

const db = await getDb();
const q = async <T>(s: ReturnType<typeof sql>) => ((await db.execute(s)) as unknown as { rows: T[] }).rows;

let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const FIRST = ["Aarav", "Maya", "Liam", "Noor", "Ravi", "Sara", "Omar", "Lena", "Kiran", "Zoe", "Ivan", "Asha", "Mateo", "Yuki", "Elena", "Dev", "Priya", "Tom", "Aisha", "Ben"];
const LAST = ["Shah", "Patel", "Kim", "Garcia", "Singh", "Brown", "Ito", "Khan", "Rossi", "Nair", "Lopez", "Chen", "Iyer", "Smith", "Das", "Mehta", "Walker", "Bose", "Gupta", "Rao"];

const [top] = await q<{ id: string; unit_id: string }>(sql`select id, unit_id from employee where manager_id is null and active order by name limit 1`);
const roles = await q<{ id: string; name: string }>(sql`select id, name from job_role`);
const grades = await q<{ id: string; rank: number }>(sql`select id, rank from grade order by rank`);
const roleSkills = await q<{ role_id: string; grade_id: string | null; skill_id: string; target: number }>(sql`select role_id, grade_id, skill_id, target from role_skill`);
const leaf = new Set((await q<{ id: string }>(sql`select id from skill s where status = 'active' and not exists (select 1 from skill c where c.parent_id = s.id and c.status = 'active')`)).map((r) => r.id));
const director = roles.find((r) => /director/i.test(r.name)) ?? roles[0];
const lead = roles.find((r) => /manager/i.test(r.name)) ?? roles[0];
const ics = roles.filter((r) => r.id !== director.id && r.id !== lead.id);

type Emp = Record<string, unknown>;
type Unit = Record<string, unknown>;
const emps: Emp[] = [];
const units: Unit[] = [];
const ratings: Record<string, unknown>[] = [];
let n = 0;
const person = (managerId: string, unitId: string, roleId: string, gradeId: string, title: string): string => {
  n += 1;
  const id = crypto.randomUUID();
  const first = pick(FIRST), last = pick(LAST);
  emps.push({ id, name: `${first} ${last}`, email: `syn${n}@synthetic.avro.test`, title, unit_id: unitId, role_id: roleId, grade_id: gradeId, manager_id: managerId, active: true, location: pick(["London", "Bengaluru", "Boston", "Dublin"]), source: "manual" });
  return id;
};
const unit = (name: string, kind: string, parentId: string, managerId: string | null): string => {
  const id = crypto.randomUUID();
  units.push({ id, name, kind, parent_id: parentId, manager_id: managerId, sort: units.length });
  return id;
};
const g = (rank: number) => grades.find((x) => x.rank === rank)?.id ?? grades[grades.length - 1].id;

// 8 VPs > 8 directors each > 10 managers each > team members to reach the target
const managers: { id: string; unit: string }[] = [];
for (let v = 0; v < 8; v++) {
  const vu = unit(`Division ${v + 1}`, "division", top.unit_id, null);
  const vp = person(top.id, vu, director.id, g(5), "Vice President");
  units[units.length - 1].manager_id = vp;
  for (let d = 0; d < 8; d++) {
    const du = unit(`Department ${v + 1}.${d + 1}`, "department", vu, null);
    const dir = person(vp, du, director.id, g(5), "Director");
    units[units.length - 1].manager_id = dir;
    for (let m = 0; m < 10; m++) {
      const tu = unit(`Team ${v + 1}.${d + 1}.${m + 1}`, "team", du, null);
      const mgr = person(dir, tu, lead.id, g(4), "Engineering Manager");
      units[units.length - 1].manager_id = mgr;
      managers.push({ id: mgr, unit: tu });
    }
  }
}
const perTeam = Math.max(1, Math.round((target - n) / managers.length));
for (const m of managers) for (let i = 0; i < perTeam; i++) {
  const role = pick(ics);
  person(m.id, m.unit, role.id, g(1 + Math.floor(rnd() * 4)), role.name);
}

// ratings on most of each person's role skills (all grades + their grade)
const now = Date.now();
for (const e of emps) {
  const skills = roleSkills.filter((r) => r.role_id === e.role_id && (!r.grade_id || r.grade_id === e.grade_id) && leaf.has(r.skill_id));
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
await load("org_unit", units);
await load("employee", emps);
await load("rating", ratings);
const total = (await q<{ n: number }>(sql`select count(*)::int as n from employee where active`))[0].n;
const file = B.encodeBackup(await B.exportBackup(db, "synthetic", "manual"));
fs.writeFileSync(out, file);
console.log(`synthetic: ${total} active people, ${units.length} new units, ${ratings.length} new ratings -> ${out} (${(file.length / 1048576).toFixed(1)} MB)`);
await closeDb();
