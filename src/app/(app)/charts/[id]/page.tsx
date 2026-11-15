import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { requireViewer, getEngine } from "@/lib/server";
import { specSchema } from "@/lib/charts/load";
import { DEFAULT_SPEC } from "@/lib/charts/query";
import { ChartBuilder } from "../builder";
import { builderOptions } from "../options";

export const metadata = { title: "Edit chart" };

export default async function EditChartPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer();
  if (!v.canBuildCharts) redirect("/");
  const { id } = await params;
  const db = await getDb();
  const [row] = await db.select().from(schema.savedChart).where(eq(schema.savedChart.id, id));
  if (!row || (row.ownerId !== v.userId && !v.isAdmin)) notFound();
  const parsed = specSchema.safeParse(row.config);
  const options = await builderOptions(v, await getEngine());
  const spec = parsed.success ? parsed.data : { ...DEFAULT_SPEC, scope: { kind: options.scopes[0]?.kind ?? "unit", id: options.scopes[0]?.id ?? "" } };
  return (
    <>
      <PageHeader title={row.name} crumbs={[{ label: "Charts", href: "/charts" }, { label: row.name }]}
        description="Change what the chart shows; Save keeps the settings, never a copy of the numbers." />
      <ChartBuilder initial={{ id: row.id, name: row.name, description: row.description, spec }} options={options} />
    </>
  );
}
