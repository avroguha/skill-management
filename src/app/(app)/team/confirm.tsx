"use client";
import { Person } from "@/components/person-avatar";
// My team › To confirm: the ratings the manager's direct reports sent. Agree (one, a person's
// all, or everyone's at once), change a level, or send one back with a note.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, Undo2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Info } from "@/components/info";
import { LevelPicker, type Level } from "@/components/level-picker";
import { confirmRatings, returnRating } from "@/app/actions/assessment";

export interface ConfirmPerson {
  id: string; name: string; title: string;
  items: { skillId: string; skill: string; target: number | null; self: number; before: number | null; comment: string }[];
}
type Item = ConfirmPerson["items"][number];

export function ConfirmQueue({ people: initial, levels, focus }: { people: ConfirmPerson[]; levels: Level[]; focus?: string | null }) {
  const router = useRouter();
  const [people, setPeople] = useState(initial);
  useEffect(() => setPeople(initial), [initial]);
  const [draft, setDraft] = useState<Record<string, { level: number; comment: string }>>({});
  const [pending, start] = useTransition();
  const key = (p: string, s: string) => `${p}|${s}`;
  const get = (p: string, it: Item) => draft[key(p, it.skillId)] ?? { level: it.self, comment: "" };
  const set = (p: string, it: Item, patch: Partial<{ level: number; comment: string }>) =>
    setDraft((d) => ({ ...d, [key(p, it.skillId)]: { ...get(p, it), ...patch } }));
  const drop = (done: { personId: string; skillId: string }[]) =>
    setPeople((ps) => ps.map((p) => ({ ...p, items: p.items.filter((i) => !done.some((d) => d.personId === p.id && d.skillId === i.skillId)) })).filter((p) => p.items.length));

  const accept = (list: { p: ConfirmPerson; it: Item }[]) => start(async () => {
    const r = await confirmRatings(list.map(({ p, it }) => ({ employeeId: p.id, skillId: it.skillId, ...get(p.id, it) })));
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Confirmed.");
    drop(list.map(({ p, it }) => ({ personId: p.id, skillId: it.skillId })));
    router.refresh();
  });
  const sendBack = (p: ConfirmPerson, it: Item) => start(async () => {
    const r = await returnRating({ employeeId: p.id, skillId: it.skillId, comment: get(p.id, it).comment });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Sent back.");
    drop([{ personId: p.id, skillId: it.skillId }]);
    router.refresh();
  });

  if (!people.length) return <p className="text-sm text-muted-foreground">Nothing waits for you to confirm.</p>;
  const total = people.reduce((t, p) => t + p.items.length, 0);
  const ordered = focus ? [...people].sort((a, b) => Number(b.id === focus) - Number(a.id === focus)) : people;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 basis-72 text-sm text-muted-foreground">
          Each level starts at what the person chose (dashed outline). Tap another level to change it. To send one back, write what to look at again, then <b>Send back</b>.
        </p>
        <Button disabled={pending} onClick={() => accept(people.flatMap((p) => p.items.map((it) => ({ p, it }))))}>
          {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />}Confirm all {total} as shown
        </Button>
        <Info label="About confirming">The confirmed level is the one that counts in every number. The person gets one e-mail with what you confirmed, and any level you changed.</Info>
      </div>
      {ordered.map((p) => (
        <section key={p.id} className="rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <Person name={p.name} href={`/people/${p.id}`} size="md" sub={`${p.title ? `${p.title} · ` : ""}${p.items.length} to confirm`} />
            <Button size="sm" variant="outline" disabled={pending} onClick={() => accept(p.items.map((it) => ({ p, it })))}><CheckCheck />Confirm {p.name.split(" ")[0]}&apos;s {p.items.length}</Button>
          </div>
          <ul className="divide-y">
            {p.items.map((it) => {
              const d = get(p.id, it);
              return (
                <li key={it.skillId} className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(12rem,18rem)_auto] lg:items-center lg:gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug break-words">{it.skill}</div>
                    <div className="text-xs text-muted-foreground">
                      Said {it.self}{it.target != null ? ` · target ${it.target}` : ""}{it.before != null ? ` · confirmed before at ${it.before}` : ""}
                      {it.comment && <> · “{it.comment}”</>}
                    </div>
                  </div>
                  <LevelPicker value={d.level} onChange={(n) => n != null && set(p.id, it, { level: n })} levels={levels} label={`Level for ${it.skill}`} target={it.target} compare={it.self} />
                  <Input value={d.comment} onChange={(e) => set(p.id, it, { comment: e.target.value })} placeholder="Note to them (needed to send back)"
                    aria-label={`Note about ${it.skill}`} className="h-9 text-sm" />
                  <div className="flex gap-1">
                    <Button size="sm" disabled={pending} onClick={() => accept([{ p, it }])}><Check />Confirm</Button>
                    <Button size="sm" variant="ghost" disabled={pending || !d.comment.trim()} onClick={() => sendBack(p, it)} title="Write a note first"><Undo2 />Send back</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
