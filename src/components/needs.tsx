// Team needs that are short or rest on one person - capability only, no suggestion
// of what to do about it.
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface NeedView {
  key: string;
  unit: string;
  unitHref: string;
  skill: string;
  skillHref: string;
  level: number;
  levelName: string;
  count: number;
  headcount: number;
  critical: boolean;
  spof: boolean;
  explicit: boolean;
  holders: string[];
}

export function coverageChipClass(n: Pick<NeedView, "critical" | "count" | "headcount" | "spof">) {
  return n.critical ? "bg-status-critical text-status-critical-fg"
    : n.count < n.headcount ? "bg-status-significant text-status-significant-fg"
      : n.spof ? "bg-status-minor text-status-minor-fg" : "bg-status-meets text-status-meets-fg";
}

export function NeedList({ items, empty = "Every team need in this unit is covered by two or more people." }: { items: NeedView[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {items.map((n) => (
        <li key={n.key} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <Link href={n.skillHref} className="font-medium hover:underline">{n.skill}</Link>
              <span className="text-xs text-muted-foreground">level {n.level}+ {n.levelName}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              <Link href={n.unitHref} className="hover:underline">{n.unit}</Link>
              {" · "}
              {n.critical ? <span className="font-medium text-status-critical dark:text-[color:oklch(0.75_0.15_27)]">nobody at this level</span>
                : n.spof ? <span>only {n.holders[0]}</span>
                  : <span>{n.holders.slice(0, 3).join(", ")}{n.holders.length > 3 ? ` +${n.holders.length - 3}` : ""}</span>}
              {!n.explicit && " · implied by roles"}
            </div>
          </div>
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs font-medium tabular", coverageChipClass(n))}
            title={`${n.count} of ${n.headcount} needed`}>
            {n.count} / {n.headcount}
          </span>
        </li>
      ))}
    </ul>
  );
}
