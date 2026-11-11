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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[26%]" /><col className="w-16" /><col className="w-16" /><col className="w-16" />
                  <col className="w-48" /><col /><col className="w-56" />
                </colgroup>
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Skill</th>
                    <th className="px-2 text-center font-medium">Target</th>
                    <th className="px-2 text-center font-medium">Before</th>
                    <th className="px-2 text-center font-medium">Self</th>
                    <th className="px-2 text-left font-medium">Validated level</th>
                    <th className="px-2 text-left font-medium">Evidence and note</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {p.items.map((it) => {
                    const d = get(p.id, it);
                    const needsEvidence = d.level >= EVIDENCE_FROM && !d.evidence.trim();
                    return (
                      <tr key={it.skillId} className="border-t align-top">
                        <td className="px-4 py-2">
                          <div className="font-medium">{it.skill}</div>
                          {it.comment && <div className="text-xs text-muted-foreground">“{it.comment}”</div>}
                        </td>
                        <td className="px-2 py-2 text-center"><Chip n={it.target} /></td>
                        <td className="px-2 py-2 text-center"><Chip n={it.previous} /></td>
                        <td className="px-2 py-2 text-center"><Chip n={it.self} /></td>
                        <td className="px-2 py-2">
                          <Select value={String(d.level)} onValueChange={(x) => set(p.id, it, { level: Number(x) })}>
                            <SelectTrigger size="sm" className={cn("h-8 w-40", d.level !== it.self && "border-primary/60")}><SelectValue /></SelectTrigger>
                            <SelectContent>{levels.map((l) => <SelectItem key={l.level} value={String(l.level)}>{l.level} {l.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="grid gap-1 px-2 py-2">
                          <Input value={d.evidence} onChange={(e) => set(p.id, it, { evidence: e.target.value })}
                            placeholder={d.level >= EVIDENCE_FROM ? "Evidence (required)" : "Evidence (optional)"}
                            aria-invalid={needsEvidence} className="h-8 text-sm" />
                          <Input value={d.comment} onChange={(e) => set(p.id, it, { comment: e.target.value })} placeholder="Note to them (optional)" className="h-8 text-sm" />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" disabled={pending || needsEvidence} onClick={() => accept(p, [it])}><Check />Validate</Button>
                            <Button size="sm" variant="ghost" disabled={pending || !d.comment.trim()} onClick={() => sendBack(p, it)} title="Write a note first"><Undo2 />Send back</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
