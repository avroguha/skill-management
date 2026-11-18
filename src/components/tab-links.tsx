// Tabs as links: each tab has its own address (an e-mail can point straight at one), the
// back button works, and only the open tab's data is worked out.
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface TabLink { key: string; label: string; href: string; count?: number; tone?: "attention" }

export function TabLinks({ tabs, active }: { tabs: TabLink[]; active: string }) {
  return (
    <nav aria-label="Sections" className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b pb-px">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined} scroll={false}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
              on ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
            {t.count != null && (
              <span className={cn("rounded-full px-1.5 text-xs tabular", t.tone === "attention" && t.count > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
