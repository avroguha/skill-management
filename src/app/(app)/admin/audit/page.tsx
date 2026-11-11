import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";

export const metadata = { title: "Audit log · Admin" };

export default async function AuditAdmin() {
  const db = await getDb();
  const rows = await db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.at)).limit(2000);
  return (
    <>
      <PageHeader title="Audit log" description="Every change made through the app: who, what and when. The latest 2,000 entries." />
      <DataTable csvName="audit-log" pageSize={50}
        rows={rows.map((r) => ({
          at: r.at.toISOString(), when: r.at.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
          who: r.actorName, action: r.action.replace(/_/g, " "), entity: r.entity.replace(/_/g, " "),
          detail: r.detail ? JSON.stringify(r.detail).slice(0, 160) : "",
        }))}
        searchKeys={["who", "action", "entity", "detail"]}
        columns={[
          { key: "when", header: "When", kind: "muted", sortable: false },
          { key: "who", header: "Who", facet: true },
          { key: "action", header: "Action", facet: true },
          { key: "entity", header: "On", kind: "muted", facet: true },
          { key: "detail", header: "Detail", kind: "muted", sortable: false, className: "max-w-96 truncate font-mono text-xs" },
        ]} />
    </>
  );
}
