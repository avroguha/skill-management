import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { AdminCrud } from "@/components/admin-crud";
import { saveLevel } from "@/app/actions/admin";

export const metadata = { title: "Levels · Admin" };

export default async function LevelsAdmin() {
  const db = await getDb();
  const levels = await db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level));
  return (
    <>
      <PageHeader title="Proficiency levels"
        description="The same 0–5 scale for every skill. Describe each level as what someone can do on their own, not as an adjective: that is what keeps self-ratings and manager ratings close." />
      <Section title="Levels">
        <AdminCrud noun="level" canAdd={false}
          rows={levels.map((l) => ({ id: String(l.level), level: l.level, name: l.name, description: l.description }))}
          columns={[
            { key: "level", header: "Level", kind: "level", align: "center" },
            { key: "name", header: "Name" },
            { key: "description", header: "What someone at this level can do", kind: "muted" },
          ]}
          fields={[{ name: "name", label: "Name" }, { name: "description", label: "What someone at this level can do", type: "textarea" }]}
          save={saveLevel} />
      </Section>
    </>
  );
}
