import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { getViewer } from "@/lib/server";
import { Section } from "@/components/kpi";
import { KINDS, COLUMNS, DESCRIPTIONS } from "@/lib/transfer";
import { backupDir, listBackups, readBackupSettings } from "@/lib/backup";
import { ImportForm, ClearOrganisation } from "./client";
import { ResetData } from "./reset";
import { getEngine } from "@/lib/server";
import { Backups } from "./backups";

export const metadata = { title: "Data & backups · Settings" };
export const dynamic = "force-dynamic";

export default async function DataSettings() {
  const v = await getViewer();
  const kinds = KINDS.map((k) => ({ kind: k, columns: COLUMNS[k], description: DESCRIPTIONS[k] }));
  const settings = await readBackupSettings(await getDb("live"));
  const engine = await getEngine();
  const managers = engine.activeEmployees.filter(engine.isManager).map((m) => ({ id: m.id, name: `${engine.teamLabel(m.id)} · ${m.name}`, below: engine.managersIn(m.id).length - 1 })).sort((a, b) => a.name.localeCompare(b.name));
  const people = engine.activeEmployees.slice(0, 5000).map((e) => ({ id: e.id, name: `${e.name}${e.title ? ` · ${e.title}` : ""}` }));
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
        <Section title="Import CSV" info="Load in this order the first time: skills, grades, people, team-roles, role-people, role-skills, team-needs, ratings. Check a file first: nothing is saved until you press Import, and every problem is listed with its line number.">
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
        <Section className="xl:col-span-2 border-destructive/40" title="Reset"
          description="Put data back: one thing, or everything to how the app was first installed. People, accounts and connections always stay."
          info="For after a test round, or when something went wrong. Reset one thing: the assessments of everyone, of one team or of one person; the roles and needs of a team; the requests. Or go back to how the app was first installed: the skill catalogue, the level wording and the rules as shipped, and nothing people did in the app. A backup is taken first every time, so a reset can be undone from the list of backups above.">
          {v?.demo ? <p className="text-sm text-muted-foreground">Reset works on the real data, so it is not offered in demo mode. To put the demo back as it was, use Reset demo in the bar at the top.</p>
            : <ResetData managers={managers} people={people} />}
        </Section>
        <Section className="xl:col-span-2 border-destructive/40" title="Start from scratch"
          info="Goes further than Reset: deletes every person, skill, role, rating and team need, and optionally the user accounts and the history. Configuration stays: ServiceNow, single sign-on, levels and settings. A backup is taken first, so it can be undone from the list above.">
          <ClearOrganisation />
        </Section>
      </div>
    </>
  );
}
