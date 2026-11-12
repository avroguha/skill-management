"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/org", label: "Organisation" },
  { href: "/admin/taxonomy", label: "Taxonomy" },
  { href: "/admin/roles", label: "Roles & targets" },
  { href: "/admin/levels", label: "Levels" },
  { href: "/admin/cycles", label: "Cycles" },
  { href: "/admin/users", label: "Users & access" },
  { href: "/admin/directory", label: "ServiceNow" },
  { href: "/admin/sso", label: "Single sign-on" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/data", label: "Import & export" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px lg:flex-wrap lg:overflow-visible">
      {ADMIN_SECTIONS.map((s) => {
        const active = s.href === "/admin" ? pathname === "/admin" : pathname.startsWith(s.href);
        return (
          <Link key={s.href} href={s.href} aria-current={active ? "page" : undefined}
            ref={active ? (el) => { el?.scrollIntoView({ block: "nearest", inline: "nearest" }); } : undefined}
            className={cn("shrink-0 rounded-t-md border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
              active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
