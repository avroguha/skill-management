"use client";
// The org chart as a pannable, zoomable canvas (React Flow), laid out by src/lib/org-layout.ts:
// a top-down tree with rounded right-angle connectors, large teams of individual
// contributors in two columns either side of a spine, expand/collapse per person, and the
// details of the selected person in a side panel (a bottom sheet on a phone) - never on
// top of the chart.
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, Panel, Handle, Position, BaseEdge, useReactFlow,
  type Node, type Edge, type NodeProps, type EdgeProps,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import { ChevronDown, ChevronUp, Maximize, ListTree, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PersonAvatar } from "@/components/person-avatar";
import { BAND_CLASS, pctBand } from "@/lib/status";
import { layoutForest, CARD, type TreeIn } from "@/lib/org-layout";
import { cn } from "@/lib/utils";
import type { OrgNode } from "./org-tree";
import { InfoBody, useOrgInfo } from "./org-info";

type Thresholds = { greenAt: number; amberAt: number };
type PersonData = {
  n: OrgNode; expanded: boolean; selected: boolean; onPath: boolean; thresholds: Thresholds;
  onToggle: (id: string) => void; onSelect: (id: string) => void;
};
type PersonNodeT = Node<PersonData, "person">;
type OrgEdgeT = Edge<{ path: string; hot: boolean }, "org">;

const hidden = "!pointer-events-none !opacity-0 !min-h-0 !min-w-0 !border-0";

function PersonNode({ data }: NodeProps<PersonNodeT>) {
  const { n, expanded, selected, onPath, thresholds, onToggle, onSelect } = data;
  const lead = n.direct > 0;
  const band = pctBand(n.onTargetPct, thresholds);
  return (
    <div className="relative" style={{ width: CARD.w, height: CARD.h }}>
      <Handle type="target" position={Position.Top} isConnectable={false} className={hidden} />
      {/* selection comes from React Flow's onNodeClick (a click here, or Enter on the button, bubbles to it) */}
      <button type="button" aria-pressed={selected} aria-label={`${n.name}, ${n.title || "no designation"}: details`}
        className={cn(
          "nodrag nopan absolute inset-x-0 bottom-0 top-7 flex cursor-pointer flex-col items-center rounded-xl px-3 pt-9 pb-2.5 text-center text-white shadow-md transition-shadow hover:shadow-lg",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          lead ? "bg-org-lead" : "bg-org-member",
          (selected || onPath) && "ring-2 ring-offset-2 ring-offset-background",
          selected ? "ring-primary" : onPath && "ring-primary/40",
        )}>
        <span className={cn("absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-background p-0.5 shadow-sm ring-2", lead ? "ring-org-lead" : "ring-org-member")}>
          <PersonAvatar name={n.name} src={n.photo} className="size-13" />
        </span>
        <span className="flex w-full min-w-0 items-baseline justify-center gap-1.5">
          <span className="truncate text-sm font-semibold">{n.name}</span>
          <span className="shrink-0 rounded bg-white/15 px-1 text-[10px] font-medium tabular" title="Level below the top">L{n.level}</span>
        </span>
        <span className="w-full truncate text-xs text-white/85" title={n.title}>{n.title || "–"}</span>
        <span className="mt-auto flex w-full items-center justify-between gap-2 text-[11px] text-white/85">
          <span className="truncate tabular">{lead ? `${n.direct} direct · ${n.total} in all` : "Team member"}</span>
          <span className={cn("shrink-0 rounded px-1.5 py-px font-medium tabular", BAND_CLASS[band])}
            title={n.total ? "Required skill ratings on target, them and everyone below" : "Their required skill ratings on target"}>
            {n.onTargetPct == null ? "·" : `${n.onTargetPct}%`}
          </span>
        </span>
      </button>
      {lead && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggle(n.id); }} aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} the ${n.direct} people reporting to ${n.name}`}
          className="nodrag nopan absolute -bottom-3 left-1/2 z-10 inline-flex h-6 -translate-x-1/2 cursor-pointer items-center gap-0.5 rounded-full border bg-background px-2 text-[11px] font-medium text-foreground shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}{n.direct}
        </button>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} className={hidden} />
    </div>
  );
}

function OrgEdge({ data }: EdgeProps<OrgEdgeT>) {
  if (!data) return null;
  return <BaseEdge path={data.path} style={{ stroke: data.hot ? "var(--primary)" : "var(--org-line)", strokeWidth: data.hot ? 2 : 1.5 }} />;
}

const nodeTypes = { person: PersonNode };
const edgeTypes = { org: OrgEdge };

function useWide() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia("(min-width: 1024px)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}

function Details({ n, href, onClose }: { n: OrgNode; href: (id: string) => string; onClose?: () => void }) {
  const state = useOrgInfo(n.id);
  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-3">
        <PersonAvatar name={n.name} src={n.photo} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{n.name}</div>
          <div className="truncate text-xs text-muted-foreground">{n.title || "–"} · L{n.level}</div>
        </div>
        {onClose && <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close details"><X /></Button>}
      </div>
      <InfoBody id={n.id} {...state} insideHref={href(n.id)} />
    </div>
  );
}

function Canvas({ nodes, rootIds, thresholds, href, focus }: {
  nodes: OrgNode[]; rootIds: string[]; thresholds: Thresholds; href: (id: string) => string; focus: { id: string; at: number } | null;
}) {
  const rf = useReactFlow();
  const { resolvedTheme } = useTheme();
  // the server cannot know the theme: render light first, switch once mounted (no hydration mismatch)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wide = useWide();
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const kids = useMemo(() => {
    const m = new Map<string, OrgNode[]>();
    for (const n of nodes) if (n.managerId && byId.has(n.managerId)) m.set(n.managerId, [...(m.get(n.managerId) ?? []), n]);
    for (const list of m.values()) list.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return m;
  }, [nodes, byId]);

  // open on three levels: the top and two below it
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const walk = (id: string, d: number) => { if (d < 2 && kids.has(id)) { s.add(id); for (const k of kids.get(id)!) walk(k.id, d + 1); } };
    rootIds.forEach((r) => walk(r, 0));
    return s;
  });
  const [selected, setSelected] = useState<string | null>(null);
  const after = useRef<{ center?: string; fit?: boolean; fitIds?: string[] } | null>(null);

  // refit when the chart's width changes a lot (a phone turned, a window resized), unless
  // the viewer has already moved or zoomed it themselves
  const box = useRef<HTMLElement>(null);
  const touched = useRef(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (Math.abs(w - width) < 80) return;
      width = w;
      if (!touched.current) rf.fitView({ padding: 0.15, maxZoom: 1 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [rf]);
  const openRef = useRef(expanded);
  openRef.current = expanded;

  const layout = useMemo(() => {
    const build = (id: string): TreeIn => ({ id, children: expanded.has(id) ? (kids.get(id) ?? []).map((k) => build(k.id)) : [] });
    return layoutForest(rootIds.filter((r) => byId.has(r)).map(build));
  }, [rootIds, byId, kids, expanded]);

  const onPath = useMemo(() => {
    const s = new Set<string>();
    for (let cur = selected; cur && byId.has(cur) && !s.has(cur); cur = byId.get(cur)!.managerId) s.add(cur);
    return s;
  }, [selected, byId]);

  const onToggle = useCallback((id: string) => {
    const opening = !openRef.current.has(id);
    setExpanded((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
    // opening: bring the person and everyone just revealed into view; closing: keep them in view
    after.current = opening ? { fitIds: [id, ...(kids.get(id) ?? []).map((k) => k.id)] } : { center: id };
  }, [kids]);
  const onSelect = useCallback((id: string) => setSelected((cur) => (cur === id ? null : id)), []);

  const rfNodes: PersonNodeT[] = useMemo(() => layout.nodes.map((p) => ({
    id: p.id, type: "person", position: { x: p.x, y: p.y }, width: CARD.w, height: CARD.h,
    draggable: false, selectable: false, connectable: false,
    data: { n: byId.get(p.id)!, expanded: expanded.has(p.id), selected: selected === p.id, onPath: onPath.has(p.id) && selected !== p.id, thresholds, onToggle, onSelect },
  })), [layout, byId, expanded, selected, onPath, thresholds, onToggle, onSelect]);
  const rfEdges: OrgEdgeT[] = useMemo(() => layout.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target, type: "org", selectable: false, focusable: false,
    data: { path: e.path, hot: onPath.has(e.source) && onPath.has(e.target) },
  })), [layout, onPath]);

  // after a layout change: keep the person just opened in view, or fit everything
  useEffect(() => {
    const todo = after.current;
    if (!todo) return;
    after.current = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : 300;
    if (todo.fit) { requestAnimationFrame(() => rf.fitView({ padding: 0.15, maxZoom: 1, duration })); return; }
    if (todo.fitIds) {
      const ids = todo.fitIds;
      requestAnimationFrame(() => rf.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.2, maxZoom: 1, duration }));
      return;
    }
    const p = layout.nodes.find((x) => x.id === todo.center);
    if (p) requestAnimationFrame(() => rf.setCenter(p.x + CARD.w / 2, p.y + CARD.h / 2 + 60, { zoom: Math.max(rf.getZoom(), 0.6), duration }));
  }, [layout, rf]);

  // a person picked in the search: open the way down to them, select and centre them
  useEffect(() => {
    if (!focus || !byId.has(focus.id)) return;
    setExpanded((s) => {
      const x = new Set(s);
      for (let cur = byId.get(focus.id)!.managerId; cur && byId.has(cur) && !x.has(cur); cur = byId.get(cur)!.managerId) x.add(cur);
      return x;
    });
    setSelected(focus.id);
    after.current = { center: focus.id };
  }, [focus, byId]);

  const all = () => { setExpanded(new Set([...kids.keys()].filter((k) => byId.has(k)))); after.current = { fit: true }; };
  const fold = () => { setExpanded(new Set()); setSelected(null); after.current = { fit: true }; };
  const sel = selected ? byId.get(selected) ?? null : null;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section ref={box} className="h-[min(78svh,860px)] min-h-[420px] min-w-0 overflow-hidden rounded-lg border bg-card" aria-label="Org chart">
        <ReactFlow
          nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          colorMode={mounted && resolvedTheme === "dark" ? "dark" : "light"}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} edgesFocusable={false}
          zoomOnDoubleClick={false} minZoom={0.05} maxZoom={1.6}
          fitView fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          onNodeClick={(_, node) => onSelect(node.id)}
          onPaneClick={() => setSelected(null)}
          onMoveStart={(e) => { if (e) touched.current = true; /* a person moved it, not code */ }}
          attributionPosition="top-right"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
          <Panel position="top-left" className="!m-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={all}><ListTree />Expand all</Button>
            <Button size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={fold}><Minimize2 />Collapse</Button>
            <Button size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => rf.fitView({ padding: 0.15, maxZoom: 1, duration: 300 })}><Maximize />Fit</Button>
          </Panel>
          <Controls showInteractive={false} position="bottom-left" />
          {wide && <MiniMap position="bottom-right" pannable zoomable style={{ width: 150, height: 100 }} ariaLabel="Overview of the whole chart"
            nodeColor={(n) => ((n.data as PersonData).n.direct ? "var(--org-lead)" : "var(--org-member)")} nodeBorderRadius={8} />}
        </ReactFlow>
      </section>
      {wide ? (
        <aside className="h-fit rounded-lg border bg-card p-4 lg:sticky lg:top-16" aria-label="Details">
          {sel ? <Details key={sel.id} n={sel} href={href} onClose={() => setSelected(null)} />
            : <p className="text-sm text-muted-foreground">Select a person to see their details: who they report to, their team, and where the skills below them are thin.</p>}
        </aside>
      ) : (
        <Sheet open={!!sel} onOpenChange={(o) => { if (!o) setSelected(null); }}>
          <SheetContent side="bottom" className="max-h-[75svh] overflow-y-auto rounded-t-xl p-4">
            <SheetHeader className="sr-only"><SheetTitle>{sel?.name ?? "Details"}</SheetTitle><SheetDescription>Details for the selected person</SheetDescription></SheetHeader>
            {sel && <Details key={sel.id} n={sel} href={href} />}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

export function OrgCanvas(props: Parameters<typeof Canvas>[0]) {
  return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>;
}
