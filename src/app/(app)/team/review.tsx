"use client";
// Review changes: everything changed in this team's roles and needs that is not in force
// yet. Each line can be taken back; Confirm puts all of it in force; Discard throws it away.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Minus, PencilLine, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ActionMenu } from "@/components/action-menu";
import { confirmTeamChanges, discardTeamChanges, undoTeamChange } from "@/app/actions/team";
import { cn } from "@/lib/utils";

export interface ReviewLine { key: string; group: string; text: string; kind: "add" | "remove" | "change" }

const ICON = { add: Plus, remove: Minus, change: PencilLine };
const TONE = {
  add: "bg-status-meets text-status-meets-fg",
  remove: "bg-status-critical text-status-critical-fg",
  change: "bg-status-minor text-status-minor-fg",
};

export function ReviewChanges({ managerId, lines, canEdit, by, when, backHref }: {
  managerId: string; lines: ReviewLine[]; canEdit: boolean; by: string; when: string; backHref: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [discarding, setDiscarding] = useState(false);
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Done.");
    after?.();
    router.refresh();
  });

  if (!lines.length) {
    return (
      <div className="rounded-md border border-dashed px-4 py-8 text-center">
        <Check className="mx-auto size-7 text-muted-foreground" aria-hidden />
        <p className="mt-2 font-medium">Nothing waits to be confirmed</p>
        <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
          When you change the team’s roles or needs, the changes are listed here first. Nothing is in force until you confirm it, so you can try things and take them back.
        </p>
      </div>
    );
  }

  const groups = [...new Set(lines.map((l) => l.group))];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <span className="min-w-0 flex-1">
          <b className="tabular">{lines.length} change{lines.length === 1 ? "" : "s"}</b> not in force yet{by ? `, last changed by ${by}` : ""}{when ? ` (${when})` : ""}.
          Until you confirm, people are still asked for what the team had before.
        </span>
        {canEdit && (
          <span className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setDiscarding(true)}>Discard all</Button>
            <Button size="sm" disabled={busy} onClick={() => run(() => confirmTeamChanges(managerId), () => router.push(backHref))}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}Confirm {lines.length} change{lines.length === 1 ? "" : "s"}
            </Button>
          </span>
        )}
      </div>
      {groups.map((g) => (
        <section key={g} className="min-w-0 rounded-md border">
          <h3 className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">{g}</h3>
          <ul className="divide-y">
            {lines.filter((l) => l.group === g).map((l) => {
              const Icon = ICON[l.kind];
              const undo = () => run(() => undoTeamChange(managerId, l.key));
              return (
                <ActionMenu key={l.key} title={l.text} actions={canEdit ? [{ key: "undo", label: "Take this change back", icon: Undo2, onSelect: undo }] : []}>
                  <li className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full", TONE[l.kind])}><Icon className="size-3" aria-hidden /></span>
                    <span className="min-w-0 flex-1 break-words">{l.text}</span>
                    {canEdit && <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs" disabled={busy} onClick={undo}><Undo2 />Take back</Button>}
                  </li>
                </ActionMenu>
              );
            })}
          </ul>
        </section>
      ))}
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard all {lines.length} change{lines.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>The team stays exactly as it is in force now. The changes cannot be brought back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => discardTeamChanges(managerId))}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
