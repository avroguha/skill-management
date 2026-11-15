// Charts: the charts this viewer built (operators, executives, administrators), each worked
// out from live data within what they may see, and saved as a picture on demand. A chart is a
// definition, never a copy of the data, so nothing has to be exported to be charted.
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/heatmap";
import { Button } from "@/components/ui/button";
import { requireViewer, getEngine } from "@/lib/server";
import { specSchema, computeChart } from "@/lib/charts/load";
import { DownloadAll, Gallery, type GalleryItem } from "./gallery";

export const metadata = { title: "Charts" };

export default async function ChartsPage() {
  const v = await requireViewer();
  if (!v.canBuildCharts) redirect("/");
  const db = await getDb();
  const engine = await getEngine();
  const rows = await db.select({ c: schema.savedChart, owner: schema.user.name }).from(schema.savedChart)
    .innerJoin(schema.user, eq(schema.user.id, schema.savedChart.ownerId))
    .where(eq(schema.savedChart.ownerId, v.userId))
    .orderBy(asc(schema.savedChart.sort), desc(schema.savedChart.updatedAt));
  const items: GalleryItem[] = await Promise.all(rows.map(async ({ c, owner }) => {
    const p = specSchema.safeParse(c.config);
    const base = { id: c.id, name: c.name, description: c.description, owner, mine: c.ownerId === v.userId };
    if (!p.success) return { ...base, type: "bar" as const, splitByLevel: false, result: null, error: "Its settings are no longer valid. Edit it to fix them." };
    const r = await computeChart(v, p.data);
    return "error" in r
      ? { ...base, type: p.data.type, splitByLevel: false, result: null, error: `${r.error} It was built over a hierarchy you no longer have.` }
      : { ...base, type: p.data.type, splitByLevel: p.data.splitBy === "level", result: r, error: null };
  }));
  const scopes = v.chartScopes === "all" ? "the whole organisation" : `${v.chartScopes.length} ${v.chartScopes.length === 1 ? "hierarchy" : "hierarchies"}`;
  return (
    <>
      <PageHeader title="Charts"
        description={`Your own charts over ${scopes}, worked out from live data each time. Save any of them as a picture with PNG; the data stays in the app.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {items.some((i) => i.result) && <DownloadAll />}
            <Button asChild size="sm" data-tour="charts-new"><Link href="/charts/new"><Plus />New chart</Link></Button>
          </div>
        } />
      {items.length ? <Gallery items={items} thresholds={{ greenAt: engine.settings.greenAt, amberAt: engine.settings.amberAt }} />
        : <Empty>No charts yet. New chart starts from a ready-made one (on target by team, bench depth, a trend, a heatmap…) that you can change.</Empty>}
    </>
  );
}
