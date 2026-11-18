import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { getViewer } from "@/lib/server";
import { Section } from "@/components/kpi";
import { KINDS, COLUMNS, DESCRIPTIONS } from "@/lib/transfer";
import { backupDir, listBackups, readBackupSettings } from "@/lib/backup";
import { ImportForm, ClearOrganisation } from "./client";
import { Backups } from "./backups";

export const metadata = { title: "Data & backups · Settings" };
export const dynamic = "force-dynamic";

export default async function DataSettings() {
  const v = await getViewer();
  const kinds = KINDS.map((k) => ({ kind: k, columns: COLUMNS[k], description: DESCRIPTIONS[k] }));
  const settings = await readBackupSettings(await getDb("live"));
  return (
    <>
      <PageHeader title="Data & backups"
        description="Backups of everything (data and configuration) to keep or move to another server, and CSV files to load or change data in bulk." />
      {v?.demo && <p className="mb-4 rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">Demo mode: CSV import and export work on the demo data. Backups are of the real data, so they are read-only here.</p>}
      <div className="grid gap-5 xl:grid-cols-2">
        <Section className="xl:col-span-2" title="Backups"
          info="Everything in one file: people, ratings, catalogue, accounts, ServiceNow and single sign-on configuration, settings and the audit log. Restore puts it all back, on this server or a new one; a backup of what is there is taken first. One is also taken before every upgrade.">
          <Backups backups={listBackups()} settings={settings} dir={backupDir()} />
        </Section>
        <Section title="Import CSV" info="Load in this order the first time: skills, grades, roles, role-skills, people, team-needs, ratings. Check a file first: nothing is saved until you press Import, and every problem is listed with its line number.">
          <ImportForm kinds={kinds} />
        </Section>
        <Section title="Export CSV" info="Names, skill paths and e-mail addresses, never internal ids. An export imports back unchanged, so the easiest template for an import is an export.">
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
          info="Deletes every person, skill, role, rating and team need (a test round, say), and optionally the user accounts and the history. Configuration stays: ServiceNow, single sign-on, levels and settings. A backup is taken first, so it can be undone from the list above.">
          <ClearOrganisation />
        </Section>
      </div>
    </>
  );
}
