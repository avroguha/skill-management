"use client";
// A page's sub menu, on the page itself. The sub menu normally lives in the menu, under its
// entry; this copy shows only when that one is out of sight (the menu closed to icons, or a
// phone, where the menu is a drawer), so the sections of a page are always one tap away.
// The rule that shows and hides it is .sub-menu-page in globals.css.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SubMenuEntry { key: string; label: string; href: string; hint?: string; count?: number | string; attention?: boolean }

export function SubMenu({ label, items, active }: {
  /** the menu entry these belong to, e.g. "My team" */
  label: string;
  items: SubMenuEntry[];
  /** the open one; left out, the address decides (the longest that fits) */
  active?: string;
}) {
  const pathname = usePathname();
  const byPath = () => {
    let best: SubMenuEntry | undefined;
    for (const i of items) {
      const p = i.href.split("?")[0]!;
      const fits = pathname === p || (p !== items[0]?.href && pathname.startsWith(`${p}/`));
      if (fits && (!best || p.length > best.href.split("?")[0]!.length)) best = i;
    }
    return best?.key;
  };
  const on = active ?? byPath();
  // a phone shows part of the list: fade the edge that has more behind it
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const measure = () => {
    const el = strip.current;
    if (el) setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => { measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }, []);
  return (
    <nav aria-label={`${label}: sections`} className="sub-menu-page mb-4 items-center gap-2 rounded-lg border bg-card p-1.5">
      <span className="shrink-0 pl-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
      <div ref={strip} onScroll={measure} className={cn("flex min-w-0 gap-1 overflow-x-auto", more.right && "fade-right", more.left && "fade-left")}>
        {items.map((t) => {
          const current = t.key === on;
          return (
            <Link key={t.key} href={t.href} title={t.hint} aria-current={current ? "page" : undefined} scroll={false}
              ref={current ? (el) => { el?.scrollIntoView({ block: "nearest", inline: "nearest" }); } : undefined}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                current ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
              {t.label}
              {t.count != null && (
                <span className={cn("rounded-full px-1.5 text-xs tabular", t.attention && Number(t.count) > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{t.count}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
