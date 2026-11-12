"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, Network, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersonAvatar } from "@/components/person-avatar";
import { BAND_CLASS, pctBand } from "@/lib/status";
import { cn } from "@/lib/utils";
import { OrgCanvas } from "./org-canvas";
import { InfoPopover } from "./org-info";

export interface OrgNode {
  id: string; name: string; title: string; managerId: string | null; level: number;
  direct: number; total: number; onTargetPct: number | null; photo: string | null;
}

export type OrgView = "chart" | "list";

export function OrgTree({ nodes, rootIds, thresholds, view, viewHref }: {
  nodes: OrgNode[]; rootIds: string[]; thresholds: { greenAt: number; amberAt: number };
  view: OrgView; viewHref: Record<OrgView, string>;
}) {
  // going inside keeps the chosen view
  const href = (id: string) => `/org?root=${id}${view === "list" ? "&view=list" : ""}`;
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const kids = useMemo(() => {
    const m = new Map<string, OrgNode[]>();
    for (const n of nodes) if (n.managerId && byId.has(n.managerId)) m.set(n.managerId, [...(m.get(n.managerId) ?? []), n]);
    for (const list of m.values()) list.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return m;
  }, [nodes, byId]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(rootIds));
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<{ id: string; at: number } | null>(null);
  const levels = useMemo(() => {
    const m = new Map<number, number>();
    for (const n of nodes) m.set(n.level, (m.get(n.level) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [nodes]);
  const matches = query.trim().length >= 2
    ? nodes.filter((n) => `${n.name} ${n.title}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12)
    : [];

  const expandTo = (level: number) => setOpen(new Set(nodes.filter((n) => n.level < level && kids.has(n.id)).map((n) => n.id)));

  const Row = ({ n, depth }: { n: OrgNode; depth: number }) => {
    const children = kids.get(n.id) ?? [];
    const isOpen = open.has(n.id);
    const band = pctBand(n.onTargetPct, thresholds);
    return (
      <li>
        <div className="group flex items-center gap-2 rounded-md py-1 pr-2 hover:bg-muted/60" style={{ paddingLeft: depth * 24 + 4 }}>
          <button type="button" aria-label={isOpen ? `Collapse ${n.name}` : `Expand ${n.name}`} disabled={!children.length}
            onClick={() => setOpen((s) => { const x = new Set(s); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; })}
            className={cn("flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent", !children.length && "invisible")}>
            <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
          </button>
          <PersonAvatar name={n.name} src={n.photo} className="size-7" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <Link href={href(n.id)} className="truncate text-sm font-medium hover:underline" title="Go inside">{n.name}</Link>
              <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground tabular" title="Level below the top">L{n.level}</span>
            </div>
            <div className="truncate text-xs text-muted-foreground">{n.title || "–"}</div>
          </div>
          <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground tabular sm:block">
            {n.direct ? `${n.direct} direct · ${n.total}` : ""}
          </span>
          <span className={cn("w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-medium tabular", BAND_CLASS[band])}
            title={n.total ? "Required skill ratings on target, them and everyone below" : "Their required skill ratings on target"}>
            {n.onTargetPct == null ? "·" : `${n.onTargetPct}%`}
          </span>
          <InfoPopover id={n.id} name={n.name} />
        </div>
        {isOpen && children.length > 0 && (
          <ul>{children.map((c) => <Row key={c.id} n={c} depth={depth + 1} />)}</ul>
        )}
      </li>
    );
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person…" className="h-8 w-64 pl-8" aria-label="Find a person" />
          {matches.length > 0 && (
            <ul className="absolute z-20 mt-1 w-80 rounded-md border bg-popover p-1 shadow-md">
              {matches.map((m) => (
                <li key={m.id}>
                  <Link href={href(m.id)} onClick={(e) => { setQuery(""); if (view === "chart") { e.preventDefault(); setFocus({ id: m.id, at: Date.now() }); } }} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                    <PersonAvatar name={m.name} src={m.photo} className="size-6" />
                    <span className="min-w-0 flex-1 truncate">{m.name}<span className="ml-1 text-xs text-muted-foreground">{m.title}</span></span>
                    <span className="text-[10px] text-muted-foreground">L{m.level}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="View">
          {([["chart", "Chart", Network], ["list", "List", List]] as const).map(([k, label, Icon]) => (
            <Link key={k} href={viewHref[k]} aria-current={view === k ? "page" : undefined}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs", view === k ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-3.5" />{label}
            </Link>
          ))}
        </div>
        {view === "list" && <>
        <span className="text-xs text-muted-foreground">Open to level</span>
        {levels.map(([lvl, count]) => (
          <Button key={lvl} variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => expandTo(lvl + 1)} title={`${count} people at level ${lvl}`}>
            L{lvl}<span className="text-muted-foreground tabular">{count}</span>
          </Button>
        ))}
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setOpen(new Set(rootIds))}>Collapse</Button>
        </>}
      </div>
      {view === "chart" ? (
        <OrgCanvas nodes={nodes} rootIds={rootIds} href={href} thresholds={thresholds} focus={focus} />
      ) : (
        <div className="rounded-lg border bg-card p-2">
          <ul>{rootIds.map((id) => byId.get(id)).filter((n): n is OrgNode => !!n).map((n) => <Row key={n.id} n={n} depth={0} />)}</ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {view === "chart" ? "Blue cards lead a team; olive cards are team members. Drag to move, scroll or pinch to zoom; the number under a card shows or hides their people. " : ""}Level L0 is the top of the organisation. The percentage is the share of required skill ratings at or above target, for the person and everyone below them.
      </p>
    </div>
  );
}
