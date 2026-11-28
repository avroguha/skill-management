import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { AdminCrud } from "@/components/admin-crud";
import { saveLevel } from "@/app/actions/admin";
import { readSettings } from "@/lib/dataset";
import { SettingsForm } from "./rules-form";

export const metadata = { title: "Levels & rules · Settings" };

export default async function LevelsSettings() {
  const db = await getDb();
  const [levels, settings] = await Promise.all([
    db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level)),
    readSettings(db),
  ]);
  return (
    <>
      <PageHeader title="Levels & rules" description="The 0-5 scale everyone rates on, who is asked to rate themselves, and how the numbers are coloured." />
      <div className="grid gap-5">
        <Section title="Levels" info="The same 0-5 scale for every skill. Describe each level as what someone can do on their own, not as an adjective: that keeps people’s own levels and their managers' close.">
          <AdminCrud noun="level" canAdd={false}
            rows={levels.map((l) => ({ id: String(l.level), level: l.level, name: l.name, description: l.description }))}
            columns={[
              { key: "level", header: "Level", kind: "level", align: "center" },
              { key: "name", header: "Name" },
              { key: "description", header: "What someone at this level can do", kind: "muted" },
            ]}
            fields={[
              { name: "name", label: "Name", info: "One or two words, shown next to the number everywhere (e.g. Proficient)." },
              { name: "description", label: "What someone at this level can do", type: "textarea", info: "Shown when people pick a level. Say what they can do on their own." },
            ]}
            save={saveLevel} />
        </Section>
        <Section title="Rules" info="Apply everywhere at once: every page and e-mail uses them.">
          <SettingsForm initial={settings} />
        </Section>
      </div>
    </>
  );
}
