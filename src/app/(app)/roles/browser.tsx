"use client";
// The roles, with one box that finds as you type and adds what is not there.
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, UsersRound, Shapes } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Info } from "@/components/info";
import { createRole } from "@/app/actions/roles";
import { findNames } from "@/lib/similar";

export interface RoleCard { id: string; name: string; description: string; people: number; skills: number; topSkills: string[]; teams: string[] }

export function RolesBrowser({ roles, canEdit }: { roles: RoleCard[]; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, start] = useTransition();
  const name = q.trim();
  const found = useMemo(() => (name ? findNames(name, roles, 60) : null), [name, roles]);
  const shown = found ? found.map((m) => m.item) : roles;
  const same = found?.find((m) => m.same)?.item;
  const add = () => start(async () => {
    const r = await createRole({ name });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Added.");
    router.push(`/roles/${r.id}`);
  });
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" maxLength={80} aria-label="Find or add a role"
              placeholder={canEdit ? "Find a role, or type the name of a new one…" : "Find a role…"} className="h-11 pl-9 text-base" />
          </div>
          <Info label="About this box">Type any part of a name: the roles that hold those words (in any order) are listed as you type, the closest first.
            {canEdit ? " If the role is not there, add it from here. Role names are unique, so a role with exactly that name cannot be added twice, but a more specific one can (ITOM ServiceNow next to ServiceNow)." : ""}</Info>
        </div>
        {name && (
          <p className="text-sm text-muted-foreground">
            {shown.length ? `${shown.length} ${shown.length === 1 ? "role" : "roles"} like “${name}”, the closest first.` : `No role like “${name}” yet.`}
          </p>
        )}
        {canEdit && name.length >= 2 && (
          same ? (
            <p className="text-sm text-muted-foreground">A role called “{same.name}” already exists, and role names are unique: open it below, or type a more specific name.</p>
          ) : (
            <div>
              <Button variant="secondary" disabled={busy} onClick={add}>
                {busy ? <Loader2 className="animate-spin" /> : <Plus />}<span className="truncate">Add “{name}” as a new role</span>
              </Button>
              {shown.length > 0 && <span className="ml-2 text-xs text-muted-foreground">It is not the same as the {shown.length === 1 ? "one" : "ones"} below? Then add it.</span>}
            </div>
          )
        )}
      </div>

      {roles.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No roles yet. {canEdit ? "Type a name above to add the first one, for example IT Operations, SRE or Software Developer." : "A manager or an administrator adds them."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={`/roles/${r.id}`} className="flex h-full flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-semibold leading-tight">{r.name}</span>
                  {same?.id === r.id && <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">same name</span>}
                </div>
                {r.description && <p className="line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
                <p className="text-xs text-muted-foreground">
                  {r.topSkills.length ? `${r.topSkills.join(", ")}${r.skills > r.topSkills.length ? ` +${r.skills - r.topSkills.length} more` : ""}` : "No skills named yet"}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Shapes className="size-3.5" />{r.skills} {r.skills === 1 ? "skill" : "skills"}</span>
                  <span className="inline-flex items-center gap-1"><UsersRound className="size-3.5" />{r.people} {r.people === 1 ? "person" : "people"}</span>
                  {r.teams.length > 0 && <span className="truncate">{r.teams.slice(0, 2).join(", ")}{r.teams.length > 2 ? ` +${r.teams.length - 2}` : ""}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
