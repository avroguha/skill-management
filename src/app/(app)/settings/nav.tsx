"use client";
// Settings sections: always in view (a column on wide screens, a row of chips on a phone),
// so every section is one click away.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const SETTINGS_SECTIONS = [
  { href: "/settings", label: "Overview", hint: "What is set up, what is left" },
  { href: "/settings/people", label: "People & access", hint: "Accounts, administrators, roles of people" },
  { href: "/settings/skills", label: "Skills", hint: "The catalogue, CSV upload" },
  { href: "/settings/roles", label: "Roles & targets", hint: "What each role needs" },
  { href: "/settings/levels", label: "Levels & rules", hint: "The 0-5 wording, colours, stale" },
  { href: "/settings/servicenow", label: "ServiceNow", hint: "Where people come from" },
  { href: "/settings/sso", label: "Single sign-on", hint: "Company sign-in (SAML)" },
  { href: "/settings/email", label: "E-mail", hint: "Relay, alerts, reminders" },
  { href: "/settings/data", label: "Data & backups", hint: "CSV, backups, version 1" },
  { href: "/settings/demo", label: "Demo", hint: "Made-up data for presenting" },
  { href: "/settings/help", label: "Help page", hint: "FAQ and contact" },
  { href: "/settings/audit", label: "Audit log", hint: "Who changed what" },
] as const;

export function SettingsNav({ flags }: { flags: Record<string, string | undefined> }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0">
      {SETTINGS_SECTIONS.map((s) => {
        const active = s.href === "/settings" ? pathname === "/settings" : pathname.startsWith(s.href);
        return (
          <Link key={s.href} href={s.href} aria-current={active ? "page" : undefined}
            ref={active ? (el) => { el?.scrollIntoView({ block: "nearest", inline: "nearest" }); } : undefined}
            className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors lg:whitespace-normal",
              active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
            <span className="flex items-center justify-between gap-2">
              {s.label}
              {flags[s.href] && <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">{flags[s.href]}</span>}
            </span>
            <span className="hidden text-xs text-muted-foreground lg:block">{s.hint}</span>
          </Link>
        );
      })}
    </nav>
  );
}
