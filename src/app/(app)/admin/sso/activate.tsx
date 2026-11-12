"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { ExternalLink, Loader2, RefreshCw, Power, PowerOff, Search, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ssoState, previewMatch, saveSso } from "@/app/actions/sso";
import type { SsoAttempt, SsoSettings } from "@/lib/sso-gate";
import { cn } from "@/lib/utils";

const OUTCOME: Record<SsoAttempt["outcome"], string> = {
  test: "bg-accent text-accent-foreground",
  allowed: "bg-status-meets text-status-meets-fg",
  refused: "bg-status-critical text-status-critical-fg",
};

export function SsoActivate({ providers, initial }: { providers: string[]; initial: SsoSettings }) {
  const [settings, setSettings] = useState(initial);
  const [attempts, setAttempts] = useState<SsoAttempt[]>([]);
  const [picked, setProviderId] = useState(providers[0] ?? "");
  // providers can arrive after the first render (added on this page): fall back to the first
  const providerId = providers.includes(picked) ? picked : (providers[0] ?? "");
  const [preview, setPreview] = useState<{ value: string; person: string | null } | null>(null);
  const [pending, start] = useTransition();

  const refresh = useCallback(async () => {
    const r = await ssoState();
    if (r.ok) { setAttempts(r.attempts); setSettings((s) => ({ ...s, active: r.settings.active })); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === "sso-test-done") void refresh(); };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [refresh]);

  const last = attempts[0];
  const attrNames = [...new Set(["nameID", ...(last ? Object.keys(last.attributes) : []), settings.matchAttribute])];
  const valueOf = (a: string) => (a === "nameID" ? last?.nameId : last?.attributes[a]?.join(", ")) ?? "";

  if (!providers.length) return <p className="text-sm text-muted-foreground">Add the identity provider first.</p>;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("rounded px-2 py-0.5 text-xs font-medium", settings.active ? "bg-status-meets text-status-meets-fg" : "bg-muted text-muted-foreground")}>
          {settings.active ? "Active: shown on the sign-in page" : "Not active: hidden from the sign-in page"}
        </span>
        {providers.length > 1 && (
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{providers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" disabled={settings.active}
          title={settings.active ? "Deactivate first: while active, a test signs you in for real" : undefined}
          onClick={() => window.open(`/sso-test?provider=${encodeURIComponent(providerId)}`, "sso-test", "width=560,height=720")}>
          <ExternalLink />Test sign-in
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}><RefreshCw />Refresh</Button>
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-medium">What the identity provider returned</h3>
        {last ? (
          <div className="rounded-md border">
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
              <span className={cn("rounded px-1.5 py-0.5 font-medium", OUTCOME[last.outcome])}>{last.outcome}</span>
              <span className="text-muted-foreground">{new Date(last.at).toLocaleString("en-GB")} · {last.providerId}</span>
              <span>{last.reason}</span>
            </div>
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b"><td className="w-1/3 px-3 py-1.5 font-mono">nameID</td><td className="px-3 py-1.5 font-mono break-all">{last.nameId}</td></tr>
                {Object.entries(last.attributes).map(([k, v]) => (
                  <tr key={k} className="border-b last:border-0"><td className="px-3 py-1.5 font-mono break-all">{k}</td><td className="px-3 py-1.5 font-mono break-all">{v.join(", ")}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted-foreground">Nothing yet. Click Test sign-in and sign in at the identity provider in the pop-up.</p>}
        {attempts.length > 1 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Earlier attempts ({attempts.length - 1})</summary>
            <ul className="mt-1 grid gap-0.5">{attempts.slice(1).map((a, i) => <li key={i}>{new Date(a.at).toLocaleTimeString("en-GB")} · {a.outcome} · {a.nameId} · {a.reason}</li>)}</ul>
          </details>
        )}
      </div>

      <div className="grid gap-3">
        <h3 className="text-sm font-medium">Identify the person</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label>This value from the sign-in</Label>
            <Select value={settings.matchAttribute} onValueChange={(v) => { setSettings({ ...settings, matchAttribute: v }); setPreview(null); }}>
              <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>{attrNames.map((a) => <SelectItem key={a} value={a}><span className="font-mono text-xs">{a}</span>{last && <span className="ml-2 truncate text-xs text-muted-foreground">{valueOf(a)}</span>}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>must equal the person&apos;s</Label>
            <Select value={settings.matchField} onValueChange={(v) => { setSettings({ ...settings, matchField: v as SsoSettings["matchField"] }); setPreview(null); }}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">e-mail</SelectItem>
                <SelectItem value="user_name">user_name (login name)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" disabled={!last || pending} onClick={() => start(async () => {
            const r = await previewMatch({ matchAttribute: settings.matchAttribute, matchField: settings.matchField });
            if (r.ok) setPreview(r); else toast.error(r.error);
          })}><Search />Check</Button>
        </div>
        {preview && (
          <p className={cn("text-sm", preview.person ? "" : "text-destructive")}>
            “{preview.value || "(empty)"}” {preview.person ? <>is <b>{preview.person}</b>. That person can sign in once SSO is active.</> : "matches no active person. Choose another value, or sync the people first."}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Only active people (synced from ServiceNow, or added by an administrator) can sign in with single sign-on. Service accounts left out by the sync are refused.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={() => start(async () => {
            const r = await saveSso({ ...settings, active: settings.active });
            if (r.ok) toast.success(r.message); else toast.error(r.error);
          })}><Save />Save mapping</Button>
          {settings.active ? (
            <Button variant="destructive" disabled={pending} onClick={() => start(async () => {
              const r = await saveSso({ ...settings, active: false });
              if (r.ok) { setSettings({ ...settings, active: false }); toast.success("Single sign-on deactivated."); } else toast.error(r.error);
            })}><PowerOff />Deactivate</Button>
          ) : (
            <Button disabled={pending || !last} onClick={() => start(async () => {
              const r = await saveSso({ ...settings, active: true });
              if (r.ok) { setSettings({ ...settings, active: true }); toast.success(r.message); } else toast.error(r.error);
            })}>{pending ? <Loader2 className="animate-spin" /> : <Power />}Activate single sign-on</Button>
          )}
        </div>
      </div>
    </div>
  );
}
