"use client";
// The list of requests. Every request says where it is: waiting (and with whom), sent back
// (with the coordinator's note, to change and send again), approved, or not approved (with
// the reason). A coordinator decides from the same card.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Copy, Hourglass, Inbox, Loader2, PencilLine, Plus, Shapes, FolderPlus, Undo2, X, CircleX, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field } from "@/components/info";
import { PersonChip } from "@/components/person-avatar";
import { ActionButton, ActionMenu, type MenuAction } from "@/components/action-menu";
import { AskDialog, type AskCatalogue } from "@/components/ask-dialog";
import { decideRequest, withdrawRequest } from "@/app/actions/requests";
import { cn } from "@/lib/utils";

export interface RequestRow {
  id: string; kind: "skill" | "category"; name: string; description: string; reason: string;
  categoryId: string | null; categoryName: string; parentId: string | null;
  /** where it should go, in words: "Cloud · under AWS" */
  place: string;
  status: "pending" | "returned" | "approved" | "rejected" | "withdrawn"; statusLabel: string;
  by: string; mine: boolean; when: string;
  decidedBy: string; decidedWhen: string; comment: string;
  resultHref: string | null;
  history: { when: string; by: string; action: string; note: string }[];
}

const STATUS_CLS: Record<RequestRow["status"], string> = {
  pending: "bg-status-minor text-status-minor-fg",
  returned: "bg-status-significant text-status-significant-fg",
  approved: "bg-status-meets text-status-meets-fg",
  rejected: "bg-status-critical text-status-critical-fg",
  withdrawn: "bg-muted text-muted-foreground",
};
const STATUS_ICON = { pending: Hourglass, returned: Undo2, approved: Check, rejected: CircleX, withdrawn: X };
const NEW = "__new__";
type Deciding = { row: RequestRow; decision: "approve" | "return" | "reject" };

export function RequestsView({ rows, tab, canDecide, ask, readOnly, openNew }: {
  rows: RequestRow[]; tab: "mine" | "approve" | "all"; canDecide: boolean; ask: AskCatalogue; readOnly: boolean; openNew: "skill" | "category" | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [asking, setAsking] = useState<{ kind: "skill" | "category" } | null>(openNew ? { kind: openNew } : null);
  const [editing, setEditing] = useState<RequestRow | null>(null);
  const [deciding, setDeciding] = useState<Deciding | null>(null);

  // withdrawing cannot be undone, so it asks first
  const [withdrawing, setWithdrawing] = useState<RequestRow | null>(null);
  const withdraw = (r: RequestRow) => setWithdrawing(r);
  const confirmWithdraw = (r: RequestRow) => start(async () => {
    const res = await withdrawRequest(r.id);
    setWithdrawing(null);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Withdrawn.");
    router.refresh();
  });
  const menu = (r: RequestRow): MenuAction[] => {
    const open = r.status === "pending" || r.status === "returned";
    return [
      ...(canDecide && r.status === "pending" && !readOnly ? [
        { key: "approve", label: "Approve…", hint: "Adds it to the catalogue; you can change it first", icon: Check, onSelect: () => setDeciding({ row: r, decision: "approve" as const }) },
        { key: "return", label: "Send back with a note…", hint: "For the asker to change and send again", icon: Undo2, onSelect: () => setDeciding({ row: r, decision: "return" as const }) },
        { key: "reject", label: "Say no, with a reason…", icon: CircleX, destructive: true, onSelect: () => setDeciding({ row: r, decision: "reject" as const }) },
      ] : []),
      ...(r.mine && open && !readOnly ? [
        { key: "edit", label: r.status === "returned" ? "Change it and send it again…" : "Change it…", icon: PencilLine, separator: canDecide && r.status === "pending", onSelect: () => setEditing(r) },
        { key: "withdraw", label: "Withdraw it", hint: "You no longer need it", icon: X, destructive: true, onSelect: () => withdraw(r) },
      ] : []),
      ...(r.resultHref ? [{ key: "open", label: r.kind === "skill" ? "Open the skill" : "Open the category", icon: ExternalLink, href: r.resultHref }] : []),
      { key: "copy", label: "Copy the name", icon: Copy, copy: r.name, separator: true },
    ];
  };

  const empty = tab === "approve" ? "Nothing waits for a decision."
    : tab === "all" ? "Nobody has asked for anything yet."
      : "You have not asked for anything. When a skill or a category you need is missing from the catalogue, ask for it here.";

  return (
    <div className="grid gap-4">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setAsking({ kind: "skill" })}><Plus />Ask for a new skill</Button>
          <Button variant="outline" onClick={() => setAsking({ kind: "category" })}><FolderPlus />Ask for a new category</Button>
          <span className="text-xs text-muted-foreground">It goes to {ask.approvers}.</span>
        </div>
      )}
      {rows.length ? (
        <ul className="grid gap-3">
          {rows.map((r) => {
            const Icon = STATUS_ICON[r.status];
            const actions = menu(r);
            return (
              <ActionMenu key={r.id} title={r.name} actions={actions}>
                <li className={cn("min-w-0 rounded-lg border bg-card", r.status === "returned" && r.mine && "border-amber-500/60")}>
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" title={r.kind === "skill" ? "A skill" : "A category"}>
                      {r.kind === "skill" ? <Shapes className="size-4" /> : <FolderPlus className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 text-sm font-semibold break-words">{r.name}</h3>
                        <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">{r.kind === "skill" ? "New skill" : "New category"}</span>
                        <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", STATUS_CLS[r.status])}><Icon className="size-3" aria-hidden />{r.statusLabel}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                        {r.place && <span>In {r.place} ·</span>}
                        <span className="inline-flex items-center gap-1">asked by {r.mine ? "you" : <PersonChip name={r.by} />}</span><span>on {r.when}</span>
                      </div>
                      {r.description && <p className="mt-1.5 text-sm">{r.description}</p>}
                      {r.reason && <p className="mt-1 text-sm text-muted-foreground">Why: {r.reason}</p>}
                    </div>
                    <ActionButton actions={actions} title={r.name} label={`What you can do with the request for ${r.name}`} />
                  </div>

                  {/* where it is now */}
                  <div className={cn("flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-sm", r.status === "returned" && "bg-amber-500/5", r.status === "rejected" && "bg-destructive/5")}>
                    <div className="min-w-0 flex-1">
                      {r.status === "pending" && <span><b>Waiting with:</b> {ask.approvers}.</span>}
                      {r.status === "returned" && <span><b>Sent back by {r.decidedBy || "a coordinator"}</b>{r.decidedWhen ? ` on ${r.decidedWhen}` : ""}, to change: “{r.comment}” {r.mine ? "It is with you now." : `It is with ${r.by} now.`}</span>}
                      {r.status === "rejected" && <span><b>Not approved by {r.decidedBy || "a coordinator"}</b>{r.decidedWhen ? ` on ${r.decidedWhen}` : ""}: “{r.comment}”</span>}
                      {r.status === "approved" && <span><b>Approved by {r.decidedBy || "a coordinator"}</b>{r.decidedWhen ? ` on ${r.decidedWhen}` : ""}.{r.comment ? ` ${r.comment}` : ""} {r.resultHref && <Link href={r.resultHref} className="font-medium underline-offset-2 hover:underline">It is in the catalogue</Link>}</span>}
                      {r.status === "withdrawn" && <span className="text-muted-foreground">Withdrawn by the asker.</span>}
                    </div>
                    {!readOnly && (
                      <div className="flex flex-wrap gap-2">
                        {canDecide && r.status === "pending" && (
                          <>
                            <Button size="sm" disabled={busy} onClick={() => setDeciding({ row: r, decision: "approve" })}><Check />Approve</Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => setDeciding({ row: r, decision: "return" })}><Undo2 />Send back</Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => setDeciding({ row: r, decision: "reject" })}><CircleX />Say no</Button>
                          </>
                        )}
                        {r.mine && r.status === "returned" && <Button size="sm" disabled={busy} onClick={() => setEditing(r)}><PencilLine />Change and send again</Button>}
                        {r.mine && r.status === "pending" && !canDecide && <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(r)}><PencilLine />Change</Button>}
                        {r.mine && (r.status === "pending" || r.status === "returned") && <Button size="sm" variant="ghost" disabled={busy} onClick={() => withdraw(r)}>{busy ? <Loader2 className="animate-spin" /> : <X />}Withdraw</Button>}
                      </div>
                    )}
                  </div>
                  {r.history.length > 1 && (
                    <details className="border-t px-4 py-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer select-none">What happened so far ({r.history.length} steps)</summary>
                      <ol className="mt-1.5 grid gap-1">
                        {r.history.map((h, i) => <li key={i}><span className="tabular">{h.when}</span> · {h.by || "Someone"} {h.action}{h.note ? `: “${h.note}”` : ""}</li>)}
                      </ol>
                    </details>
                  )}
                </li>
              </ActionMenu>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed px-4 py-10 text-center">
          <Inbox className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{empty}</p>
        </div>
      )}
      {asking && <AskDialog catalogue={ask} initial={{ kind: asking.kind }} onClose={() => setAsking(null)} />}
      {editing && (
        <AskDialog catalogue={ask} onClose={() => setEditing(null)}
          initial={{ id: editing.id, kind: editing.kind, name: editing.name, description: editing.description, reason: editing.reason, categoryId: editing.categoryId, categoryName: editing.categoryName, parentId: editing.parentId, note: editing.status === "returned" ? editing.comment : undefined }} />
      )}
      {deciding && <DecideDialog d={deciding} ask={ask} onClose={() => setDeciding(null)} />}
      <AlertDialog open={!!withdrawing} onOpenChange={(o) => { if (!o && !busy) setWithdrawing(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw “{withdrawing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>It stops waiting for a coordinator and cannot be sent again. To ask for it later, make a new request.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); if (withdrawing) confirmWithdraw(withdrawing); }}>
              {busy ? <Loader2 className="animate-spin" /> : <X />}Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DecideDialog({ d, ask, onClose }: { d: Deciding; ask: AskCatalogue; onClose: () => void }) {
  const router = useRouter();
  const { row, decision } = d;
  const [busy, start] = useTransition();
  const [comment, setComment] = useState("");
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description);
  const [categoryId, setCategoryId] = useState(row.categoryId ?? NEW);
  const [categoryName, setCategoryName] = useState(row.categoryName);
  const [parentId, setParentId] = useState(row.parentId ?? "none");
  const parents = ask.parents.filter((p) => p.categoryId === categoryId);
  const title = decision === "approve" ? `Approve “${row.name}”` : decision === "return" ? `Send “${row.name}” back` : `Say no to “${row.name}”`;
  const send = () => start(async () => {
    const r = await decideRequest({
      id: row.id, decision, comment,
      ...(decision === "approve" ? {
        name, description,
        ...(row.kind === "skill" ? { categoryId: categoryId === NEW ? null : categoryId, categoryName: categoryId === NEW ? categoryName : "", parentId: parentId === "none" ? null : parentId } : {}),
      } : {}),
    });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Done.");
    onClose();
    router.refresh();
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {decision === "approve" ? `It joins the catalogue at once and every team can use it. Change the name or where it goes first if needed: ${row.by} sees what you changed.`
              : decision === "return" ? `${row.by} gets it back with your note, changes it and sends it again.`
                : `${row.by} sees your reason. They can ask again later.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {row.reason && <p className="rounded-md bg-muted/60 px-3 py-2 text-sm"><b>Why they need it:</b> {row.reason}</p>}
          {decision === "approve" && (
            <>
              <Field label="Name" htmlFor="dec-name" info="As it will appear in the catalogue. Names are unique.">
                <Input id="dec-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
              </Field>
              {row.kind === "skill" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Category" info="Where the skill goes. A new category is made with it when you choose A new category.">
                    <Select value={categoryId} onValueChange={(c) => { setCategoryId(c); setParentId("none"); }}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ask.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        <SelectItem value={NEW}>A new category…</SelectItem>
                      </SelectContent>
                    </Select>
                    {categoryId === NEW && <Input className="mt-1.5" value={categoryName} maxLength={80} onChange={(e) => setCategoryName(e.target.value)} placeholder="Name of the new category…" aria-label="Name of the new category" />}
                  </Field>
                  <Field label="Under (optional)" info="Makes it a sub-skill of an existing skill.">
                    <Select value={parentId} onValueChange={setParentId} disabled={categoryId === NEW}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Top level</SelectItem>
                        {parents.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}
              <Field label="What it covers" htmlFor="dec-desc" info="Shown with it in the catalogue.">
                <Textarea id="dec-desc" className="min-h-16" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </>
          )}
          <Field label={decision === "approve" ? "Note for the asker (optional)" : decision === "return" ? "What should change" : "Why not"} htmlFor="dec-note"
            info={decision === "approve" ? "Anything they should know, for example what you changed." : decision === "return" ? "Needed: they read this, change the request and send it again." : "Needed: the reason is shown to the person who asked."}>
            <Textarea id="dec-note" className="min-h-20" value={comment} maxLength={1000} autoFocus={decision !== "approve"} onChange={(e) => setComment(e.target.value)}
              placeholder={decision === "return" ? "e.g. Is this a sub-skill of Kubernetes? Please say what it covers." : decision === "reject" ? "e.g. Covered by Observability for now." : ""} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={send} variant={decision === "reject" ? "destructive" : "default"} disabled={busy || (decision !== "approve" && comment.trim().length < 3) || (decision === "approve" && name.trim().length < 2)}>
            {busy && <Loader2 className="animate-spin" />}{decision === "approve" ? "Approve and add it" : decision === "return" ? "Send it back" : "Say no"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
