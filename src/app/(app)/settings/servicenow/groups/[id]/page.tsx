// One imported ServiceNow group: who is in it (of the people the sync brought in).
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { requireAdmin } from "@/lib/server";

export const metadata = { title: "Group · Admin" };

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const db = await getDb();
  const [g] = await db.select().from(schema.snGroup).where(eq(schema.snGroup.id, id));
  if (!g) notFound();
  const members = await db.select({ id: schema.employee.id, name: schema.employee.name, title: schema.employee.title, email: schema.employee.email, active: schema.employee.active })
    .from(schema.groupMember).innerJoin(schema.employee, eq(schema.employee.id, schema.groupMember.employeeId))
    .where(eq(schema.groupMember.groupId, id)).orderBy(asc(schema.employee.name));
  return (
    <>
      <PageHeader title={g.name}
        crumbs={[{ label: "ServiceNow", href: "/settings/servicenow" }, { label: g.name }]}
        description={[g.active ? "Active" : "Inactive", g.email, g.description, `synced ${g.syncedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`].filter(Boolean).join(" · ")} />
      <Section title={`Members (${members.length})`} description="Only people the sync brought in are listed; other members of the group in ServiceNow are not part of this app.">
        <DataTable csvName={`group-${g.name}`} searchPlaceholder="Find a person…" emptyText="None of the synced people is in this group."
          rows={members.map((m) => ({ name: m.name, href: `/people/${m.id}`, title: m.title, email: m.email, status: m.active ? "" : "Left" }))}
          columns={[
            { key: "name", header: "Name", kind: "person", hrefKey: "href" },
            { key: "title", header: "Designation", kind: "muted" },
            { key: "email", header: "E-mail", kind: "muted" },
            { key: "status", header: "", kind: "muted" },
          ]} />
      </Section>
    </>
  );
}
