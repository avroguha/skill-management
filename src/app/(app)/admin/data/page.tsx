import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { KINDS, COLUMNS, DESCRIPTIONS } from "@/lib/transfer";
import { backupDir, listBackups, readBackupSettings } from "@/lib/backup";
import { ImportForm, ClearOrganisation } from "./client";
import { Backups } from "./backups";

export const metadata = { title: "Import & export · Admin" };
export const dynamic = "force-dynamic";

export default async function DataAdmin() {
  const kinds = KINDS.map((k) => ({ kind: k, columns: COLUMNS[k], description: DESCRIPTIONS[k] }));
  const settings = await readBackupSettings(await getDb());
  return (
    <>
      <PageHeader title="Import & export"
        description="Backups of everything (data and configuration) to keep or move to another server, and CSV files to load or edit data in bulk." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section className="xl:col-span-2" title="Backups"
          description="Everything in one file: people, ratings, catalogue, accounts, ServiceNow and single sign-on configuration, settings and the audit log. Restore puts it all back, on this server or a new one.">
          <Backups backups={listBackups()} settings={settings} dir={backupDir()} />
        </Section>
        <Section title="Import CSV" description="Load in this order the first time: skills, grades, roles, role-skills, units, people, person-targets, team-needs, ratings, training-plans.">
          <ImportForm kinds={kinds} />
        </Section>
        <Section title="Export CSV" description="Names, paths and e-mail addresses, never internal ids. An export imports back unchanged, so the easiest template is an export.">
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
        <Section className="xl:col-span-2 border-destructive/40" title="Start from scratch"
          description="Deletes every unit, person, skill, role, rating and plan (the demo data, or a test round), and optionally the user accounts and the history. Configuration stays: ServiceNow, single sign-on, levels and settings. A backup is taken first, so it can be undone from the list above.">
          <ClearOrganisation />
        </Section>
      </div>
    </>
  );
}
