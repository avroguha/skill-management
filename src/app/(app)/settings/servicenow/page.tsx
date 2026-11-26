import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { readDirectoryConfig, publicDirectoryConfig, readProfileSettings, photoUrl } from "@/lib/directory/config";
import { DirectoryForm, PhotoForm } from "./client";

export const metadata = { title: "ServiceNow · Settings" };

export default async function DirectoryAdmin() {
  const db = await getDb();
  const [cfg, profile, runs, [sample], groups] = await Promise.all([
    readDirectoryConfig(db),
    readProfileSettings(db),
    db.select().from(schema.syncRun).orderBy(desc(schema.syncRun.startedAt)).limit(25),
    db.select().from(schema.employee).where(eq(schema.employee.active, true)).orderBy(asc(schema.employee.name)).limit(1),
    db.select({
      id: schema.snGroup.id, name: schema.snGroup.name, description: schema.snGroup.description, email: schema.snGroup.email,
      active: schema.snGroup.active, syncedAt: schema.snGroup.syncedAt,
      members: sql<number>`(select count(*)::int from group_member m where m.group_id = ${schema.snGroup.id})`,
    }).from(schema.snGroup).orderBy(asc(schema.snGroup.name)),
  ]);
  const placeholders = ["user_name", "email", "sys_id", ...cfg.extraFields];
  return (
    <>
      <PageHeader title="ServiceNow"
        description="People, their managers and designations come from sys_user: everyone under a top-level user, recursively, of the types you choose. The reporting lines are the teams. Only people brought in this way (or added in People & access) can sign in with single sign-on." />
      <div className="grid gap-5">
        <Section title="Connection and filter" info="Test shows who would come in without saving anything. Save keeps the settings; Sync now runs with the saved ones.">
          <DirectoryForm initial={publicDirectoryConfig(cfg)} />
        </Section>
        <div className="grid gap-5 xl:grid-cols-3">
          <Section className="xl:col-span-2" title="Sync history" info="Every sync, manual or scheduled: how many people came, were new, changed, or left.">
            <DataTable rows={runs.map((r) => ({
              started: r.startedAt.toISOString(), when: r.startedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
              trigger: r.trigger === "manual" ? `manual${r.actorName ? ` (${r.actorName})` : ""}` : "schedule",
              status: r.status, fetched: r.fetched, created: r.created, updated: r.updated, deactivated: r.deactivated,
              skipped: r.skipped || null, message: r.message,
            }))} pageSize={10} emptyText="No sync has run yet."
              columns={[
                { key: "when", header: "When", kind: "muted", sortable: false },
                { key: "trigger", header: "By", kind: "muted" },
                { key: "status", header: "Result", kind: "badge", facet: true },
                { key: "fetched", header: "People", kind: "number", align: "right" },
                { key: "created", header: "New", kind: "number", align: "right" },
                { key: "updated", header: "Updated", kind: "number", align: "right" },
                { key: "deactivated", header: "Left", kind: "number", align: "right" },
                { key: "message", header: "Detail", kind: "muted", sortable: false, className: "max-w-96 truncate" },
              ]} />
          </Section>
          <Section title="Photos" info="An address with a {placeholder} filled in from each person, e.g. their user_name. Empty: people show their initials.">
            <PhotoForm initial={profile.photoUrlTemplate} placeholders={placeholders}
              preview={sample ? photoUrl(profile.photoUrlTemplate, sample) : null} sampleName={sample?.name ?? null} />
          </Section>
        </div>
        <Section title={`Groups (${groups.length})`}
          description={cfg.importGroups
            ? "The ServiceNow groups the synced people belong to, refreshed by every sync. Settings › Single sign-on can let in only members of chosen groups."
            : "Group import is off. Turn on Import their groups above and sync."}>
          <DataTable csvName="servicenow-groups" searchPlaceholder="Find a group…" emptyText="No groups imported yet."
            rows={groups.map((g) => ({ name: g.name, href: `/settings/servicenow/groups/${g.id}`, members: Number(g.members), active: g.active ? "Active" : "Inactive", email: g.email, description: g.description }))}
            initialSort={{ key: "members", desc: true }}
            columns={[
              { key: "name", header: "Group", kind: "link", hrefKey: "href" },
              { key: "members", header: "Members", kind: "number", align: "right" },
              { key: "active", header: "", kind: "muted", facet: true },
              { key: "email", header: "E-mail", kind: "muted" },
              { key: "description", header: "Description", kind: "muted", sortable: false, className: "max-w-96 truncate" },
            ]} />
        </Section>
      </div>
    </>
  );
}
