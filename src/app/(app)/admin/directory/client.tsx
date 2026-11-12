"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Save, RefreshCw, Loader2, ListFilter, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  saveDirectory, testDirectory, fieldValues, syncDirectoryNow, saveProfileSettings,
  type DirectoryForm as Form, type TestResult,
} from "@/app/actions/directory";
import { cn } from "@/lib/utils";

interface Initial {
  enabled: boolean; instanceUrl: string; username: string; hasPassword: boolean; table: string; rootUserName: string;
  typeField: string; typeValues: string[]; extraQuery: string;
  fields: { userName: string; name: string; email: string; manager: string; title: string };
  extraFields: string[]; orgFromHierarchy: boolean; syncEveryHours: number;
}

function Field({ label, help, children, className }: { label: string; help?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

export function DirectoryForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [f, setF] = useState({ ...initial, password: "", extraFieldsText: initial.extraFields.join(", ") });
  const [values, setValues] = useState<{ value: string; count: number }[] | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const setField = (k: keyof Initial["fields"], v: string) => setF((x) => ({ ...x, fields: { ...x.fields, [k]: v } }));
  const form = (): Form => ({
    enabled: f.enabled, instanceUrl: f.instanceUrl, username: f.username, password: f.password, table: f.table,
    rootUserName: f.rootUserName, typeField: f.typeField, typeValues: f.typeValues, extraQuery: f.extraQuery, fields: f.fields,
    extraFields: f.extraFieldsText.split(",").map((x) => x.trim()).filter(Boolean), orgFromHierarchy: f.orgFromHierarchy,
    syncEveryHours: f.syncEveryHours,
  });
  const run = (name: string, fn: () => Promise<void>) => start(async () => { setBusy(name); try { await fn(); } finally { setBusy(null); } });

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Instance URL" className="xl:col-span-2"><Input value={f.instanceUrl} onChange={(e) => set("instanceUrl", e.target.value)} placeholder="https://company.service-now.com" /></Field>
        <Field label="Integration user"><Input value={f.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" /></Field>
        <Field label="Password" help={initial.hasPassword ? "Saved, encrypted. Leave blank to keep it." : "Stored encrypted; never shown again."}>
          <Input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} placeholder={initial.hasPassword ? "••••••••" : ""} autoComplete="new-password" />
        </Field>
        <Field label="Top-level user (user_name)" help="Everyone under this person, recursively, through the manager field."><Input value={f.rootUserName} onChange={(e) => set("rootUserName", e.target.value)} placeholder="e.g. jane.doe" /></Field>
        <Field label="User type field" help="Tells people from service accounts, e.g. identity_type.">
          <div className="flex gap-2">
            <Input value={f.typeField} onChange={(e) => { set("typeField", e.target.value); setValues(null); }} />
            <Button type="button" variant="outline" disabled={!!busy || !f.typeField} onClick={() => run("values", async () => {
              const r = await fieldValues(form(), f.typeField);
              if (r.ok) setValues(r.values); else toast.error(r.error);
            })}>{busy === "values" ? <Loader2 className="animate-spin" /> : <ListFilter />}Load values</Button>
          </div>
        </Field>
        <Field label="Bring in these types" className="xl:col-span-2" help={f.typeValues.length ? `Only ${f.typeValues.join(", ")}. The top-level user always comes in.` : "No filter: every type comes in, service accounts included."}>
          <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-3 py-2">
            {(values ?? f.typeValues.map((v) => ({ value: v, count: -1 }))).map((v) => {
              const on = f.typeValues.includes(v.value);
              return (
                <label key={v.value || "(empty)"} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={on} onCheckedChange={(c) => set("typeValues", c ? [...f.typeValues, v.value] : f.typeValues.filter((x) => x !== v.value))} />
                  {v.value || <span className="text-muted-foreground">(empty)</span>}
                  {v.count >= 0 && <span className="text-xs text-muted-foreground tabular">{v.count}</span>}
                </label>
              );
            })}
            {!values && <span className="text-xs text-muted-foreground">Load values to see the types in the table.</span>}
          </div>
        </Field>
        <Field label="Extra filter (encoded query)" className="xl:col-span-2" help="Applied to every record below the top user. active=true leaves out leavers.">
          <Input value={f.extraQuery} onChange={(e) => set("extraQuery", e.target.value)} placeholder="active=true" />
        </Field>
        <Field label="Table"><Input value={f.table} onChange={(e) => set("table", e.target.value)} /></Field>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Fields</h3>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Field label="Login name"><Input value={f.fields.userName} onChange={(e) => setField("userName", e.target.value)} /></Field>
          <Field label="Display name"><Input value={f.fields.name} onChange={(e) => setField("name", e.target.value)} /></Field>
          <Field label="E-mail"><Input value={f.fields.email} onChange={(e) => setField("email", e.target.value)} /></Field>
          <Field label="Manager"><Input value={f.fields.manager} onChange={(e) => setField("manager", e.target.value)} /></Field>
          <Field label="Designation"><Input value={f.fields.title} onChange={(e) => setField("title", e.target.value)} /></Field>
          <Field label="Also keep" help="Comma-separated, e.g. employee_number for the photo URL"><Input value={f.extraFieldsText} onChange={(e) => set("extraFieldsText", e.target.value)} /></Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <label className="flex items-center gap-2 text-sm"><Switch checked={f.orgFromHierarchy} onCheckedChange={(c) => set("orgFromHierarchy", c)} />Build teams from the manager chain</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={f.enabled} onCheckedChange={(c) => set("enabled", c)} />Scheduled sync on</label>
        <label className="flex items-center gap-2 text-sm">every
          <Input type="number" min={0} max={168} className="h-8 w-20" value={f.syncEveryHours} onChange={(e) => set("syncEveryHours", Number(e.target.value))} />hours
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!!busy} onClick={() => run("test", async () => {
          setError(null); setResult(null);
          const r = await testDirectory(form());
          if (r.ok) setResult(r); else setError(r.error);
        })}>{busy === "test" ? <Loader2 className="animate-spin" /> : <FlaskConical />}Test</Button>
        <Button disabled={!!busy} onClick={() => run("save", async () => {
          const r = await saveDirectory(form());
          if (r.ok) { toast.success("Saved"); set("password", ""); router.refresh(); } else toast.error(r.error);
        })}>{busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}Save</Button>
        <Button variant="secondary" disabled={!!busy || !initial.instanceUrl} title={!initial.instanceUrl ? "Save the connection first" : undefined}
          onClick={() => run("sync", async () => {
            const r = await syncDirectoryNow();
            if (!r.ok) toast.error(r.error);
            else if (r.status === "ok") toast.success(r.message.split(";")[0]);
            else toast.error(r.message);
            router.refresh();
          })}>{busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sync now (saved settings)</Button>
      </div>

      {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
      {result && (
        <div className="grid gap-3 rounded-md border p-3">
          <div className="text-sm">
            <b>Connected.</b> Top-level user <b>{result.root.name}</b>{result.root.title && ` (${result.root.title})`}.{" "}
            <b className="tabular">{result.included}</b> people would come in, <b className="tabular">{result.excluded}</b> left out by the type filter
            {result.truncated && " - stopped at the test limit"}. Nothing was saved.
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(result.byType).map(([t, n]) => (
              <span key={t} className={cn("rounded border px-1.5 py-0.5", f.typeValues.length && !f.typeValues.includes(t === "(empty)" ? "" : t) && "opacity-50 line-through")}>{t}: {n}</span>
            ))}
          </div>
          <div className="max-h-96 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card"><tr className="border-b text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium" /><th className="px-2 text-left font-medium">Level</th>
                <th className="px-2 text-left font-medium">user_name</th><th className="px-2 text-left font-medium">Name</th>
                <th className="px-2 text-left font-medium">Designation</th><th className="px-2 text-left font-medium">Manager</th>
                <th className="px-2 text-left font-medium">E-mail</th><th className="px-2 text-left font-medium">Type</th>
              </tr></thead>
              <tbody>
                {result.sample.map((p) => (
                  <tr key={p.userName + p.depth} className={cn("border-b last:border-0", !p.included && "text-muted-foreground")}>
                    <td className="px-2 py-1">{p.included ? <Check className="size-3.5 text-status-meets-fg dark:text-foreground" /> : <X className="size-3.5" />}</td>
                    <td className="px-2 tabular">{p.depth >= 0 ? p.depth : "–"}</td>
                    <td className="px-2 font-mono">{p.userName}</td><td className="px-2">{p.name}</td><td className="px-2">{p.title}</td>
                    <td className="px-2">{p.manager}</td><td className="px-2">{p.email}</td><td className="px-2">{p.userType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function PhotoForm({ initial, placeholders, preview: initialPreview, sampleName }: { initial: string; placeholders: string[]; preview: string | null; sampleName: string | null }) {
  const [t, setT] = useState(initial);
  const [preview, setPreview] = useState(initialPreview);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3">
      <Input value={t} onChange={(e) => setT(e.target.value)} placeholder="https://photos.avro.com/{user_name}.jpg" />
      <p className="text-xs text-muted-foreground">Placeholders: {placeholders.map((p) => <code key={p} className="mr-1 rounded bg-muted px-1">{`{${p}}`}</code>)}. Empty = initials.</p>
      <Button className="justify-self-start" size="sm" disabled={pending} onClick={() => start(async () => {
        const r = await saveProfileSettings({ photoUrlTemplate: t });
        if (r.ok) { setPreview(r.preview); toast.success("Saved"); } else toast.error(r.error);
      })}>{pending && <Loader2 className="animate-spin" />}Save</Button>
      {preview && (
        <div className="flex items-center gap-3 rounded-md border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="size-10 rounded-full bg-muted object-cover" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }} />
          <div className="min-w-0 text-xs"><div className="font-medium">{sampleName}</div><div className="truncate text-muted-foreground">{preview}</div></div>
        </div>
      )}
    </div>
  );
}
