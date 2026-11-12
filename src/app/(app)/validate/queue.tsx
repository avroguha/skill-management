"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, CheckCheck, Undo2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validateRatings, returnRating } from "@/app/actions/assessment";
import { LEVEL_CLASS } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface QueuePerson {
  id: string; name: string; title: string; team: string;
  items: { skillId: string; skill: string; target: number | null; self: number; previous: number | null; comment: string; submitted: string | null }[];
}
type Level = { level: number; name: string; description: string };
const EVIDENCE_FROM = 4;

function Chip({ n }: { n: number | null }) {
  if (n == null) return <span className="text-xs text-muted-foreground">–</span>;
  return <span className={cn("inline-flex size-6 items-center justify-center rounded text-xs font-medium tabular", LEVEL_CLASS[n])}>{n}</span>;
}

export function ValidateQueue({ people: initial, levels }: { people: QueuePerson[]; levels: Level[] }) {
  const [people, setPeople] = useState(initial);
  const [draft, setDraft] = useState<Record<string, { level: number; evidence: string; comment: string }>>({});
  const [pending, start] = useTransition();
  const key = (p: string, s: string) => `${p}|${s}`;
  const get = (p: string, it: QueuePerson["items"][number]) => draft[key(p, it.skillId)] ?? { level: it.self, evidence: "", comment: "" };
  const set = (p: string, it: QueuePerson["items"][number], patch: Partial<{ level: number; evidence: string; comment: string }>) =>
    setDraft((d) => ({ ...d, [key(p, it.skillId)]: { ...get(p, it), ...patch } }));
  const drop = (pid: string, skillIds: string[]) =>
    setPeople((ps) => ps.map((p) => (p.id === pid ? { ...p, items: p.items.filter((i) => !skillIds.includes(i.skillId)) } : p)).filter((p) => p.items.length));

  const accept = (p: QueuePerson, items: QueuePerson["items"]) => start(async () => {
    const payload = items.map((it) => ({ employeeId: p.id, skillId: it.skillId, ...get(p.id, it) }));
    const missing = payload.find((x) => x.level >= EVIDENCE_FROM && !x.evidence.trim());
    if (missing) { toast.error(`${items.find((i) => i.skillId === missing.skillId)?.skill}: add a line of evidence for Advanced or Expert.`); return; }
    const r = await validateRatings(payload);
    if (r.ok) { toast.success(r.message ?? "Validated"); drop(p.id, items.map((i) => i.skillId)); } else toast.error(r.error);
  });

  const sendBack = (p: QueuePerson, it: QueuePerson["items"][number]) => start(async () => {
    const r = await returnRating({ employeeId: p.id, skillId: it.skillId, comment: get(p.id, it).comment });
    if (r.ok) { toast.success(r.message ?? "Returned"); drop(p.id, [it.skillId]); } else toast.error(r.error);
  });

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        The level starts at what the person chose. Change it where you see it differently. Advanced (4) and Expert (5) need a line of evidence.
        To send one back, write what to look at again in the note, then “Send back”.
      </p>
      {people.map((p) => {
        const easy = p.items.filter((it) => get(p.id, it).level < EVIDENCE_FROM || get(p.id, it).evidence.trim());
        return (
          <section key={p.id} className="rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <Link href={`/people/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                <div className="text-xs text-muted-foreground">{p.title} · {p.team}</div>
              </div>
              <Button size="sm" variant="outline" disabled={pending || !easy.length} onClick={() => accept(p, easy)}>
                {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />}Validate {easy.length === p.items.length ? "all" : `${easy.length}`} as shown
              </Button>
            </div>
            {/* A table on wide screens; below lg each rating is its own block, so nothing
                has to scroll sideways on a phone. One markup, two layouts. */}
            <div role="table" aria-label={`Ratings from ${p.name}`} className="text-sm">
              <div role="row" className="hidden px-4 py-2 text-xs text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.3fr)_4rem_4rem_4rem_11rem_minmax(0,1.5fr)_13rem] lg:gap-x-2">
                <span role="columnheader" className="font-medium">Skill</span>
                <span role="columnheader" className="text-center font-medium">Target</span>
                <span role="columnheader" className="text-center font-medium">Before</span>
                <span role="columnheader" className="text-center font-medium">Self</span>
                <span role="columnheader" className="font-medium">Validated level</span>
                <span role="columnheader" className="font-medium">Evidence and note</span>
                <span role="columnheader" />
              </div>
              <div role="rowgroup" className="divide-y lg:border-t">
              {p.items.map((it) => {
                const d = get(p.id, it);
                const needsEvidence = d.level >= EVIDENCE_FROM && !d.evidence.trim();
                return (
                  <div role="row" key={it.skillId}
                    className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.3fr)_4rem_4rem_4rem_11rem_minmax(0,1.5fr)_13rem] lg:items-start lg:gap-x-2 lg:py-2">
                    <div role="cell" className="min-w-0">
                      <div className="font-medium">{it.skill}</div>
                      {it.comment && <div className="text-xs text-muted-foreground">“{it.comment}”</div>}
                    </div>
                    {/* the three levels side by side on a phone, labelled there */}
                    <div className="flex gap-4 lg:contents">
                      {([["Target", it.target], ["Before", it.previous], ["Self", it.self]] as const).map(([label, n]) => (
                        <div role="cell" key={label} className="flex items-center gap-1.5 lg:justify-center">
                          <span className="text-xs text-muted-foreground lg:hidden">{label}</span><Chip n={n} />
                        </div>
                      ))}
                    </div>
                    <div role="cell">
                      <Select value={String(d.level)} onValueChange={(x) => set(p.id, it, { level: Number(x) })}>
                        <SelectTrigger size="sm" aria-label={`Validated level for ${it.skill}`}
                          className={cn("h-8 w-full sm:w-44 lg:w-full", d.level !== it.self && "border-primary/60")}><SelectValue /></SelectTrigger>
                        <SelectContent>{levels.map((l) => <SelectItem key={l.level} value={String(l.level)}>{l.level} {l.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div role="cell" className="grid gap-1">
                      <Input value={d.evidence} onChange={(e) => set(p.id, it, { evidence: e.target.value })}
                        placeholder={d.level >= EVIDENCE_FROM ? "Evidence (required)" : "Evidence (optional)"}
                        aria-label={`Evidence for ${it.skill}`} aria-invalid={needsEvidence} className="h-8 text-sm" />
                      <Input value={d.comment} onChange={(e) => set(p.id, it, { comment: e.target.value })}
                        placeholder="Note to them (optional)" aria-label={`Note about ${it.skill}`} className="h-8 text-sm" />
                    </div>
                    <div role="cell" className="flex flex-wrap gap-1 lg:justify-end">
                      <Button size="sm" disabled={pending || needsEvidence} onClick={() => accept(p, [it])}><Check />Validate</Button>
                      <Button size="sm" variant="ghost" disabled={pending || !d.comment.trim()} onClick={() => sendBack(p, it)} title="Write a note first"><Undo2 />Send back</Button>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
