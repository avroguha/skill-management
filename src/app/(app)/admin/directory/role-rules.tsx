"use client";
// Roles from designations: an ordered list of "designation is / contains / starts with
// <text>" -> role (and optionally grade). The sync applies the first rule that matches.
import { useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { learnRoleRules } from "@/app/actions/directory";
import type { RoleRule, RuleOp } from "@/lib/directory/config";

export type Option = { id: string; name: string };
const KEEP = "__keep";
const OPS: { value: RuleOp; label: string }[] = [
  { value: "is", label: "is" },
  { value: "starts", label: "starts with" },
  { value: "contains", label: "contains" },
];

export function RoleRules({ rules, overwrite, roles, grades, onChange, onOverwrite }: {
  rules: RoleRule[]; overwrite: boolean; roles: Option[]; grades: Option[];
  onChange: (r: RoleRule[]) => void; onOverwrite: (v: boolean) => void;
}) {
  const [pending, start] = useTransition();
  const put = (i: number, patch: Partial<RoleRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const learn = () => start(async () => {
    const r = await learnRoleRules();
    if (!r.ok) { toast.error(r.error); return; }
    const have = new Set(rules.map((x) => `${x.op}|${x.text.trim().toLowerCase()}`));
    const fresh = r.rules.filter((x) => !have.has(`${x.op}|${x.text.trim().toLowerCase()}`));
    if (!fresh.length) { toast.info("Nothing new: every designation with a role already has a rule."); return; }
    // exact rules go first, so they win over broader "contains" rules already in the list
    onChange([...fresh, ...rules]);
    toast.success(`${fresh.length} rule${fresh.length === 1 ? "" : "s"} added from current roles. Save to keep them.`);
    for (const c of r.conflicts) toast.warning(c);
  });

  return (
    <div className="grid gap-3">
      <div>
        <h3 className="text-sm font-medium">Roles from designation</h3>
        <p className="text-xs text-muted-foreground">
          Gives synced people a role (and a grade) from their designation. Checked top to bottom; the first match wins, so put specific rules
          (Senior Cloud Engineer) above broad ones (contains Engineer). Matching ignores case and extra spaces. Test shows the result.
        </p>
      </div>
      {rules.length > 0 && (
        <ol className="grid gap-2">
          {rules.map((r, i) => (
            <li key={i} className="grid items-center gap-2 rounded-md border p-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)_minmax(0,13rem)_minmax(0,10.5rem)_auto] lg:border-0 lg:p-0">
              <Select value={r.op} onValueChange={(v) => put(i, { op: v as RuleOp })}>
                <SelectTrigger className="h-8 w-full" aria-label={`Rule ${i + 1}: how to match`}><SelectValue /></SelectTrigger>
                <SelectContent>{OPS.map((o) => <SelectItem key={o.value} value={o.value}>Designation {o.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="h-8" value={r.text} onChange={(e) => put(i, { text: e.target.value })} placeholder="e.g. Cloud Engineer" aria-label={`Rule ${i + 1}: designation text`} />
              <Select value={r.roleId || undefined} onValueChange={(v) => put(i, { roleId: v })}>
                <SelectTrigger className="h-8 w-full" aria-label={`Rule ${i + 1}: role`}><SelectValue placeholder="Role…" /></SelectTrigger>
                <SelectContent>{roles.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={r.gradeId || KEEP} onValueChange={(v) => put(i, { gradeId: v === KEEP ? "" : v })}>
                <SelectTrigger className="h-8 w-full" aria-label={`Rule ${i + 1}: grade`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Grade unchanged</SelectItem>
                  {grades.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex justify-end gap-0.5 sm:col-span-2 lg:col-span-1">
                <Button type="button" variant="ghost" size="icon" className="size-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move rule ${i + 1} up`}><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon" className="size-8" disabled={i === rules.length - 1} onClick={() => move(i, 1)} aria-label={`Move rule ${i + 1} down`}><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => onChange(rules.filter((_, j) => j !== i))} aria-label={`Remove rule ${i + 1}`}><Trash2 /></Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!roles.length}
          onClick={() => onChange([...rules, { op: "is", text: "", roleId: "", gradeId: "" }])}><Plus />Add rule</Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={learn}
          title="One rule per designation, from the roles synced people already have">
          {pending ? <Loader2 className="animate-spin" /> : <Wand2 />}Create from current roles
        </Button>
        {!roles.length && <span className="text-xs text-muted-foreground">Add roles in Admin › Roles & targets first.</span>}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Switch checked={overwrite} onCheckedChange={onOverwrite} className="mt-0.5" />
        <span>
          Also change people who already have a role
          <span className="block text-xs text-muted-foreground">
            {overwrite ? "Roles follow the designation on every sync; a role set by hand is replaced when a rule matches."
              : "Rules only fill an empty role; roles set by hand are kept."}
          </span>
        </span>
      </label>
    </div>
  );
}
