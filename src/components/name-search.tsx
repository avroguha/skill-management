"use client";
// A name box that searches as you type: what already exists with that name (or part of it,
// or its words in another order) is listed under the box and stays there while typing, and
// a new one can still be added unless exactly that name is taken. Used wherever a role or a
// skill is added, so nobody adds a second "ServiceNow" without seeing the first.
import Link from "next/link";
import { useMemo } from "react";
import { Plus, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findNames, type NameMatch } from "@/lib/similar";
import { cn } from "@/lib/utils";

export interface NameItem { id: string; name: string; aliases?: string[]; hint?: string; href?: string }

/** What a typed name finds among existing ones, listed; nothing is rendered for an empty box. */
export function SimilarNames({ query, items, noun, exceptId, onPick, pickLabel = "Use this", limit = 6, className }: {
  query: string; items: NameItem[]; noun: string; exceptId?: string;
  onPick?: (item: NameItem) => void; pickLabel?: string; limit?: number; className?: string;
}) {
  const matches = useMemo(() => findNames(query, exceptId ? items.filter((i) => i.id !== exceptId) : items, limit), [query, items, exceptId, limit]);
  if (!query.trim()) return null;
  if (!matches.length) return <p className={cn("text-xs text-muted-foreground", className)}>No {noun} with a name like that yet.</p>;
  return (
    <div className={cn("grid gap-1", className)}>
      <p className="text-xs text-muted-foreground">Already there ({matches.length}{matches.length === limit ? "+" : ""}):</p>
      <ul className="grid gap-1" aria-label={`Existing ${noun}s like “${query.trim()}”`}>
        {matches.map((m) => <MatchRow key={m.item.id} m={m} onPick={onPick} pickLabel={pickLabel} />)}
      </ul>
    </div>
  );
}

function MatchRow({ m, onPick, pickLabel }: { m: NameMatch<NameItem>; onPick?: (item: NameItem) => void; pickLabel: string }) {
  const body = (
    <span className="min-w-0">
      <span className="font-medium">{m.item.name}</span>
      {m.same && <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">same name</span>}
      {m.item.hint && <span className="block truncate text-xs text-muted-foreground">{m.item.hint}</span>}
    </span>
  );
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm">
      {m.item.href && !onPick ? <Link href={m.item.href} className="min-w-0 flex-1 hover:underline">{body}</Link> : body}
      {onPick ? <Button type="button" size="sm" variant="outline" className="h-7 shrink-0" onClick={() => onPick(m.item)}>{pickLabel}</Button>
        : m.item.href ? <Button asChild size="sm" variant="ghost" className="h-7 shrink-0"><Link href={m.item.href}>Open</Link></Button> : null}
    </li>
  );
}

/**
 * The whole control: the box, what it finds, and "Add ... as a new <noun>". `children` goes
 * between the matches and the add button (e.g. the category of a new skill).
 */
export function NameSearch({ value, onValueChange, items, noun, onPick, pickLabel, onAdd, canAdd = true, busy, placeholder, autoFocus, children, id, limit }: {
  value: string; onValueChange: (v: string) => void; items: NameItem[]; noun: string;
  onPick?: (item: NameItem) => void; pickLabel?: string;
  onAdd?: (name: string) => void; canAdd?: boolean; busy?: boolean;
  placeholder?: string; autoFocus?: boolean; children?: React.ReactNode; id?: string; limit?: number;
}) {
  const name = value.trim();
  const taken = useMemo(() => findNames(name, items, 50).find((m) => m.same)?.item, [name, items]);
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} value={value} autoFocus={autoFocus} autoComplete="off" maxLength={120} className="pl-8"
          placeholder={placeholder ?? `Type a ${noun} name: existing ones show as you type`}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
      </div>
      <SimilarNames query={value} items={items} noun={noun} onPick={onPick} pickLabel={pickLabel} limit={limit} />
      {onAdd && canAdd && name.length >= 2 && (
        taken ? (
          <p className="text-xs text-muted-foreground">A {noun} called “{taken.name}” already exists, and names are unique: use it, or choose a more specific name.</p>
        ) : (
          <>
            {children}
            <Button type="button" variant="secondary" className="justify-start" disabled={busy} onClick={() => onAdd(name)}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}<span className="truncate">Add “{name}” as a new {noun}</span>
            </Button>
          </>
        )
      )}
    </div>
  );
}
