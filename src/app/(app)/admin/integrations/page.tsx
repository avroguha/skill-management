// Admin › Integrations: keys for reporting tools (Power BI, Tableau, Excel, anything that
// reads JSON, CSV or OData), each limited to the datasets chosen for it.
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/server";
import { appUrl } from "@/lib/auth";
import { DATASETS } from "@/lib/integrations/datasets";
import { Integrations } from "./client";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  await requireAdmin();
  const db = await getDb();
  const rows = await db.select().from(schema.apiClient).orderBy(desc(schema.apiClient.createdAt));
  const now = Date.now();
  return (
    <>
      <PageHeader title="Integrations" description="Let Power BI, Tableau, Excel or any other tool read the skills data. Each integration gets its own key, limited to the datasets you choose; revoke it at any time." />
      <Integrations base={appUrl()}
        datasets={DATASETS.map((d) => ({ key: d.key, entity: d.entity, title: d.title, description: d.description, columns: d.columns.length }))}
        clients={rows.map((r) => ({
          id: r.id, name: r.name, tool: r.tool, hint: r.tokenHint, datasets: r.datasets, createdBy: r.createdBy,
          createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt?.toISOString() ?? null, lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
          useCount: r.useCount, state: r.revokedAt ? "revoked" : r.expiresAt && r.expiresAt.getTime() < now ? "expired" : "active",
        }))} />
    </>
  );
}
