"use client";
// The two heatmaps (IDEAS.md section 4).
//  UnitHeatmap   rows = units, columns = categories or skills, cell = % of required
//                (person, skill) pairs on target. Click a row to drill in.
//  PeopleHeatmap rows = people, columns = skills grouped by category, cell = the level,
//                coloured by the GAP to that person's target. Footer = team coverage.
import Link from "next/link";
import { Clock, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BAND_CLASS, GAP_CLASS, GAP_LABEL, pctBand } from "@/lib/status";
import type { GapCategory } from "@/lib/engine/engine";

type Agg = { people: number; required: number; met: number; assessed: number; stale: number; pct: number | null };
export interface Thresholds { greenAt: number; amberAt: number }

export interface UnitHeatmapData {
  columns: { id: string; name: string; href: string | null; total: Agg }[];
  rows: { id: string; name: string; kind: string; href: string | null; people: number; total: Agg; cells: Record<string, Agg> }[];
  total: Agg;
}

function AggCell({ a, thresholds, label }: { a: Agg; thresholds: Thresholds; label: string }) {
  const band = pctBand(a.pct, thresholds);
  if (a.required === 0) return <div className="flex h-9 items-center justify-center rounded-sm bg-status-none text-xs text-status-none-fg" aria-label={`${label}: nothing required`}>·</div>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex h-9 items-center justify-center rounded-sm text-xs font-medium tabular", BAND_CLASS[band])}>
          {a.pct}%
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="font-medium">{label}</div>
        <div>{a.met} of {a.required} required skill ratings on target</div>
        <div>{a.assessed} assessed · {a.people} people{a.stale ? ` · ${a.stale} stale` : ""}</div>
      </TooltipContent>
    </Tooltip>
  );
}

export function UnitHeatmap({ data, thresholds }: { data: UnitHeatmapData; thresholds: Thresholds }) {
  if (!data.rows.length) return <Empty>No people in this unit yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="w-56 min-w-44 text-left text-xs font-medium text-muted-foreground" />
            {data.columns.map((c) => (
              <th key={c.id} className="min-w-20 px-1 text-center align-bottom text-xs font-medium text-muted-foreground">
                {c.href ? <Link href={c.href} className="hover:text-foreground hover:underline">{c.name}</Link> : c.name}
              </th>
            ))}
            <th className="min-w-20 px-1 text-center align-bottom text-xs font-semibold">All</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="text-left font-normal">
                <div className="flex items-baseline justify-between gap-2 pr-2">
                  {r.href ? (
                    <Link href={r.href} className="truncate font-medium hover:underline">{r.name}</Link>
                  ) : <span className="truncate text-muted-foreground">{r.name}</span>}
                  <span className="shrink-0 text-xs text-muted-foreground tabular">{r.people}</span>
                </div>
              </th>
              {data.columns.map((c) => <td key={c.id}><AggCell a={r.cells[c.id]} thresholds={thresholds} label={`${r.name} · ${c.name}`} /></td>)}
              <td><AggCell a={r.total} thresholds={thresholds} label={`${r.name} · all`} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="pt-1 text-left text-xs font-semibold">All</th>
            {data.columns.map((c) => <td key={c.id} className="pt-1"><AggCell a={c.total} thresholds={thresholds} label={`All · ${c.name}`} /></td>)}
            <td className="pt-1"><AggCell a={data.total} thresholds={thresholds} label="All" /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export interface PeopleCell {
  target: number | null; level: number | null; category: GapCategory; stale: boolean; pending: boolean;
  selfLevel: number | null; validatedLevel: number | null; source: string | null; mandatory: boolean; at: string | null; interest: boolean;
}
export interface PeopleHeatmapData {
  columns: { id: string; name: string; category: string; href: string; coverage: { count: number; headcount: number; level: number; spof: boolean; shortfall: number; explicit: boolean } | null }[];
  rows: { id: string; name: string; title: string; href: string; onTargetPct: number | null; cells: Record<string, PeopleCell> }[];
}

const SOURCE_LABEL: Record<string, string> = { person: "set for this person", grade: "role and grade", role: "role" };

function PersonCell({ c, levels, label }: { c: PeopleCell; levels: string[]; label: string }) {
  const cls = c.target == null && c.level != null ? "bg-status-none text-foreground/70" : GAP_CLASS[c.category];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("relative flex size-8 items-center justify-center rounded-sm text-xs font-medium tabular", cls, c.stale && "opacity-55 ring-1 ring-inset ring-current/40")}>
          {c.level ?? (c.target != null ? "–" : "")}
          {c.pending && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" />}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-xs">
        <div className="font-medium">{label}</div>
        <div>{GAP_LABEL[c.target == null ? "not_required" : c.category]}{c.mandatory ? "" : c.target != null ? " (optional)" : ""}</div>
        {c.target != null && <div>Target {c.target} {levels[c.target]} · {SOURCE_LABEL[c.source ?? ""] ?? ""}</div>}
        <div>Validated {c.validatedLevel != null ? `${c.validatedLevel} ${levels[c.validatedLevel]}` : "–"} · Self {c.selfLevel ?? "–"}</div>
        {c.at && <div className={cn(c.stale && "font-medium")}>{c.stale ? "Stale: " : "Assessed "}{new Date(c.at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</div>}
        {c.pending && <div>Awaiting manager validation</div>}
        {c.interest && <div>Wants to grow this skill</div>}
      </TooltipContent>
    </Tooltip>
  );
}

function CoverageCell({ cov }: { cov: PeopleHeatmapData["columns"][number]["coverage"] }) {
  if (!cov) return <div className="h-7 text-center text-xs text-muted-foreground">·</div>;
  const cls = cov.count === 0 ? "bg-status-critical text-status-critical-fg"
    : cov.shortfall > 0 ? "bg-status-significant text-status-significant-fg"
      : cov.spof ? "bg-status-minor text-status-minor-fg" : "bg-status-meets text-status-meets-fg";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex h-7 w-8 items-center justify-center rounded-sm text-[11px] font-medium tabular", cls)}>
          {cov.count}/{cov.headcount}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <div>{cov.count} {cov.count === 1 ? "person" : "people"} at level {cov.level}+ · need {cov.headcount}</div>
        <div>{cov.explicit ? "Team requirement" : "Implied by the roles in this team"}</div>
        {cov.spof && <div className="font-medium">Single point of failure</div>}
      </TooltipContent>
    </Tooltip>
  );
}

export function PeopleHeatmap({ data, levels }: { data: PeopleHeatmapData; levels: string[] }) {
  if (!data.rows.length) return <Empty>No people match these filters.</Empty>;
  if (!data.columns.length) return <Empty>Nothing left to show: every requirement here is met. Turn off “Only gaps” to see all skills.</Empty>;
  const groups: { name: string; span: number }[] = [];
  for (const c of data.columns) {
    const last = groups[groups.length - 1];
    if (last && last.name === c.category) last.span += 1;
    else groups.push({ name: c.category, span: 1 });
  }
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-sm">
        <thead>
          <tr>
            <th />
            {groups.map((g, i) => (
              <th key={i} colSpan={g.span} className="border-b px-1 pb-1 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className="block max-w-full truncate" title={g.name}>{g.name}</span>
              </th>
            ))}
          </tr>
          <tr>
            <th className="sticky left-0 z-10 min-w-48 bg-card" />
            {data.columns.map((c) => (
              <th key={c.id} className="h-32 w-8 align-bottom font-normal">
                <Link href={c.href} className="mx-auto block max-h-32 truncate text-left text-xs text-muted-foreground [writing-mode:vertical-rl] rotate-180 hover:text-foreground" title={c.name}>
                  {c.name}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="sticky left-0 z-10 bg-card pr-3 text-left font-normal">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={r.href} className="block truncate text-sm font-medium hover:underline">{r.name}</Link>
                    <div className="truncate text-xs text-muted-foreground">{r.title}</div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular">{r.onTargetPct == null ? "" : `${r.onTargetPct}%`}</span>
                </div>
              </th>
              {data.columns.map((c) => <td key={c.id}><PersonCell c={r.cells[c.id]} levels={levels} label={`${r.name} · ${c.name}`} /></td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="sticky left-0 z-10 bg-card pt-2 pr-3 text-left text-xs font-medium text-muted-foreground">
              Coverage <span className="font-normal">(have / need)</span>
            </th>
            {data.columns.map((c) => <td key={c.id} className="pt-2"><CoverageCell cov={c.coverage} /></td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function HeatLegend({ mode }: { mode: "people" | "units"; }) {
  const item = (cls: string, text: string, sample = "") => (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-flex size-4 items-center justify-center rounded-[3px] text-[9px] font-medium", cls)}>{sample}</span>
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {mode === "units" ? (
        <>
          {item(BAND_CLASS.good, "On target")}
          {item(BAND_CLASS.watch, "Watch")}
          {item(BAND_CLASS.poor, "Below")}
          {item(BAND_CLASS.none, "Nothing required", "·")}
          <span>Cell = share of required skill ratings at or above target</span>
        </>
      ) : (
        <>
          {item(GAP_CLASS.meets, "Meets", "3")}
          {item(GAP_CLASS.minor, "1 below", "2")}
          {item(GAP_CLASS.significant, "2 below", "1")}
          {item(GAP_CLASS.critical, "Critical", "0")}
          {item(GAP_CLASS.not_required, "Not required")}
          {item(GAP_CLASS.unassessed, "Not assessed", "–")}
          <span className="flex items-center gap-1.5"><span className="relative inline-flex size-4 rounded-[3px] bg-muted"><span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" /></span>Awaiting validation</span>
          <span className="flex items-center gap-1.5"><Clock className="size-3.5" />Faded = stale</span>
        </>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed px-4 py-8 text-sm text-muted-foreground">
      <AlertTriangle className="size-4" />{children}
    </div>
  );
}
