"use client";
import { Person } from "@/components/person-avatar";
import { useState, useTransition } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { remindTeam } from "@/app/actions/email";

export interface RemindCandidate { id: string; name: string; state: string; progress: string }

/** My team: e-mail the people who have not updated their skills (one reminder per person per day). */
export function RemindTeam({ people, label }: { people: RemindCandidate[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  if (!people.length) return null;
  const all = chosen.size === people.length;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setChosen(new Set(people.map((p) => p.id))); setOpen(true); }}>
        <BellRing />{label ?? `Remind ${people.length}`}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Remind people to update their skills</DialogTitle>
            <DialogDescription>Each gets an e-mail with how far they have got and a link to their self-assessment. Someone already reminded today is not e-mailed again.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={all} onCheckedChange={(c) => setChosen(c ? new Set(people.map((p) => p.id)) : new Set())} />
              Everyone ({people.length})
            </label>
            <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-2">
              {people.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <Checkbox checked={chosen.has(p.id)} onCheckedChange={(c) => setChosen((s) => { const n = new Set(s); if (c) n.add(p.id); else n.delete(p.id); return n; })} />
                    <Person name={p.name} strong={false} className="flex-1" sub={`${p.state}${p.progress ? ` · ${p.progress}` : ""}`} />
                  </label>
                </li>
              ))}
            </ul>
            <div className="grid gap-1.5">
              <Label htmlFor="remind-note">A note from you (optional)</Label>
              <Textarea id="remind-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Please finish your self-assessment by Friday: we use it to plan next quarter's training." />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!chosen.size || pending} onClick={() => start(async () => {
              const r = await remindTeam([...chosen], note);
              if (r.ok) { toast.success(r.message ?? "Sent", { duration: 8000 }); setOpen(false); setNote(""); } else toast.error(r.error);
            })}>{pending ? <Loader2 className="animate-spin" /> : <BellRing />}Send {chosen.size} reminder{chosen.size === 1 ? "" : "s"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
