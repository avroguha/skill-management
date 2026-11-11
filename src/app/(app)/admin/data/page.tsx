import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { KINDS, COLUMNS, DESCRIPTIONS } from "@/lib/transfer";
import { ImportForm, ClearOrganisation } from "./client";

export const metadata = { title: "Import & export · Admin" };

export default function DataAdmin() {
  const kinds = KINDS.map((k) => ({ kind: k, columns: COLUMNS[k], description: DESCRIPTIONS[k] }));
  return (
    <>
      <PageHeader title="Import & export"
        description="CSV files with names, paths and e-mail addresses, never internal ids. An export imports back unchanged, so the easiest template is an export." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Import" description="Load in this order the first time: skills, grades, roles, role-skills, units, people, person-targets, team-needs, ratings, training-plans.">
          <ImportForm kinds={kinds} />
        </Section>
        <Section title="Export">
          <ul className="divide-y">
            {kinds.map((k) => (
              <li key={k.kind} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{k.kind}.csv</div>
                  <div className="text-xs text-muted-foreground">{k.description}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{k.columns.join(", ")}</div>
                </div>
                <a href={`/api/export/${k.kind}`} className="shrink-0 rounded-md border px-2.5 py-1 text-xs hover:bg-accent">Download</a>
              </li>
            ))}
          </ul>
        </Section>
        <Section className="xl:col-span-2 border-destructive/40" title="Go live: remove the organisation"
          description="Deletes every unit, person, skill, role, rating and plan - for example the demo data - and keeps user accounts, levels and settings. It cannot be undone; export first if in doubt.">
          <ClearOrganisation />
        </Section>
      </div>
    </>
  );
}
