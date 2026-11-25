// The next step: a button in the header of every page, and the first thing on Home.
import Link from "next/link";
import { ArrowRight, CircleCheck, Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/info";
import { cn } from "@/lib/utils";
import type { NextStep } from "@/lib/next-steps";

/** Header: the one thing to do next, one click away from any page. */
export function NextStepButton({ step }: { step: NextStep | undefined }) {
  if (!step || step.kind !== "do") return null;
  return (
    <Button asChild size="sm" className="h-8 min-w-0 max-w-[22rem] shrink">
      <Link href={step.href} title={`${step.title}. ${step.detail}`}>
        <Footprints />
        {/* a phone has room for the two words; the step itself is one tap away */}
        <span className="sm:hidden">Next step</span>
        <span className="hidden sm:inline">Next:</span>
        <span className="hidden truncate sm:inline">{step.title}</span>
      </Link>
    </Button>
  );
}

/** Home: the next step in full, then what comes after it. */
export function NextSteps({ steps }: { steps: NextStep[] }) {
  if (!steps.length) return null;
  const [first, ...rest] = steps;
  return (
    <section className="mb-5 grid gap-2" aria-label="Your next steps">
      <div className={cn("flex flex-wrap items-center gap-3 rounded-lg border p-4",
        first.kind === "do" ? "border-primary/40 bg-primary/5" : "bg-card")}>
        {first.kind === "do" ? <Footprints className="size-5 shrink-0 text-primary" /> : <CircleCheck className="size-5 shrink-0 text-status-meets-fg dark:text-emerald-400" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {first.kind === "do" ? "Your next step" : "All done"}
            <Info label="About next steps">What matters most for you to do now, worked out from your role and what is waiting: your own skills first, then your team, then the organisation. The same step is the button at the top of every page.</Info>
          </div>
          <div className="text-base font-semibold">{first.title}</div>
          <div className="text-sm text-muted-foreground">{first.detail}</div>
        </div>
        <Button asChild variant={first.kind === "do" ? "default" : "outline"}><Link href={first.href}>{first.action}<ArrowRight /></Link></Button>
      </div>
      {rest.length > 0 && (
        <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {rest.slice(0, 6).map((s) => (
            <li key={s.key}>
              <Link href={s.href} className="flex h-full items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent/50">
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0"><span className="font-medium">{s.title}</span><span className="block text-xs text-muted-foreground">{s.detail}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
