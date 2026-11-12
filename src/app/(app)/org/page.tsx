// Org chart: the people tree through the manager chain, at what level each person is,
// with the skill capability of everyone below them. "i" shows the details; clicking a
// name goes inside (that person becomes the top of the view).
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/heatmap";
import { requireOrgViewer, getEngine, param, type SearchParams } from "@/lib/server";
import { photoUrls } from "@/lib/photos";
import { pct } from "@/lib/engine/engine";
import { OrgTree, type OrgNode, type OrgView } from "./org-tree";

export const metadata = { title: "Org chart" };

export default async function OrgPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireOrgViewer();
  const engine = await getEngine();
  const photos = await photoUrls();
  const active = [...engine.empById.values()].filter((e) => e.active);
  const activeIds = new Set(active.map((e) => e.id));

  // level: how far below the top of the whole organisation
  const depthMemo = new Map<string, number>();
  const depthOf = (id: string): number => {
    const hit = depthMemo.get(id);
    if (hit != null) return hit;
    let d = 0;
    const seen = new Set<string>([id]);
    let cur = engine.empById.get(id)?.managerId;
    while (cur && activeIds.has(cur) && !seen.has(cur)) { seen.add(cur); d += 1; cur = engine.empById.get(cur)?.managerId; }
    depthMemo.set(id, d);
    return d;
  };

  const visible = active.filter((e) => v.allUnits || v.employeeIds.has(e.id));
  const visibleIds = new Set(visible.map((e) => e.id));
  const kids = new Map<string, string[]>();
  for (const e of visible) if (e.managerId && visibleIds.has(e.managerId)) kids.set(e.managerId, [...(kids.get(e.managerId) ?? []), e.id]);

  // subtree roll-ups, bottom up: (person, required skill) pairs on target, people below
  const sums = new Map<string, { required: number; met: number; total: number }>();
  const sumOf = (id: string, guard = new Set<string>()): { required: number; met: number; total: number } => {
    const hit = sums.get(id);
    if (hit) return hit;
    guard.add(id);
    const self = engine.aggregate([engine.empById.get(id)!]);
    const acc = { required: self.required, met: self.met, total: 0 };
    for (const k of kids.get(id) ?? []) {
      if (guard.has(k)) continue;
      const s = sumOf(k, guard);
      acc.required += s.required; acc.met += s.met; acc.total += s.total + 1;
    }
    sums.set(id, acc);
    return acc;
  };

  const requested = param(sp, "root");
  const view: OrgView = param(sp, "view") === "list" ? "list" : "chart";
  const keep = view === "list" ? "&view=list" : "";
  const rootPart = requested ? `root=${requested}` : "";
  const viewHref: Record<OrgView, string> = {
    chart: `/org${rootPart ? `?${rootPart}` : ""}`,
    list: `/org?${rootPart ? `${rootPart}&` : ""}view=list`,
  };
  const tops = requested && visibleIds.has(requested)
    ? [requested]
    : visible.filter((e) => !e.managerId || !visibleIds.has(e.managerId)).map((e) => e.id);
  if (!tops.length) return (<><PageHeader title="Org chart" /><Empty>No people yet. Sync them from ServiceNow, import them, or add them in Admin › Organisation.</Empty></>);

  const nodes: OrgNode[] = [];
  const stack = [...tops];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const e = engine.empById.get(id)!;
    const s = sumOf(id);
    nodes.push({
      id, name: e.name, title: e.title, managerId: tops.includes(id) ? null : e.managerId,
      level: depthOf(id), direct: (kids.get(id) ?? []).length, total: s.total,
      onTargetPct: pct(s.met, s.required), photo: photos.get(id) ?? null,
    });
    stack.push(...(kids.get(id) ?? []));
  }
  nodes.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  // the path from the visible top down to the requested person
  const crumbs: { label: string; href?: string }[] = [{ label: "Org chart", href: view === "list" ? "/org?view=list" : "/org" }];
  if (requested && visibleIds.has(requested)) {
    const path: string[] = [];
    let cur: string | null | undefined = engine.empById.get(requested)?.managerId;
    const guard = new Set<string>();
    while (cur && visibleIds.has(cur) && !guard.has(cur)) { guard.add(cur); path.unshift(cur); cur = engine.empById.get(cur)?.managerId; }
    for (const p of path) crumbs.push({ label: engine.empById.get(p)!.name, href: `/org?root=${p}${keep}` });
    crumbs.push({ label: engine.empById.get(requested)!.name });
  }

  return (
    <>
      <PageHeader title="Org chart" crumbs={crumbs.length > 1 ? crumbs : undefined}
        description="Who reports to whom, at what level, and how much of what they need everyone below them has. Click a name to go inside; “i” for details." />
      <OrgTree key={tops.join(",") + view} nodes={nodes} rootIds={tops} view={view} viewHref={viewHref}
        thresholds={{ greenAt: engine.settings.greenAt, amberAt: engine.settings.amberAt }} />
    </>
  );
}
