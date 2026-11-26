// A role's name on its tint: the same soft colour wherever the role shows, so it is told
// from the next role at a glance. The colours are in src/lib/role-colors.ts, the tint
// classes in globals.css.
import Link from "next/link";
import { tintStyle } from "@/lib/role-colors";
import { cn } from "@/lib/utils";

export interface RoleTag { name: string; tint: string; href?: string }

export function RoleChip({ name, tint, href, title, className }: { name: string; tint: string; href?: string; title?: string; className?: string }) {
  const cls = cn("tint-chip inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs leading-4 font-medium text-foreground", href && "hover:underline", className);
  const body = <><span className="tint-dot size-2 shrink-0 rounded-full" aria-hidden /><span className="min-w-0 truncate">{name}</span></>;
  return href
    ? <Link href={href} style={tintStyle(tint)} className={cls} title={title ?? `The role ${name}`}>{body}</Link>
    : <span style={tintStyle(tint)} className={cls} title={title}>{body}</span>;
}

/** Several roles in a row; a dash when there are none. */
export function RoleChips({ roles, className }: { roles: RoleTag[]; className?: string }) {
  if (!roles.length) return <span className="text-muted-foreground">–</span>;
  return <span className={cn("inline-flex flex-wrap gap-1", className)}>{roles.map((r) => <RoleChip key={`${r.name}|${r.href ?? ""}`} {...r} />)}</span>;
}
