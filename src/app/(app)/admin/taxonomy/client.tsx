"use client";
import { useState, useTransition } from "react";
import { Check, Merge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminCrud, type Field } from "@/components/admin-crud";
import type { ColSpec } from "@/components/data-table";
import { saveSkill, deleteSkill, mergeSkill } from "@/app/actions/admin";

type Row = Record<string, unknown>;

export function SkillsAdmin({ rows, columns, fields, targets }: { rows: Row[]; columns: ColSpec[]; fields: Field[]; targets: { value: string; label: string }[] }) {
  const [merging, setMerging] = useState<Row | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <AdminCrud noun="skill" csvName="skills" rows={rows} columns={columns} fields={fields}
        searchKeys={["label", "category", "aliases", "description"]} nameKey="label"
        defaults={{ status: "active", parentId: "none", sort: 0 }}
        description="A sub-skill sits under a top-level skill in the same category. Only skills without active sub-skills are rated."
        save={saveSkill} remove={deleteSkill}
        extraActions={(row) => (
          <>
            {row.status === "draft" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Approve ${String(row.label)}`} disabled={pending} onClick={() => start(async () => {
                    const r = await saveSkill({ ...row, status: "active" });
                    if (r.ok) toast.success("Approved: people can rate it now"); else toast.error(r.error);
                  })}><Check className="size-3.5" /></Button>
                </TooltipTrigger>
                <TooltipContent>Approve the suggestion</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Merge ${String(row.label)}`} onClick={() => setMerging(row)}><Merge className="size-3.5" /></Button>
              </TooltipTrigger>
              <TooltipContent>Merge into another skill</TooltipContent>
            </Tooltip>
          </>
        )} />
      {merging && <MergeDialog from={merging} targets={targets.filter((t) => t.value !== merging.id)} onClose={() => setMerging(null)} />}
    </>
  );
}

function MergeDialog({ from, targets, onClose }: { from: Row; targets: { value: string; label: string }[]; onClose: () => void }) {
  const [into, setInto] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge “{String(from.label)}”</DialogTitle>
          <DialogDescription>
            Every rating, target, team need and training plan moves to the skill you choose. Where someone has both, the
            chosen skill&apos;s rating is kept. The old name becomes an alias and the old skill is retired.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label>Into</Label>
          <Select value={into} onValueChange={setInto}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Choose a skill…" /></SelectTrigger>
            <SelectContent>{targets.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button disabled={!into || pending} onClick={() => start(async () => {
            const r = await mergeSkill(String(from.id), into);
            if (r.ok) { toast.success(r.message ?? "Merged"); onClose(); } else toast.error(r.error);
          })}>{pending && <Loader2 className="animate-spin" />}Merge</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
