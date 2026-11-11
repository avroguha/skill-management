"use client";
import { useState, useTransition } from "react";
import { Plus, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { addTrainingPlan, setPlanStatus } from "@/app/actions/people";

const STATUS = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

export function TrainingPlans({ employeeId, canEdit, plans, gaps }: {
  employeeId: string;
  canEdit: boolean;
  plans: { id: string; skill: string; title: string; link: string; targetLevel: number; dueOn: string | null; status: string }[];
  gaps: { skillId: string; skill: string; target: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [skillId, setSkillId] = useState(gaps[0]?.skillId ?? "");

  return (
    <div className="grid gap-3">
      {plans.length ? (
        <ul className="grid gap-2">
          {plans.map((p) => (
            <li key={p.id} className="rounded-md border px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.skill} → {p.targetLevel}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.link ? <a href={p.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{p.title}<ExternalLink className="size-3" /></a> : p.title}
                    {p.dueOn && ` · due ${new Date(p.dueOn).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                  </div>
                </div>
                {canEdit ? (
                  <Select value={p.status} onValueChange={(s) => start(async () => {
                    const r = await setPlanStatus(p.id, s);
                    if (!r.ok) toast.error(r.error);
                  })}>
                    <SelectTrigger size="sm" className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <span className="text-xs text-muted-foreground">{STATUS.find((s) => s.value === p.status)?.label}</span>}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Nothing booked.</p>}
      {canEdit && gaps.length > 0 && (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setOpen(true)}><Plus />Plan training for a gap</Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Plan training</DialogTitle>
            <DialogDescription>A course, a pairing assignment or a stretch project, against one gap.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const gap = gaps.find((g) => g.skillId === skillId);
            start(async () => {
              const r = await addTrainingPlan({
                employeeId, skillId, targetLevel: gap?.target ?? 3,
                title: String(f.get("title") ?? ""), link: String(f.get("link") ?? ""), dueOn: String(f.get("due") ?? ""),
              });
              if (r.ok) { toast.success("Training planned"); setOpen(false); } else toast.error(r.error);
            });
          }}>
            <div className="grid gap-1.5">
              <Label>Skill</Label>
              <Select value={skillId} onValueChange={setSkillId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{gaps.map((g) => <SelectItem key={g.skillId} value={g.skillId}>{g.skill} (target {g.target})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="title">What</Label><Input id="title" name="title" placeholder="e.g. Kubernetes administration course" required /></div>
            <div className="grid gap-1.5"><Label htmlFor="link">Link (optional)</Label><Input id="link" name="link" type="url" placeholder="https://" /></div>
            <div className="grid gap-1.5"><Label htmlFor="due">Due (optional)</Label><Input id="due" name="due" type="date" /></div>
            <DialogFooter><Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
