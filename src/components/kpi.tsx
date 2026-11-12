import Link from "next/link";
import { cn } from "@/lib/utils";

export interface Kpi {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "good" | "warn" | "bad";
  href?: string;
}

const TONE: Record<NonNullable<Kpi["tone"]>, string> = {
  default: "",
  good: "text-status-meets-fg dark:text-foreground",
  warn: "text-[color:var(--status-minor-fg)] dark:text-foreground",
  bad: "text-status-critical dark:text-[color:oklch(0.75_0.15_27)]",
};

export function KpiTiles({ items }: { items: Kpi[] }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((k) => {
        const body = (
          <>
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className={cn("mt-1 text-2xl font-semibold tracking-tight tabular", TONE[k.tone ?? "default"])}>{k.value}</div>
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:line-clamp-1">{k.hint}</div>
          </>
        );
        return k.href ? (
          <Link key={k.label} href={k.href} className="rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50">{body}</Link>
        ) : (
          <div key={k.label} className="rounded-lg border bg-card px-4 py-3">{body}</div>
        );
      })}
    </div>
  );
}

export function Section({ title, description, actions, children, className }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
