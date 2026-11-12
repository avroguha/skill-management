"use client";
import { useState, useTransition } from "react";
import { Upload, Loader2, FlaskConical, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importData } from "@/app/actions/data";
import { clearOrganisation } from "@/app/actions/admin";
import type { ImportReport } from "@/lib/transfer";

export function ImportForm({ kinds }: { kinds: { kind: string; columns: string[]; description: string }[] }) {
  const [kind, setKind] = useState(kinds[0].kind);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, start] = useTransition();
  const current = kinds.find((k) => k.kind === kind)!;
  const run = (dryRun: boolean) => start(async () => {
    const r = await importData(kind, text, dryRun);
    if (!r.ok) { toast.error(r.error); return; }
    setReport(r.report);
    if (!dryRun) toast.success(`Imported: ${r.report.created} new, ${r.report.updated} updated${r.report.errors.length ? `, ${r.report.errors.length} skipped` : ""}`);
  });
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>What</Label>
          <Select value={kind} onValueChange={(k) => { setKind(k); setReport(null); }}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{kinds.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.kind}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="file">CSV file</Label>
          <Input id="file" type="file" accept=".csv,text/csv" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFileName(f.name);
            setText(await f.text());
            setReport(null);
          }} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{current.description}<br /><span className="font-mono">{current.columns.join(", ")}</span></p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={!text || pending} onClick={() => run(true)}>{pending ? <Loader2 className="animate-spin" /> : <FlaskConical />}Check (dry run)</Button>
        <Button disabled={!text || pending} onClick={() => run(false)}><Upload />Import {fileName && `“${fileName}”`}</Button>
      </div>
      {report && (
        <div className="rounded-md border p-3 text-sm">
          <div className="font-medium">
            {report.dryRun ? "Dry run: nothing was changed. " : ""}{report.rows} rows · {report.created} new · {report.updated} updated · {report.errors.length} skipped
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
          <Label htmlFor="confirm">Type DELETE to confirm</Label>
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
