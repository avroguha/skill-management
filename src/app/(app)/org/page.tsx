// Org chart: the people tree through the manager chain, at what level each person is,
// with the skill capability of everyone below them. It opens on the top and one level
// down; each card shows its numbers and its people load when it is expanded. "i" shows
// the details; going inside makes that person the top of the view.
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/heatmap";
import { requireOrgViewer, getEngine, param, type SearchParams } from "@/lib/server";
import { photoUrls } from "@/lib/photos";
import { orgForest, orgCards } from "@/lib/org-nodes";
import { OrgTree, type OrgView } from "./org-tree";

export const metadata = { title: "Org chart" };

export default async function OrgPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireOrgViewer();
  const engine = await getEngine();
  const photos = await photoUrls();
  const f = orgForest(engine, v);

  const requested = param(sp, "root");
  const view: OrgView = param(sp, "view") === "list" ? "list" : "chart";
  const keep = view === "list" ? "&view=list" : "";
  const rootPart = requested ? `root=${requested}` : "";
  const viewHref: Record<OrgView, string> = {
    chart: `/org${rootPart ? `?${rootPart}` : ""}`,
    list: `/org?${rootPart ? `${rootPart}&` : ""}view=list`,
  };
  const tops = requested && f.visible.has(requested) ? [requested] : f.tops;
  if (!tops.length) return (<><PageHeader title="Org chart" /><Empty>No people yet. Sync them from ServiceNow, import them, or add them in Admin › Organisation.</Empty></>);

  // the top and one level down; the rest loads as cards are expanded
  const first = tops.flatMap((id) => f.kids.get(id) ?? []);
  const loaded = new Set([...tops, ...first]);
  const nodes = orgCards(engine, f, [...tops, ...first], photos, loaded, new Set(tops))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  // the path from the visible top down to the requested person
  const crumbs: { label: string; href?: string }[] = [{ label: "Org chart", href: view === "list" ? "/org?view=list" : "/org" }];
  if (requested && f.visible.has(requested)) {
    const path: string[] = [];
    let cur: string | null | undefined = engine.empById.get(requested)?.managerId;
    const guard = new Set<string>();
    while (cur && f.visible.has(cur) && !guard.has(cur)) { guard.add(cur); path.unshift(cur); cur = engine.empById.get(cur)?.managerId; }
    for (const p of path) crumbs.push({ label: engine.empById.get(p)!.name, href: `/org?root=${p}${keep}` });
    crumbs.push({ label: engine.empById.get(requested)!.name });
  }

  return (
    <>
      <PageHeader title="Org chart" crumbs={crumbs.length > 1 ? crumbs : undefined}
        description="Who reports to whom, at what level, and how much of what they need everyone below them has. Expand a card to see their people; select it for details." />
      <OrgTree key={tops.join(",") + view} nodes={nodes} rootIds={tops} view={view} viewHref={viewHref} total={f.visible.size}
        thresholds={{ greenAt: engine.settings.greenAt, amberAt: engine.settings.amberAt }} />
    </>
  );
}
