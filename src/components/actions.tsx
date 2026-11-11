import { GraduationCap, TrendingUp, ArrowRightLeft, UserPlus, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTION_LABEL } from "@/lib/status";

const ICON = { train: GraduationCap, develop: TrendingUp, move: ArrowRightLeft, hire: UserPlus, assess: ClipboardList };
const CLS = {
  train: "border-chart-2/40 bg-chart-2/10",
  develop: "border-chart-4/40 bg-chart-4/10",
  move: "border-chart-3/50 bg-chart-3/15",
  hire: "border-status-critical/40 bg-status-critical/10",
  assess: "border-border bg-muted",
};

export function ActionBadge({ action, count, className }: { action: keyof typeof ICON; count?: number; className?: string }) {
  const Icon = ICON[action];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", CLS[action], className)}>
      <Icon className="size-3" />
      {ACTION_LABEL[action]}{count != null && count > 0 ? ` ${count}` : ""}
    </span>
  );
}

export interface RecView {
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
  backupOnly: boolean;
  explicit: boolean;
  steps: { action: "train" | "develop" | "move" | "hire"; count: number; who: string[]; units: { name: string; spare: number }[] }[];
}

export function RecommendationList({ items, dense }: { items: RecView[]; dense?: boolean }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No team is short of a skill it needs. Nothing to act on here.</p>;
  return (
    <ul className="divide-y">
      {items.map((r) => (
        <li key={r.key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <a href={r.skillHref} className="font-medium hover:underline">{r.skill}</a>
              <span className="text-xs text-muted-foreground">level {r.level}+ {r.levelName}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              <a href={r.unitHref} className="hover:underline">{r.unit}</a>
              {" · "}
              <span className={cn(r.critical && "font-medium text-status-critical dark:text-[color:oklch(0.75_0.15_27)]")}>
                {r.backupOnly ? "one person holds it, no backup" : r.critical ? `nobody holds it, needs ${r.headcount}` : `${r.count} of ${r.headcount} needed`}
              </span>
              {!dense && r.steps.some((s) => s.who.length) && (
                <span> · {r.steps.filter((s) => s.who.length).map((s) => `${s.action === "train" ? "train" : "develop"} ${s.who.join(", ")}`).join("; ")}</span>
              )}
              {!dense && r.steps.some((s) => s.units.length) && (
                <span> · spare in {r.steps.flatMap((s) => s.units).map((u) => `${u.name} (${u.spare})`).join(", ")}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {r.steps.map((s, i) => <ActionBadge key={i} action={s.action} count={s.count} />)}
          </div>
        </li>
      ))}
    </ul>
  );
}
