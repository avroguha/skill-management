"use client";
// Asking for a new skill or a new category. The catalogue is the same for everyone, so a new
// one is asked for here and a coordinator approves it. Used from Requests, a team's roles and
// needs, and My skills; also to change a request that came back.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/info";
import { SimilarNames, type NameItem } from "@/components/name-search";
import { askForCatalogue, resendRequest } from "@/app/actions/requests";

export interface AskCatalogue {
  categories: { id: string; name: string }[];
  /** top-level skills a sub-skill can go under */
  parents: { id: string; name: string; categoryId: string }[];
  /** what is in the catalogue already, to show while a name is typed */
  skills: NameItem[];
  /** who decides, in words: "Ilmari Voss or an administrator" */
  approvers: string;
}

export interface AskInitial {
  /** set to change a request that exists (it came back, or still waits) */
  id?: string;
  kind?: "skill" | "category";
  name?: string;
  description?: string;
  categoryId?: string | null;
  categoryName?: string;
  parentId?: string | null;
  reason?: string;
  /** the coordinator's note on a request that came back */
  note?: string;
}

const NEW = "__new__";

export function AskDialog({ catalogue, initial, onClose, onDone }: { catalogue: AskCatalogue; initial?: AskInitial; onClose: () => void; onDone?: () => void }) {
  const router = useRouter();
  const editing = !!initial?.id;
  const [kind, setKind] = useState<"skill" | "category">(initial?.kind ?? "skill");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? (initial?.categoryName ? NEW : catalogue.categories[0]?.id ?? NEW));
  const [categoryName, setCategoryName] = useState(initial?.categoryName ?? "");
  const [parentId, setParentId] = useState(initial?.parentId ?? "none");
  const [busy, start] = useTransition();
  const similar = useMemo(() => (kind === "skill" ? catalogue.skills : catalogue.categories.map((c) => ({ id: c.id, name: c.name, hint: "category" }))), [kind, catalogue]);
  const parents = catalogue.parents.filter((p) => p.categoryId === categoryId);

  const send = () => start(async () => {
    const fields = {
      name, description, reason,
      categoryId: kind === "skill" && categoryId !== NEW ? categoryId : null,
      categoryName: kind === "skill" && categoryId === NEW ? categoryName : "",
      parentId: kind === "skill" && parentId !== "none" ? parentId : null,
    };
    const r = editing ? await resendRequest(initial!.id!, fields) : await askForCatalogue({ kind, ...fields });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Sent.");
    onDone?.();
    onClose();
    router.refresh();
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Change and send again" : "Ask for a new skill or category"}</DialogTitle>
          <DialogDescription>
            Skills and categories are the same for everyone, so a new one is approved first. This goes to {catalogue.approvers}. You see where it is under Requests.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {initial?.note && (
            <div className="rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <b>Sent back with this note:</b> {initial.note}
            </div>
          )}
          {!editing && (
            <Field label="What do you need?" info="A skill is something people rate themselves on, such as Kubernetes or Negotiation. A category is a group of skills, such as Cloud or Business.">
              <RadioGroup value={kind} onValueChange={(v) => setKind(v as "skill" | "category")} className="grid grid-cols-2 gap-2">
                {([["skill", "A skill", "Something people are rated on"], ["category", "A category", "A group of skills"]] as const).map(([v, title, sub]) => (
                  <Label key={v} className="flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal has-[:checked]:border-primary has-[:checked]:bg-accent/50">
                    <RadioGroupItem value={v} className="mt-0.5" />
                    <span><span className="font-medium">{title}</span><span className="block text-xs text-muted-foreground">{sub}</span></span>
                  </Label>
                ))}
              </RadioGroup>
            </Field>
          )}
          <Field label="Name" htmlFor="ask-name" info="What it should be called. Names are unique: what is already in the catalogue with a name like it shows as you type. If it is there, use that one.">
            <Input id="ask-name" value={name} maxLength={120} autoComplete="off" onChange={(e) => setName(e.target.value)} placeholder={kind === "skill" ? "e.g. Service mesh" : "e.g. Finance operations"} />
            <SimilarNames query={name} items={similar} noun={kind} limit={4} />
          </Field>
          {kind === "skill" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" info="The group it belongs in. If none fits, choose A new category and name it: the coordinator makes both.">
                <Select value={categoryId} onValueChange={(c) => { setCategoryId(c); setParentId("none"); }}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {catalogue.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    <SelectItem value={NEW}>A new category…</SelectItem>
                  </SelectContent>
                </Select>
                {categoryId === NEW && <Input className="mt-1.5" value={categoryName} maxLength={80} onChange={(e) => setCategoryName(e.target.value)} placeholder="Name of the new category" aria-label="Name of the new category" />}
              </Field>
              <Field label="Under (optional)" info="Makes it a sub-skill of an existing skill, for example EC2 under AWS. Leave it at top level otherwise.">
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
          <Field label="What it covers (optional)" htmlFor="ask-desc" info="One or two lines, shown with it in the catalogue.">
            <Textarea id="ask-desc" className="min-h-16" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Why you need it" htmlFor="ask-why" info="A line for the coordinator: which team or role needs it, and for what. It helps them decide quickly.">
            <Textarea id="ask-why" className="min-h-16" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Two of our services run on it and nobody is rated on it." />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={send} disabled={busy || name.trim().length < 2 || (kind === "skill" && categoryId === NEW && categoryName.trim().length < 2)}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}{editing ? "Send again" : "Send the request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
