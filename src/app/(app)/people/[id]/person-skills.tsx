"use client";
import { useState, useTransition } from "react";
import { Star, Clock, Target, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GAP_CLASS, GAP_LABEL, LEVEL_CLASS } from "@/lib/status";
import type { GapCategory } from "@/lib/engine/engine";
import { setPersonTarget } from "@/app/actions/people";
import { cn } from "@/lib/utils";

export interface SkillRow {
  skillId: string; skill: string; categoryId: string; category: string; categorySort: number;
  target: number | null; source: string | null; mandatory: boolean; reason: string | null; roleTarget: number | null;
  self: number | null; validated: number | null; category_: GapCategory; stale: boolean; at: string | null;
  status: string | null; interest: boolean; selfComment: string; managerComment: string; evidence: string;
}
type Level = { level: number; name: string; description: string };

function Lv({ n, levels }: { n: number | null; levels: Level[] }) {
  if (n == null) return <span className="text-muted-foreground">–</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex size-6 items-center justify-center rounded text-xs font-medium tabular", LEVEL_CLASS[n])}>{n}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-60 text-xs"><b>{levels[n]?.name}</b> {levels[n]?.description}</TooltipContent>
    </Tooltip>
  );
}

const SOURCE = { person: "Set for this person", grade: "Role and grade", role: "Role" } as const;

export function PersonSkills({ rows, levels, employeeId, canManage }: { rows: SkillRow[]; levels: Level[]; employeeId: string; canManage: boolean }) {
  const [editing, setEditing] = useState<SkillRow | null>(null);
  const groups = [...new Map(rows.map((r) => [r.categoryId, { name: r.category, sort: r.categorySort }])).entries()]
    .sort((a, b) => a[1].sort - b[1].sort);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No skills required or rated yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-2 text-left font-medium">Skill</th>
            <th className="px-2 py-2 text-center font-medium">Target</th>
            <th className="px-2 py-2 text-center font-medium">Self</th>
            <th className="px-2 py-2 text-center font-medium">Validated</th>
            <th className="px-2 py-2 text-left font-medium">Gap</th>
            <th className="px-2 py-2 text-left font-medium">Assessed</th>
            {canManage && <th />}
          </tr>
        </thead>
        {groups.map(([cid, g]) => (
          <tbody key={cid}>
            <tr><td colSpan={7} className="pt-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.name}</td></tr>
            {rows.filter((r) => r.categoryId === cid).sort((a, b) => Number(b.target != null) - Number(a.target != null) || a.skill.localeCompare(b.skill)).map((r) => (
              <tr key={r.skillId} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(r.target == null && "text-muted-foreground")}>{r.skill}</span>
                    {r.interest && <Tooltip><TooltipTrigger><Star className="size-3.5 fill-chart-3 text-chart-3" /></TooltipTrigger><TooltipContent className="text-xs">Wants to grow this skill</TooltipContent></Tooltip>}
                    {!r.mandatory && r.target != null && <span className="text-[10px] text-muted-foreground">optional</span>}
                  </div>
                  {(r.selfComment || r.evidence || r.managerComment) && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {r.selfComment && <span>“{r.selfComment}” </span>}
                      {r.evidence && <span>Evidence: {r.evidence} </span>}
                      {r.managerComment && <span>Manager: {r.managerComment}</span>}
                    </div>
                  )}
                </td>
                <td className="px-2 text-center">
                  {r.target == null ? <span className="text-xs text-muted-foreground">–</span> : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn("inline-flex items-center gap-1", r.source === "person" && "rounded ring-1 ring-primary/60 ring-offset-1 ring-offset-card")}>
                          <Lv n={r.target} levels={levels} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64 text-xs">
                        {SOURCE[(r.source ?? "role") as keyof typeof SOURCE]}{r.reason ? `: ${r.reason}` : ""}
                        {r.source === "person" && r.roleTarget != null && <div>Role standard: {r.roleTarget}</div>}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </td>
                <td className="px-2 text-center"><Lv n={r.self} levels={levels} /></td>
                <td className="px-2 text-center">
                  {r.status === "submitted" && r.validated == null
                    ? <span className="text-xs text-muted-foreground">pending</span>
                    : <Lv n={r.validated} levels={levels} />}
                </td>
                <td className="px-2">
                  {r.target != null && <span className={cn("inline-flex rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", GAP_CLASS[r.category_])}>{GAP_LABEL[r.category_]}</span>}
                </td>
                <td className="px-2 text-xs whitespace-nowrap text-muted-foreground">
                  {r.at ? (
                    <span className={cn("inline-flex items-center gap-1", r.stale && "font-medium text-foreground")}>
                      {r.stale && <Clock className="size-3" />}
                      {new Date(r.at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                    </span>
                  ) : "–"}
                </td>
                {canManage && (
                  <td className="text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(r)}>
                      <Target className="size-3.5" />Target
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {editing && <TargetDialog row={editing} levels={levels} employeeId={employeeId} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TargetDialog({ row, levels, employeeId, onClose }: { row: SkillRow; levels: Level[]; employeeId: string; onClose: () => void }) {
  const [target, setTarget] = useState(row.source === "person" && row.target != null ? String(row.target) : row.target != null ? String(row.target) : "3");
  const [reason, setReason] = useState(row.reason ?? "");
  const [pending, start] = useTransition();
  const save = (value: number | null) => start(async () => {
    const r = await setPersonTarget({ employeeId, skillId: row.skillId, target: value, reason });
    if (r.ok) { toast.success(value == null ? "Back to the role standard" : "Target saved"); onClose(); }
    else toast.error(r.error);
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Target for {row.skill}</DialogTitle>
          <DialogDescription>
            {row.roleTarget != null ? `The role expects ${row.roleTarget} ${levels[row.roleTarget]?.name}. ` : "The role does not require this skill. "}
            A personal target overrides it for this person only, and the reason is shown wherever the target is.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Required level</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {levels.filter((l) => l.level > 0).map((l) => <SelectItem key={l.level} value={String(l.level)}>{l.level} {l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reason">Why</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. leads the migration project next quarter" rows={2} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {row.source === "person"
            ? <Button variant="ghost" onClick={() => save(null)} disabled={pending}>Use the role standard</Button>
            : <span />}
          <Button onClick={() => save(Number(target))} disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save target</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
