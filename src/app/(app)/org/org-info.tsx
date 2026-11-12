"use client";
// A person's important details: loaded on demand, shown in the org chart's side panel
// (or bottom sheet on a phone), and in a popover from the list view.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Info, Loader2, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { orgInfo, type OrgInfo } from "@/app/actions/org";

const cache = new Map<string, OrgInfo>();

export function useOrgInfo(id: string | null) {
  const [info, setInfo] = useState<OrgInfo | null>(id ? cache.get(id) ?? null : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!id) { setInfo(null); return; }
    const hit = cache.get(id);
    if (hit) { setInfo(hit); setError(null); return; }
    let live = true;
    setLoading(true); setError(null); setInfo(null);
    orgInfo(id).then((r) => {
      if (!live) return;
      if (r.ok) { cache.set(id, r.info); setInfo(r.info); } else setError(r.error);
    }).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [id]);
  return { info, error, loading };
}

export function InfoBody({ id, info, error, loading, insideHref }: { id: string; info: OrgInfo | null; error: string | null; loading: boolean; insideHref?: string }) {
  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!info) return null;
  return (
    <div className="grid gap-3 text-sm">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        {([
          ["Login", info.userName], ["E-mail", info.email], ["Manager", info.manager], ["Team", info.unit],
          ["Role", info.role && `${info.role}${info.grade ? ` · ${info.grade}` : ""}`], ["Location", info.location],
          ["Source", info.source === "directory" ? `ServiceNow${info.userType ? ` (${info.userType})` : ""}` : "added here"],
          ["Synced", info.syncedAt && new Date(info.syncedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })],
        ] as const).filter(([, val]) => val).map(([k, val]) => (
          <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="truncate" title={String(val)}>{val}</dd></div>
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
          <ul className="grid gap-0.5 text-xs">{info.weakest.map((w) => <li key={w.skill} className="flex justify-between gap-2"><span className="truncate">{w.skill}</span><span className="shrink-0 tabular text-muted-foreground">{w.met}/{w.required} on target</span></li>)}</ul>
        </div>
      )}
      {info.shortNeeds.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium">Team needs short</div>
          <ul className="grid gap-0.5 text-xs">{info.shortNeeds.map((n) => <li key={n.skill + n.unit} className="flex justify-between gap-2"><span className="truncate">{n.skill}</span><span className="shrink-0 tabular text-muted-foreground">{n.have} of {n.need}</span></li>)}</ul>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href={`/people/${id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Open profile<ArrowUpRight className="size-3" /></Link>
        {insideHref && info.direct > 0 && (
          <Link href={insideHref} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><Network className="size-3" />Show only this part</Link>
        )}
      </div>
    </div>
  );
}

/** The list view's "i": a popover beside the row, never over the rows above it. */
export function InfoPopover({ id, name, className }: { id: string; name: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const state = useOrgInfo(open ? id : null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={className ?? "size-7"} aria-label={`Details for ${name}`}><Info className="size-3.5" /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" side="left" align="start">
        <InfoBody id={id} {...state} />
      </PopoverContent>
    </Popover>
  );
}
