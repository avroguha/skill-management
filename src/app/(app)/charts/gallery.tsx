"use client";
// The viewer's saved charts, each live, with PNG download one by one or all at once.
import { useState, useTransition } from "react";
import Link from "next/link";
import { Download, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadCardPng } from "@/components/chart-view";
import { deleteChart } from "@/app/actions/charts";
import type { ChartResult, ChartType } from "@/lib/charts/query";
import { ChartCard } from "./chart-card";

export interface GalleryItem {
  id: string; name: string; description: string; owner: string; mine: boolean;
  type: ChartType; splitByLevel: boolean; result: ChartResult | null; error: string | null;
}

export function DownloadAll() {
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
      setBusy(true);
      const cards = [...document.querySelectorAll<HTMLElement>("[data-chart-card]")];
      let n = 0;
      for (const c of cards) {
        try { await downloadCardPng(c); n += 1; await new Promise((r) => setTimeout(r, 350)); }
        catch (e) { toast.error(`${c.getAttribute("aria-label")}: ${(e as Error).message}`); }
      }
      setBusy(false);
      if (n) toast.success(`${n} picture${n === 1 ? "" : "s"} saved to your downloads.`);
    }}>
      {busy ? <Loader2 className="animate-spin" /> : <Download />}Download all as PNG
    </Button>
  );
}

export function Gallery({ items, thresholds }: { items: GalleryItem[]; thresholds: { greenAt: number; amberAt: number } }) {
  const [confirm, setConfirm] = useState<GalleryItem | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((it) => it.result ? (
          <ChartCard key={it.id} title={it.name} description={it.description} type={it.type} result={it.result}
            splitByLevel={it.splitByLevel} thresholds={thresholds}
            actions={it.mine ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`More for ${it.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild><Link href={`/charts/${it.id}`}><Pencil />Edit</Link></DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(it)}><Trash2 />Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : <span className="px-2 text-xs text-muted-foreground">{it.owner}</span>} />
        ) : (
          <article key={it.id} className="grid content-start gap-2 rounded-lg border border-dashed p-4">
            <h3 className="font-semibold">{it.name}</h3>
            <p className="text-sm text-muted-foreground">{it.error}</p>
            {it.mine && <Button size="sm" variant="outline" className="justify-self-start" asChild><Link href={`/charts/${it.id}`}><Pencil />Edit</Link></Button>}
          </article>
        ))}
      </div>
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{confirm?.name}”?</DialogTitle>
            <DialogDescription>Only the chart&apos;s settings are removed; no data is touched.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Keep it</Button>
            <Button variant="destructive" disabled={pending} onClick={() => start(async () => {
              const r = await deleteChart(confirm!.id);
              if (r.ok) toast.success(r.message ?? "Deleted"); else toast.error(r.error);
              setConfirm(null);
            })}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
