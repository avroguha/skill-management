"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Info, Search, Loader2, ArrowUpRight, Network, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PersonAvatar } from "@/components/person-avatar";
import { orgInfo, type OrgInfo } from "@/app/actions/org";
import { BAND_CLASS, pctBand } from "@/lib/status";
import { cn } from "@/lib/utils";
import { OrgChart } from "./org-chart";

export interface OrgNode {
  id: string; name: string; title: string; managerId: string | null; level: number;
  direct: number; total: number; onTargetPct: number | null; photo: string | null;
}

export function InfoPanel({ id, name, className }: { id: string; name: string; className?: string }) {
  const [info, setInfo] = useState<OrgInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Popover onOpenChange={(o) => {
      if (o && !info) start(async () => {
        const r = await orgInfo(id);
        if (r.ok) setInfo(r.info); else setError(r.error);
      });
    }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("size-7", className)} aria-label={`Details for ${name}`}><Info className="size-3.5" /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="end" collisionPadding={16}>
        {pending && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</p>}
        {error && <p className="text-destructive">{error}</p>}
        {info && (
          <div className="grid gap-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {([
                ["Login", info.userName], ["E-mail", info.email], ["Manager", info.manager], ["Team", info.unit],
                ["Role", info.role && `${info.role}${info.grade ? ` · ${info.grade}` : ""}`], ["Location", info.location],
                ["Source", info.source === "directory" ? `ServiceNow${info.userType ? ` (${info.userType})` : ""}` : "added here"],
                ["Synced", info.syncedAt && new Date(info.syncedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })],
              ] as const).filter(([, val]) => val).map(([k, val]) => (
                <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="truncate">{val}</dd></div>
              ))}
            </dl>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted p-1.5"><div className="text-sm font-semibold tabular">{info.total}</div><div className="text-[10px] text-muted-foreground">below</div></div>
              <div className="rounded-md bg-muted p-1.5"><div className="text-sm font-semibold tabular">{info.onTargetPct ?? "–"}{info.onTargetPct != null && "%"}</div><div className="text-[10px] text-muted-foreground">on target</div></div>
              <div className="rounded-md bg-muted p-1.5"><div className="text-sm font-semibold tabular">{info.assessedPct ?? "–"}{info.assessedPct != null && "%"}</div><div className="text-[10px] text-muted-foreground">assessed</div></div>
            </div>
            {info.weakest.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium">Weakest skills{info.total ? " below" : ""}</div>
                <ul className="grid gap-0.5 text-xs">{info.weakest.map((w) => <li key={w.skill} className="flex justify-between gap-2"><span className="truncate">{w.skill}</span><span className="tabular text-muted-foreground">{w.met}/{w.required} on target</span></li>)}</ul>
              </div>
            )}
            {info.shortNeeds.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium">Team needs short</div>
                <ul className="grid gap-0.5 text-xs">{info.shortNeeds.map((n) => <li key={n.skill + n.unit} className="flex justify-between gap-2"><span className="truncate">{n.skill}</span><span className="tabular text-muted-foreground">{n.have} of {n.need}</span></li>)}</ul>
              </div>
            )}
            <Link href={`/people/${id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Open profile<ArrowUpRight className="size-3" /></Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
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
          <InfoPanel id={n.id} name={n.name} />
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
                  <Link href={href(m.id)} onClick={() => setQuery("")} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
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
        <OrgChart rootIds={rootIds} byId={byId} kids={kids} href={href} thresholds={thresholds} />
      ) : (
        <div className="rounded-lg border bg-card p-2">
          <ul>{rootIds.map((id) => byId.get(id)).filter((n): n is OrgNode => !!n).map((n) => <Row key={n.id} n={n} depth={0} />)}</ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {view === "chart" ? "Blue cards lead a team; olive cards are team members. The chart shows three levels: click a name to go further down. " : ""}Level L0 is the top of the organisation. The percentage is the share of required skill ratings at or above target, for the person and everyone below them.
      </p>
    </div>
  );
}
