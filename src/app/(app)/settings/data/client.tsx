"use client";
import { useState, useTransition } from "react";
import { Upload, Loader2, FlaskConical, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabelInfo } from "@/components/info";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importData } from "@/app/actions/data";
import { clearOrganisation } from "@/app/actions/admin";
import type { ImportReport, NearSkill, SkillAction } from "@/lib/transfer";

type Decision = { action: SkillAction; targetId?: string };
const ACTIONS: { value: SkillAction; label: string }[] = [
  { value: "merge", label: "Merge into existing (its name becomes an alias)" },
  { value: "replace", label: "Replace existing with new (ratings and history stay)" },
  { value: "separate", label: "Keep both (add it as a separate skill)" },
  { value: "skip", label: "Skip the new one" },
];

export function ImportForm({ kinds }: { kinds: { kind: string; columns: string[]; description: string }[] }) {
  const [kind, setKind] = useState(kinds[0].kind);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [pending, start] = useTransition();
  const current = kinds.find((k) => k.kind === kind)!;
  const reviewing = report?.dryRun ? report.matches : [];
  const open = reviewing.filter((m) => !decisions[m.key]).length;
  const chosen = () => Object.entries(decisions).map(([key, d]) => ({ key, ...d }));
  const reset = () => { setReport(null); setDecisions({}); };
  const run = (dryRun: boolean) => start(async () => {
    // skills are checked first, so nothing near-identical goes in without a decision
    if (!dryRun && kind === "skills" && !report?.dryRun) {
      const pre = await importData(kind, text, true, chosen());
      if (!pre.ok) { toast.error(pre.error); return; }
      const waiting = pre.report.matches.filter((m) => !decisions[m.key]).length;
      if (waiting) {
        setReport(pre.report);
        toast.info(`${waiting} skill${waiting === 1 ? " looks" : "s look"} like one already in the catalogue. Choose what to do, then import.`);
        return;
      }
    }
    const r = await importData(kind, text, dryRun, chosen());
    if (!r.ok) { toast.error(r.error); return; }
    setReport(r.report);
    if (!dryRun) {
      setDecisions({});
      toast.success(`Imported: ${r.report.created} new, ${r.report.updated} updated${r.report.errors.length ? `, ${r.report.errors.length} skipped` : ""}`);
    }
  });
  return (
    <div className="grid gap-3">
      <div className={kinds.length > 1 ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
        {kinds.length > 1 && (
          <div className="grid gap-1.5">
            <LabelInfo info="Which kind of data the file holds. Each kind has its own columns, listed under the choice.">What</LabelInfo>
            <Select value={kind} onValueChange={(k) => { setKind(k); reset(); }}>
              <SelectTrigger className="w-full" aria-label="What the file holds"><SelectValue /></SelectTrigger>
              <SelectContent>{kinds.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.kind}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <LabelInfo htmlFor={`file-${kinds.length}`} info="A comma-separated file with a header row. Check it first: nothing is saved until you press Import.">CSV file</LabelInfo>
          <Input id={`file-${kinds.length}`} type="file" accept=".csv,text/csv" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFileName(f.name);
            setText(await f.text());
            reset();
          }} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{current.description}<br /><span className="font-mono">{current.columns.join(", ")}</span></p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!text || pending} onClick={() => run(true)}>{pending ? <Loader2 className="animate-spin" /> : <FlaskConical />}Check (dry run)</Button>
        <Button disabled={!text || pending || open > 0} onClick={() => run(false)}><Upload />Import {fileName && `“${fileName}”`}</Button>
        {open > 0 && <span className="self-center text-xs text-muted-foreground">Choose what to do with {open} near-identical skill{open === 1 ? "" : "s"} first.</span>}
      </div>
      {reviewing.length > 0 && <NearMatches matches={reviewing} decisions={decisions} onChange={setDecisions} />}
      {report && (
        <div className="rounded-md border p-3 text-sm">
          <div className="font-medium">
            {report.dryRun ? "Dry run: nothing was changed. " : ""}{report.rows} rows · {report.created} new · {report.updated} updated · {report.errors.length} skipped
            {report.undecided > 0 && report.dryRun ? ` · ${report.undecided} waiting for a decision` : ""}
          </div>
          {[...report.errors.map((e) => ({ ...e, kind: "Skipped" })), ...report.warnings.map((w) => ({ ...w, kind: "Note" }))].slice(0, 50).map((e, i) => (
            <div key={i} className="mt-1 flex gap-2 text-xs">
              <span className={e.kind === "Skipped" ? "font-medium text-destructive" : "text-muted-foreground"}>{e.kind} line {e.line}:</span>
              <span>{e.message}</span>
            </div>
          ))}
          {report.errors.length + report.warnings.length > 50 && <div className="mt-1 text-xs text-muted-foreground">…and {report.errors.length + report.warnings.length - 50} more.</div>}
        </div>
      )}
    </div>
  );
}

/** Each new skill that looks like an existing one, with the four choices. */
function NearMatches({ matches, decisions, onChange }: { matches: NearSkill[]; decisions: Record<string, Decision>; onChange: (d: Record<string, Decision>) => void }) {
  const set = (m: NearSkill, d: Partial<Decision>) => {
    const was = decisions[m.key];
    const action = d.action ?? was?.action;
    if (!action) return;
    onChange({ ...decisions, [m.key]: { action, targetId: d.targetId ?? was?.targetId ?? m.candidates[0].id } });
  };
  const applyAll = (action: SkillAction) => {
    const next = { ...decisions };
    for (const m of matches) if (!next[m.key]) next[m.key] = { action, targetId: m.candidates[0].id };
    onChange(next);
  };
  return (
    <div className="grid gap-2 rounded-md border border-amber-500/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{matches.length} new skill{matches.length === 1 ? " looks" : "s look"} like one already in the catalogue.</span>{" "}
          <span className="text-muted-foreground">Choose what to do with each. Nothing is imported until every one has a choice.</span>
        </div>
        <Select value="" onValueChange={(a) => applyAll(a as SkillAction)}>
          <SelectTrigger className="h-8 w-56 text-xs" aria-label="Set every open one to"><SelectValue placeholder="Set every open one to…" /></SelectTrigger>
          <SelectContent>{ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
        {matches.map((m) => {
          const d = decisions[m.key];
          const target = m.candidates.find((c) => c.id === (d?.targetId ?? m.candidates[0].id)) ?? m.candidates[0];
          return (
            <div key={m.key} className={`grid gap-2 rounded-md border p-2 text-sm ${d ? "" : "bg-amber-500/5"}`}>
              <div className="min-w-0">
                <div className="font-medium break-words">{m.incoming}</div>
                <div className="text-xs text-muted-foreground">
                  New {m.level === "skill" ? "skill" : "sub-skill"} in {m.category} · line{m.lines.length === 1 ? "" : "s"} {m.lines.slice(0, 6).join(", ")}{m.lines.length > 6 ? "…" : ""}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid min-w-0 gap-1">
                  <LabelInfo className="text-xs" info="The existing skill this new one resembles, and why.">Looks like</LabelInfo>
                  {m.candidates.length === 1 ? (
                    <div className="text-xs break-words"><span className="font-medium">{target.path}</span> ({target.category})</div>
                  ) : (
                    <Select value={target.id} onValueChange={(id) => set(m, { targetId: id })}>
                      <SelectTrigger className="h-8 w-full text-xs" aria-label="The existing skill it is compared with"><SelectValue /></SelectTrigger>
                      <SelectContent>{m.candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.path} ({c.category}) · {Math.round(c.score * 100)}%</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <div className="text-xs text-muted-foreground">{target.reason} · {Math.round(target.score * 100)}% alike</div>
                </div>
                <div className="grid min-w-0 gap-1">
                  <LabelInfo className="text-xs" info="Merge: no new skill, its name becomes an alias of the existing one. Replace: the existing skill takes the new name and keeps its ratings. Keep both: add it beside the existing one. Skip: leave the row out.">What to do</LabelInfo>
                  <Select value={d?.action ?? ""} onValueChange={(a) => set(m, { action: a as SkillAction })}>
                    <SelectTrigger className="h-8 w-full text-xs" aria-label="What to do with it"><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>{ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ClearOrganisation() {
  const [confirm, setConfirm] = useState("");
  const [accounts, setAccounts] = useState(false);
  const [history, setHistory] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><Checkbox checked={accounts} onCheckedChange={(c) => setAccounts(!!c)} />Also remove user accounts (administrators stay)</label>
        <label className="flex items-center gap-2"><Checkbox checked={history} onCheckedChange={(c) => setHistory(!!c)} />Also clear the audit log and sync history</label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <LabelInfo htmlFor="confirm" info="Removes every person, rating, role and skill (accounts and settings stay). A backup is taken first.">Type DELETE to confirm</LabelInfo>
          <Input id="confirm" className="w-48" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button variant="destructive" disabled={confirm.trim().toUpperCase() !== "DELETE" || pending} onClick={() => start(async () => {
          const r = await clearOrganisation(confirm, { accounts, history });
          if (r.ok) { toast.success(r.message ?? "Cleared", { duration: 10000 }); setConfirm(""); } else toast.error(r.error);
        })}>{pending ? <Loader2 className="animate-spin" /> : <AlertTriangle />}Clear and start from scratch</Button>
      </div>
    </div>
  );
}
