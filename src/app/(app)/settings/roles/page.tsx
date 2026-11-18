import { asc, count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { AdminCrud } from "@/components/admin-crud";
import { saveRole, deleteRole, saveGrade, deleteGrade } from "@/app/actions/admin";
import { getEngine } from "@/lib/server";
import { RoleMatrix } from "./matrix";

export const metadata = { title: "Roles & targets · Settings" };

export default async function RolesSettings() {
  const db = await getDb();
  const engine = await getEngine();
  const [roles, grades, roleSkills, levels, holders] = await Promise.all([
    db.select().from(schema.jobRole).orderBy(asc(schema.jobRole.name)),
    db.select().from(schema.grade).orderBy(asc(schema.grade.rank)),
    db.select().from(schema.roleSkill),
    db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level)),
    db.select({ roleId: schema.employee.roleId, n: count() }).from(schema.employee).groupBy(schema.employee.roleId),
  ]);
  const skills = [...engine.skillById.values()].filter((s) => engine.isRateable(s.id))
    .map((s) => ({ id: s.id, label: engine.skillLabel(s.id), category: engine.categoryById.get(s.categoryId)?.name ?? "" }));
  return (
    <>
      <PageHeader title="Roles & targets" description="What each job role needs: which skills, at what level, and how that steps up by grade. A person's role and grade decide their targets." />
      <div className="grid gap-5">
        <Section title="Required skills by role" info="Pick a role, then set the level it needs for each skill: for every grade, or for one grade (a grade's own level wins over the all-grades one). Optional skills are shown but never count as a gap.">
          <RoleMatrix roles={roles.map((r) => ({ id: r.id, name: r.name }))} grades={grades.map((g) => ({ id: g.id, name: g.name }))}
            skills={skills} roleSkills={roleSkills.map((r) => ({ roleId: r.roleId, gradeId: r.gradeId, skillId: r.skillId, target: r.target, mandatory: r.mandatory }))}
            levels={levels.map((l) => ({ level: l.level, name: l.name }))} />
        </Section>
        <div className="grid gap-5 xl:grid-cols-2">
          <Section title="Roles" info="Job roles. People get one in Settings › People & access, by a people CSV, or from their designation (Settings › ServiceNow › Roles from designation).">
            <AdminCrud noun="role" pageSize={10}
              rows={roles.map((r) => ({ id: r.id, name: r.name, description: r.description,
                skills: new Set(roleSkills.filter((x) => x.roleId === r.id).map((x) => x.skillId)).size,
                people: holders.find((h) => h.roleId === r.id)?.n ?? 0 }))}
              columns={[
                { key: "name", header: "Role" },
                { key: "skills", header: "Skills", kind: "number", align: "right", info: "Skills the role asks for." },
                { key: "people", header: "People", kind: "number", align: "right", info: "People with this role." },
              ]}
              fields={[
                { name: "name", label: "Name", info: "The role's name, e.g. Cloud Engineer. Unique." },
                { name: "description", label: "Description", type: "textarea", info: "What the role is for, in a line." },
              ]}
              save={saveRole} remove={deleteRole} />
          </Section>
          <Section title="Grades" info="Levels of seniority within a role. Rank orders them: the next grade up is the next higher rank, which is how a person's page shows what the next grade needs.">
            <AdminCrud noun="grade" pageSize={10}
              rows={grades.map((g) => ({ id: g.id, name: g.name, rank: g.rank }))}
              columns={[{ key: "name", header: "Grade" }, { key: "rank", header: "Rank", kind: "number", align: "right" }]}
              defaults={{ rank: (grades.at(-1)?.rank ?? 0) + 1 }}
              fields={[
                { name: "name", label: "Name", half: true, info: "e.g. Senior. Unique." },
                { name: "rank", label: "Rank", type: "number", half: true, info: "Higher is more senior." },
              ]}
              save={saveGrade} remove={deleteGrade} />
          </Section>
        </div>
      </div>
    </>
  );
}
