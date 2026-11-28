// Number tiles and page sections. Every tile and section says what it shows through its (i).
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Info } from "@/components/info";
import { PersonAvatar } from "@/components/person-avatar";

export interface Kpi {
  label: string;
  value: string;
  /** one short line under the number */
  hint: string;
  /** what the number is and how it is worked out: shown by the (i) */
  info: string;
  tone?: "default" | "good" | "warn" | "bad";
  href?: string;
  /** the value is a person's name: their picture goes with it */
  person?: { name: string; src?: string | null };
}

const TONE: Record<NonNullable<Kpi["tone"]>, string> = {
  default: "",
  good: "text-status-meets-fg dark:text-foreground",
  warn: "text-[color:var(--status-minor-fg)] dark:text-foreground",
  bad: "text-status-critical dark:text-[color:oklch(0.75_0.15_27)]",
};

export function KpiTiles({ items, className }: { items: Kpi[]; className?: string }) {
  return (
    <div className={cn("mb-5 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]", className)}>
      {items.map((k) => {
        const body = (
          <>
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className={cn("mt-1 text-2xl font-semibold tracking-tight tabular", TONE[k.tone ?? "default"], k.person && "flex items-center gap-2 text-lg leading-8")}>{k.person && <PersonAvatar name={k.person.name} src={k.person.src} size="sm" />}<span className="min-w-0 truncate">{k.value}</span></div>
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{k.hint}</div>
          </>
        );
        return (
          <div key={k.label} className="relative rounded-lg border bg-card transition-colors has-[a:hover]:bg-accent/50">
            {k.href ? <Link href={k.href} className="block px-4 py-3 pr-8">{body}</Link> : <div className="px-4 py-3 pr-8">{body}</div>}
            <Info className="absolute right-3 top-3" label={`About ${k.label}`}>{k.info}</Info>
          </div>
        );
      })}
    </div>
  );
}

export function Section({ title, description, info, actions, children, className, id, style, headClassName }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** what this section shows: the (i) next to the title */
  info?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** e.g. a role's tint (--tint), for the tint classes */
  style?: React.CSSProperties;
  /** for the band the title is in */
  headClassName?: string;
}) {
  return (
    <section id={id} style={style} className={cn("min-w-0 rounded-lg border bg-card", className)}>
      <div className={cn("flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3", headClassName)}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">{title}{info ? <Info label="About this section">{info}</Info> : null}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
