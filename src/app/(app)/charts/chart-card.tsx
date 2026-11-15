"use client";
// One chart with its title, what it shows, its legend and notes, and the buttons that save it as
// a picture. The data attributes are what the PNG export reads (src/components/chart-view.tsx).
import { useRef, useState } from "react";
import { Download, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChartView, ChartLegend, downloadCardPng, copyCardPng, canCopyImage } from "@/components/chart-view";
import type { ChartResult, ChartType } from "@/lib/charts/query";
import { cn } from "@/lib/utils";

export function ChartCard({ title, description, type, result, splitByLevel, thresholds, actions, className, height }: {
  title: string; description?: string; type: ChartType; result: ChartResult; splitByLevel: boolean;
  thresholds: { greenAt: number; amberAt: number }; actions?: React.ReactNode; className?: string; height?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState<"png" | "copy" | null>(null);
  const run = async (what: "png" | "copy") => {
    if (!ref.current) return;
    setBusy(what);
    try {
      if (what === "png") await downloadCardPng(ref.current);
      else { await copyCardPng(ref.current); toast.success("Copied: paste it into a slide, a message or a document."); }
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  };
  return (
    <article ref={ref} data-chart-card className={cn("grid min-w-0 content-start gap-3 rounded-lg border bg-card p-4 text-card-foreground", className)} aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 data-export-title className="font-semibold">{title}</h3>
          {result.subtitle && <p data-export-subtitle className="text-xs text-muted-foreground">{result.subtitle}</p>}
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1" data-export-skip>
          <Button size="sm" variant="outline" onClick={() => run("png")} disabled={!!busy} aria-label={`Download ${title} as PNG`}>
            {busy === "png" ? <Loader2 className="animate-spin" /> : <Download />}PNG
          </Button>
          {canCopyImage() && (
            <Button size="icon" variant="ghost" onClick={() => run("copy")} disabled={!!busy} aria-label={`Copy ${title} as an image`} title="Copy as an image">
              {busy === "copy" ? <Loader2 className="animate-spin" /> : <Copy />}
            </Button>
          )}
          {actions}
        </div>
      </header>
      <ChartView type={type} result={result} byLevel={splitByLevel} thresholds={thresholds} height={height} />
      <ChartLegend result={result} type={type} byLevel={splitByLevel} />
      {result.notes.length > 0 && (
        <ul className="grid gap-0.5 text-xs text-muted-foreground">{result.notes.map((n) => <li key={n} data-export-note>{n}</li>)}</ul>
      )}
    </article>
  );
}
