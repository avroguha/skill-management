// Page links for lists kept short on the server: "1-25 of 3,120" with previous and next.
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pager({ page, pages, total, size, href, noun = "rows" }: {
  page: number; pages: number; total: number; size: number; href: (page: number) => string; noun?: string;
}) {
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const btn = "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-sm";
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2" aria-label="Pages">
      <span className="text-sm text-muted-foreground tabular">{from.toLocaleString("en-GB")}–{to.toLocaleString("en-GB")} of {total.toLocaleString("en-GB")} {noun}</span>
      <span className="ml-auto flex gap-1">
        {page > 1 ? <Link href={href(page - 1)} className={cn(btn, "hover:bg-accent")}><ChevronLeft className="size-4" />Previous</Link>
          : <span className={cn(btn, "pointer-events-none opacity-40")} aria-disabled="true"><ChevronLeft className="size-4" />Previous</span>}
        {page < pages ? <Link href={href(page + 1)} className={cn(btn, "hover:bg-accent")}>Next<ChevronRight className="size-4" /></Link>
          : <span className={cn(btn, "pointer-events-none opacity-40")} aria-disabled="true">Next<ChevronRight className="size-4" /></span>}
      </span>
    </nav>
  );
}
