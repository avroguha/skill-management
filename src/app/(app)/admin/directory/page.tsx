import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { readDirectoryConfig, publicDirectoryConfig, readProfileSettings, photoUrl } from "@/lib/directory/config";
import { DirectoryForm, PhotoForm } from "./client";

export const metadata = { title: "ServiceNow · Admin" };

export default async function DirectoryAdmin() {
  const db = await getDb();
  const [cfg, profile, runs, [sample]] = await Promise.all([
    readDirectoryConfig(db),
    readProfileSettings(db),
    db.select().from(schema.syncRun).orderBy(desc(schema.syncRun.startedAt)).limit(25),
    db.select().from(schema.employee).where(eq(schema.employee.active, true)).orderBy(asc(schema.employee.name)).limit(1),
  ]);
  const placeholders = ["user_name", "email", "sys_id", ...cfg.extraFields];
  return (
    <>
      <PageHeader title="ServiceNow user sync"
        description="People, their managers and designations come from sys_user: everyone under a top-level user, recursively, of the user types you choose. Only people brought in this way (or added by an administrator) can sign in with single sign-on." />
      <div className="grid gap-5">
        <Section title="Connection and filter">
          <DirectoryForm initial={publicDirectoryConfig(cfg)} />
        </Section>
        <div className="grid gap-5 xl:grid-cols-3">
          <Section className="xl:col-span-2" title="Sync history">
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
          <Section title="Photos" description="A URL with a {placeholder} filled from each person">
            <PhotoForm initial={profile.photoUrlTemplate} placeholders={placeholders}
              preview={sample ? photoUrl(profile.photoUrlTemplate, sample) : null} sampleName={sample?.name ?? null} />
          </Section>
        </div>
      </div>
    </>
  );
}
