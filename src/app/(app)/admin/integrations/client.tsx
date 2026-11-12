"use client";
// Integrations: create one for a tool (the key is shown once, with that tool's steps),
// see when each was last used, show the steps again, revoke, remove.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Plus, ShieldOff, Trash2, BookOpen, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CopyValue } from "@/components/copy-value";
import { Empty } from "@/components/heatmap";
import { cn } from "@/lib/utils";
import { createIntegration, removeIntegration, revokeIntegration } from "@/app/actions/integrations";

type Tool = "powerbi" | "tableau" | "csv" | "other";
interface DatasetInfo { key: string; entity: string; title: string; description: string; columns: number }
interface Client {
  id: string; name: string; tool: string; hint: string; datasets: string[]; createdBy: string; createdAt: string;
  expiresAt: string | null; lastUsedAt: string | null; useCount: number; state: "active" | "expired" | "revoked";
}

const TOOLS: { id: Tool; label: string; text: string }[] = [
  { id: "powerbi", label: "Power BI", text: "OData feed, refreshes on a schedule" },
  { id: "tableau", label: "Tableau", text: "OData connector, extracts on a schedule" },
  { id: "csv", label: "Excel / CSV", text: "A CSV file per dataset, from the web" },
  { id: "other", label: "Other", text: "JSON API with paging, for scripts" },
];
const TOOL_LABEL: Record<string, string> = Object.fromEntries(TOOLS.map((t) => [t.id, t.label]));
const EXPIRY = [{ v: "30", l: "30 days" }, { v: "90", l: "90 days" }, { v: "365", l: "1 year" }, { v: "0", l: "Never" }];
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" });

export function Integrations({ base, datasets, clients }: { base: string; datasets: DatasetInfo[]; clients: Client[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<{ tool: Tool; sets: string[]; key?: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "revoke" | "remove"; c: Client } | null>(null);
  const [pending, start] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    if (r.ok) { toast.success(r.message ?? "Done."); setConfirm(null); router.refresh(); }
    else toast.error(r.error ?? "That did not work.");
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setOpen(true)} data-tour="integrations-new"><Plus />New integration</Button>
        <span className="text-xs text-muted-foreground">Read-only. Manager-validated levels. Every key is limited to the datasets chosen for it.</span>
      </div>

      {clients.length === 0 ? (
        <Empty>No integrations yet. Create one for each report or tool, so each can be revoked on its own.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Integration</th><th className="px-3 py-2 font-medium">Datasets</th><th className="px-3 py-2 font-medium">Last used</th><th className="px-3 py-2 font-medium">Expires</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className={cn("border-b last:border-0 align-top", c.state !== "active" && "text-muted-foreground")}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 font-medium text-foreground">{c.name}
                      {c.state !== "active" && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">{c.state}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{TOOL_LABEL[c.tool] ?? c.tool} · key <code>{c.hint}</code> · by {c.createdBy || "–"}, {date(c.createdAt)}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">{c.datasets.map((d) => <span key={d} className="rounded border px-1.5 py-0.5 text-xs">{datasets.find((x) => x.key === d)?.title ?? d}</span>)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular">{c.lastUsedAt ? <>{new Date(c.lastUsedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}<div className="text-muted-foreground">{c.useCount.toLocaleString("en-GB")} request{c.useCount === 1 ? "" : "s"}</div></> : "Never"}</td>
                  <td className="px-3 py-2.5 text-xs tabular">{c.expiresAt ? date(c.expiresAt) : "Never"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      {c.state === "active" && <Button size="sm" variant="ghost" onClick={() => setSteps({ tool: (c.tool as Tool), sets: c.datasets, name: c.name })}><BookOpen />How to connect</Button>}
                      {c.state === "active"
                        ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ kind: "revoke", c })}><ShieldOff />Revoke</Button>
                        : <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "remove", c })}><Trash2 />Remove</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="grid gap-2 rounded-lg border bg-card p-4 text-sm">
        <h2 className="font-medium">The datasets</h2>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {datasets.map((d) => <li key={d.key}><span className="font-medium">{d.title}</span> <span className="text-xs text-muted-foreground">({d.columns} columns) {d.description}</span></li>)}
        </ul>
        <p className="text-xs text-muted-foreground">
          Each is a JSON API (<code>{base}/api/v1/&lt;dataset&gt;</code>), a CSV file (<code>…/api/v1/&lt;dataset&gt;.csv</code>) and an OData feed (<code>{base}/api/odata</code>). The data is rebuilt whenever anything changes.
        </p>
      </section>

      <CreateDialog open={open} onOpenChange={setOpen} datasets={datasets}
        onCreated={(s) => { setOpen(false); setSteps(s); router.refresh(); }} />

      <Dialog open={!!steps} onOpenChange={(o) => { if (!o) setSteps(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{steps?.key ? `${steps.name}: your key` : `Connect ${steps?.name ?? ""}`}</DialogTitle>
            <DialogDescription>{steps ? `${TOOL_LABEL[steps.tool]}: step by step.` : ""}</DialogDescription>
          </DialogHeader>
          {steps && <ConnectSteps base={base} tool={steps.tool} sets={datasets.filter((d) => steps.sets.includes(d.key))} keyValue={steps.key} />}
          <DialogFooter><Button onClick={() => setSteps(null)}>{steps?.key ? "I have copied the key" : "Close"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.kind === "revoke" ? `Revoke ${confirm?.c.name}?` : `Remove ${confirm?.c.name}?`}</DialogTitle>
            <DialogDescription>
              {confirm?.kind === "revoke"
                ? "Its key stops working at once: reports using it fail on their next refresh. This cannot be undone; create a new integration to connect again."
                : "It disappears from this list. The audit log keeps the record of its creation and revocation."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant={confirm?.kind === "revoke" ? "destructive" : "default"} disabled={pending}
              onClick={() => confirm && act(() => (confirm.kind === "revoke" ? revokeIntegration(confirm.c.id) : removeIntegration(confirm.c.id)))}>
              {pending && <Loader2 className="animate-spin" />}{confirm?.kind === "revoke" ? "Revoke key" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateDialog({ open, onOpenChange, datasets, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; datasets: DatasetInfo[];
  onCreated: (s: { tool: Tool; sets: string[]; key: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [tool, setTool] = useState<Tool>("powerbi");
  const [sets, setSets] = useState<string[]>(["people", "units", "talent"]);
  const [expires, setExpires] = useState("365");
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    const r = await createIntegration({ name, tool, datasets: sets, expiresDays: Number(expires) });
    if (!r.ok) { toast.error(r.error); return; }
    onCreated({ tool, sets, key: r.key, name });
    setName("");
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New integration</DialogTitle>
          <DialogDescription>One per report or tool, so each can be revoked without breaking the others.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="int-name">Name</Label>
            <Input id="int-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Power BI - leadership dashboard" maxLength={80} />
          </div>
          <div className="grid gap-1.5">
            <Label>Tool</Label>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tool">
              {TOOLS.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={tool === t.id} onClick={() => setTool(t.id)}
                  className={cn("rounded-md border p-2.5 text-left transition-colors", tool === t.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent")}>
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.text}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Datasets it may read</Label>
            <div className="grid gap-2">
              {datasets.map((d) => (
                <label key={d.key} className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox className="mt-0.5" checked={sets.includes(d.key)}
                    onCheckedChange={(v) => setSets((s) => (v ? [...new Set([...s, d.key])] : s.filter((x) => x !== d.key)))} />
                  <span><span className="font-medium">{d.title}</span> <span className="text-xs text-muted-foreground">{d.description}</span></span>
                </label>
              ))}
            </div>
            {sets.includes("people") || sets.includes("ratings") ? (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />People and Ratings hold names and e-mail addresses. Share the key only with the report&apos;s owner.</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>Key expires</Label>
            <Select value={expires} onValueChange={setExpires}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{EXPIRY.map((e) => <SelectItem key={e.v} value={e.v}>{e.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || name.trim().length < 2 || !sets.length}>{pending ? <Loader2 className="animate-spin" /> : <KeyRound />}Create key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectSteps({ base, tool, sets, keyValue }: { base: string; tool: Tool; sets: DatasetInfo[]; keyValue?: string }) {
  const key = keyValue ?? "<the key you copied when it was created>";
  const first = sets[0];
  return (
    <div className="grid gap-4 text-sm">
      {keyValue ? (
        <div className="grid gap-2 rounded-md border border-status-critical/40 bg-status-critical/5 p-3">
          <CopyValue label="Key (shown once)" value={keyValue} hint="Copy it now and keep it in the tool's credential store. It is never shown again: if it is lost, revoke this integration and create a new one." />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">The key was shown once, when this integration was created. If it is lost, revoke it and create a new one.</p>
      )}

      {tool === "powerbi" && (
        <ol className="grid list-decimal gap-2 pl-5">
          <li>Power BI Desktop: <b>Get data</b> › <b>OData feed</b>.</li>
          <li><CopyValue label="URL" value={`${base}/api/odata`} /></li>
          <li>When asked how to sign in, choose <b>Basic</b>. User name: <code>key</code> (anything). Password: the key.</li>
          <li>Tick the tables ({sets.map((s) => s.entity).join(", ")}) and <b>Load</b>. Relate them on <code>unit_id</code>, <code>person_id</code> / <code>id</code> and <code>skill_id</code>.</li>
          <li>Publish, then in the Power BI service open the semantic model&apos;s <b>Settings</b> › <b>Data source credentials</b>, enter the same Basic credentials, and set a <b>scheduled refresh</b>. If this server is only on the company network, the refresh goes through an on-premises data gateway.</li>
        </ol>
      )}
      {tool === "tableau" && (
        <ol className="grid list-decimal gap-2 pl-5">
          <li>Tableau Desktop: <b>Connect</b> › <b>To a Server</b> › <b>OData</b>.</li>
          <li>Server: one dataset per connection (add the others with <b>Add</b> on the data source page).
            <div className="mt-1.5 grid gap-1.5">{sets.map((s) => <CopyValue key={s.key} label={s.title} value={`${base}/api/odata/${s.entity}`} />)}</div>
          </li>
          <li>Authentication: <b>Username and Password</b>. Username: <code>key</code> (anything). Password: the key.</li>
          <li>Publish with the credentials <b>embedded</b> and schedule an extract refresh. Tableau Cloud reaches a server on the company network through Tableau Bridge.</li>
        </ol>
      )}
      {tool === "csv" && (
        <ol className="grid list-decimal gap-2 pl-5">
          <li>Excel: <b>Data</b> › <b>Get Data</b> › <b>From Other Sources</b> › <b>From Web</b>.</li>
          <li>One URL per dataset:
            <div className="mt-1.5 grid gap-1.5">{sets.map((s) => <CopyValue key={s.key} label={s.title} value={`${base}/api/v1/${s.key}.csv`} />)}</div>
          </li>
          <li>Sign in with <b>Basic</b>: user name <code>key</code> (anything), password the key. <b>Refresh All</b> fetches it again.</li>
          <li>From a script: <code className="break-all">curl -u key:{keyValue ? "$KEY" : "<key>"} {base}/api/v1/{first?.key ?? "people"}.csv -o {first?.key ?? "people"}.csv</code></li>
        </ol>
      )}
      {tool === "other" && (
        <ol className="grid list-decimal gap-2 pl-5">
          <li>Send the key in a header: <code>Authorization: Bearer &lt;key&gt;</code> (or <code>X-API-Key</code>, or Basic with the key as the password).</li>
          <li><CopyValue label="What this key may read, with every column" value={`${base}/api/v1`} /></li>
          <li>Each dataset pages with <code>?page=</code> and <code>?size=</code> (up to 10,000); follow <code>next</code> until it is null.
            <div className="mt-1.5 grid gap-1.5">{sets.map((s) => <CopyValue key={s.key} label={s.title} value={`${base}/api/v1/${s.key}`} />)}</div>
          </li>
          <li>Example: <code className="break-all">curl -H &quot;Authorization: Bearer {keyValue ? "$KEY" : "<key>"}&quot; {base}/api/v1/{first?.key ?? "people"}?size=1000</code></li>
        </ol>
      )}
      <p className="text-xs text-muted-foreground">Up to 240 requests a minute per key. Never put the key in a URL: URLs end up in logs. Keep {key === keyValue ? "it" : "the key"} out of shared files and screenshots.</p>
    </div>
  );
}
