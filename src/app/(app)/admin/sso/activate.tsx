"use client";
// Steps 2-5 of single sign-on: test, map what comes back (to the person and to the account),
// decide who may sign in (everyone in the organisation, or members of AD / ServiceNow
// groups), activate. The same panel, without the access rules and activation, is shown in
// the test pop-up, so the mapping can be done where the answer is seen.
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink, Loader2, RefreshCw, Power, PowerOff, Search, Save, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ssoState, previewMatch, saveSso, type GroupOption, type Preview } from "@/app/actions/sso";
import type { SsoAttempt, SsoSettings } from "@/lib/sso-gate";
import { cn } from "@/lib/utils";

const OUTCOME: Record<SsoAttempt["outcome"], string> = {
  test: "bg-accent text-accent-foreground",
  allowed: "bg-status-meets text-status-meets-fg",
  refused: "bg-status-critical text-status-critical-fg",
};
const KEEP = "__keep__";

export function SsoActivate({ providers, initial, mode = "page" }: { providers: string[]; initial: SsoSettings; mode?: "page" | "popup" }) {
  const popup = mode === "popup";
  const [settings, setSettings] = useState(initial);
  const [attempts, setAttempts] = useState<SsoAttempt[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [picked, setProviderId] = useState(providers[0] ?? "");
  const providerId = providers.includes(picked) ? picked : (providers[0] ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();

  const refresh = useCallback(async () => {
    const r = await ssoState();
    if (r.ok) { setAttempts(r.attempts); setGroups(r.groups); setSettings((s) => ({ ...s, active: r.settings.active })); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "sso-test-done") void refresh();
      if (e.data?.type === "sso-mapping-saved") { void refresh(); if (e.data.settings) setSettings((s) => ({ ...e.data.settings, active: s.active })); }
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [refresh]);

  const last = attempts[0];
  const attrNames = useMemo(() => [...new Set(["nameID", ...(last ? Object.keys(last.attributes) : []), settings.matchAttribute,
    ...[settings.profile.name, settings.profile.email, settings.profile.userName, settings.access.claimAttribute].filter(Boolean)])], [last, settings]);
  const valueOf = (a: string) => (a === "nameID" ? last?.nameId : last?.attributes[a]?.join(", ")) ?? "";
  const change = (patch: Partial<SsoSettings>) => { setSettings((s) => ({ ...s, ...patch })); setPreview(null); };
  const payload = () => ({ matchAttribute: settings.matchAttribute, matchField: settings.matchField, profile: settings.profile, access: settings.access });

  const save = (active: boolean, done?: () => void) => start(async () => {
    const r = await saveSso({ ...payload(), active });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message);
    setSettings((s) => ({ ...s, active }));
    window.opener?.postMessage({ type: "sso-mapping-saved", settings: { ...settings, active } }, window.location.origin);
    done?.();
  });

  const AttrSelect = ({ value, onChange, allowKeep, label }: { value: string; onChange: (v: string) => void; allowKeep?: boolean; label: string }) => (
    <Select value={value || (allowKeep ? KEEP : "")} onValueChange={(v) => onChange(v === KEEP ? "" : v)}>
      <SelectTrigger className="w-full min-w-0 sm:w-80" aria-label={label}><SelectValue placeholder="Choose a value" /></SelectTrigger>
      <SelectContent>
        {allowKeep && <SelectItem value={KEEP}><span className="text-muted-foreground">Do not change</span></SelectItem>}
        {attrNames.map((a) => (
          <SelectItem key={a} value={a}>
            <span className="max-w-56 truncate font-mono text-xs">{a}</span>
            {last && <span className="ml-2 max-w-48 truncate text-xs text-muted-foreground">{valueOf(a)}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!providers.length) return <p className="text-sm text-muted-foreground">Add the identity provider first.</p>;
  return (
    <div className="grid gap-6">
      {!popup && (
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
            onClick={() => window.open(`/sso-test?provider=${encodeURIComponent(providerId)}`, "sso-test", "width=760,height=860")}>
            <ExternalLink />Test SSO
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}><RefreshCw />Refresh</Button>
        </div>
      )}

      <div className="grid gap-2">
        <h3 className="text-sm font-medium">What the identity provider returned</h3>
        {last ? (
          <div className="overflow-x-auto rounded-md border">
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
        ) : <p className="text-sm text-muted-foreground">Nothing yet. Click Test SSO and sign in at the identity provider in the pop-up.</p>}
        {!popup && attempts.length > 1 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Earlier attempts ({attempts.length - 1})</summary>
            <ul className="mt-1 grid gap-0.5">{attempts.slice(1).map((a, i) => <li key={i}>{new Date(a.at).toLocaleTimeString("en-GB")} · {a.outcome} · {a.nameId} · {a.reason}</li>)}</ul>
          </details>
        )}
      </div>

      <div className="grid gap-3">
        <h3 className="text-sm font-medium">Map the sign-in to the person and the account</h3>
        <div className="grid gap-3 rounded-md border p-3">
          <div className="grid gap-1.5">
            <Label>Identifies the person: this value</Label>
            <div className="flex flex-wrap items-center gap-2">
              <AttrSelect label="Value that identifies the person" value={settings.matchAttribute} onChange={(v) => change({ matchAttribute: v })} />
              <span className="text-sm text-muted-foreground">must equal the person&apos;s</span>
              <Select value={settings.matchField} onValueChange={(v) => change({ matchField: v as SsoSettings["matchField"] })}>
                <SelectTrigger className="w-56" aria-label="Person field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">e-mail</SelectItem>
                  <SelectItem value="user_name">user_name (login name)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center">
            <Label>Account name</Label>
            <AttrSelect label="Account name" allowKeep value={settings.profile.name} onChange={(v) => change({ profile: { ...settings.profile, name: v } })} />
            <Label>Account e-mail</Label>
            <AttrSelect label="Account e-mail" allowKeep value={settings.profile.email} onChange={(v) => change({ profile: { ...settings.profile, email: v } })} />
            <Label>Login name</Label>
            <AttrSelect label="Login name" allowKeep value={settings.profile.userName} onChange={(v) => change({ profile: { ...settings.profile, userName: v } })} />
          </div>
          <p className="text-xs text-muted-foreground">The account fields are filled when someone first signs in and refreshed on every sign-in. A value another account already uses is left alone. The person&apos;s own record (designation, manager, unit) always comes from ServiceNow.</p>
        </div>
      </div>

      {!popup && <AccessRules settings={settings} groups={groups} last={last} attrSelect={(v, on) => <AttrSelect label="Groups attribute" value={v} onChange={on} />} onChange={(access) => change({ access })} />}

      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!last || pending} onClick={() => start(async () => {
            const r = await previewMatch(payload());
            if (r.ok) setPreview(r); else toast.error(r.error);
          })}><Search />Check with the last test</Button>
          <Button variant={popup ? "default" : "outline"} disabled={pending} onClick={() => save(settings.active)}><Save />Save mapping</Button>
          {!popup && (settings.active ? (
            <Button variant="destructive" disabled={pending} onClick={() => save(false)}><PowerOff />Deactivate</Button>
          ) : (
            <Button disabled={pending || !last} onClick={() => save(true)}>{pending ? <Loader2 className="animate-spin" /> : <Power />}Activate single sign-on</Button>
          ))}
          {popup && <Button variant="ghost" onClick={() => window.close()}>Close</Button>}
        </div>
        {preview && (
          <div className="grid gap-1 rounded-md border p-3 text-sm">
            <p className={preview.person ? "" : "text-destructive"}>
              “{preview.value || "(empty)"}” {preview.person ? <>is <b>{preview.person}</b>.</> : "matches no active person. Choose another value, or sync the people first."}
            </p>
            {preview.access && (
              <p className={preview.access.ok ? "" : "text-destructive"}>{preview.access.ok ? "Allowed to sign in" : "Would be refused"}: {preview.access.reason}.</p>
            )}
            {Object.keys(preview.profile).length > 0 && (
              <p className="text-muted-foreground">Account: {[preview.profile.name, preview.profile.email, preview.profile.userName && `login ${preview.profile.userName}`].filter(Boolean).join(" · ")}</p>
            )}
          </div>
        )}
        {!popup && <p className="text-xs text-muted-foreground">Only active people (synced from ServiceNow, or added by an administrator) can sign in with single sign-on; service accounts left out by the sync are refused.</p>}
      </div>
    </div>
  );
}

function AccessRules({ settings, groups, last, attrSelect, onChange }: {
  settings: SsoSettings; groups: GroupOption[]; last: SsoAttempt | undefined;
  attrSelect: (value: string, on: (v: string) => void) => React.ReactNode; onChange: (a: SsoSettings["access"]) => void;
}) {
  const a = settings.access;
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const shown = groups.filter((g) => !q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 200);
  const chosen = groups.filter((g) => a.snGroups.includes(g.id));
  // the groups attribute: the one chosen, or one the identity provider sent that looks like groups
  const guess = last ? Object.keys(last.attributes).find((k) => /groups?$/i.test(k)) ?? "" : "";
  const claimAttr = a.claimAttribute || guess;
  const sentGroups = (last && claimAttr ? last.attributes[claimAttr] ?? [] : []).filter((v) => !a.claimValues.includes(v));
  const addValue = (v: string) => { const t = v.trim(); if (t && !a.claimValues.includes(t)) onChange({ ...a, claimAttribute: claimAttr, claimValues: [...a.claimValues, t] }); };

  return (
    <div className="grid gap-3">
      <h3 className="text-sm font-medium">Who may sign in</h3>
      <div className="grid gap-2" role="radiogroup" aria-label="Who may sign in">
        {([["people", "Everyone in the organisation", "Every active person synced from ServiceNow (or added by an administrator)."],
          ["groups", "Only members of chosen groups", "A ServiceNow group (imported by the sync) or an AD group (sent by the identity provider in the sign-in). Administrators are always let in."]] as const).map(([v, t, d]) => (
          <button key={v} type="button" role="radio" aria-checked={a.mode === v} onClick={() => onChange({ ...a, mode: v })}
            className={cn("rounded-md border p-2.5 text-left", a.mode === v ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent")}>
            <div className="text-sm font-medium">{t}</div>
            <div className="text-xs text-muted-foreground">{d}</div>
          </button>
        ))}
      </div>
      {a.mode === "groups" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-2 rounded-md border p-3">
            <div className="text-sm font-medium">ServiceNow groups <span className="font-normal text-muted-foreground">({a.snGroups.length} chosen)</span></div>
            {groups.length ? (
              <>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a group…" className="h-8" aria-label="Find a ServiceNow group" />
                {chosen.length > 0 && (
                  <div className="flex flex-wrap gap-1">{chosen.map((g) => (
                    <span key={g.id} className="inline-flex items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5 text-xs">{g.name}
                      <button type="button" aria-label={`Remove ${g.name}`} onClick={() => onChange({ ...a, snGroups: a.snGroups.filter((x) => x !== g.id) })}><X className="size-3" /></button>
                    </span>))}
                  </div>
                )}
                <ul className="grid max-h-60 gap-1 overflow-y-auto pr-1">
                  {shown.map((g) => (
                    <li key={g.id}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox checked={a.snGroups.includes(g.id)} onCheckedChange={(on) => onChange({ ...a, snGroups: on ? [...a.snGroups, g.id] : a.snGroups.filter((x) => x !== g.id) })} />
                        <span className={cn("min-w-0 flex-1 truncate", !g.active && "text-muted-foreground line-through")}>{g.name}</span>
                        <span className="text-xs text-muted-foreground tabular">{g.members}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="text-xs text-muted-foreground">No groups imported yet. Turn on Import groups in Admin › ServiceNow and sync.</p>}
          </div>
          <div className="grid content-start gap-2 rounded-md border p-3">
            <div className="text-sm font-medium">AD groups <span className="font-normal text-muted-foreground">(from the sign-in)</span></div>
            <div className="grid gap-1.5">
              <Label>The attribute that lists the person&apos;s groups</Label>
              {attrSelect(claimAttr, (v) => onChange({ ...a, claimAttribute: v }))}
            </div>
            <p className="text-xs text-muted-foreground">Entra ID: add a groups claim (Attributes &amp; Claims › Add a group claim). It sends group object IDs, or names when it is set to sAMAccountName for groups synced from on-premises AD.</p>
            <div className="grid gap-1.5">
              <Label htmlFor="ad-val">Allowed groups</Label>
              <div className="flex gap-2">
                <Input id="ad-val" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Group object ID or name"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addValue(draft); setDraft(""); } }} />
                <Button type="button" variant="outline" size="icon" aria-label="Add the group" onClick={() => { addValue(draft); setDraft(""); }}><Plus /></Button>
              </div>
              {a.claimValues.length > 0 && (
                <div className="flex flex-wrap gap-1">{a.claimValues.map((v) => (
                  <span key={v} className="inline-flex max-w-full items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-xs"><span className="truncate">{v}</span>
                    <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange({ ...a, claimValues: a.claimValues.filter((x) => x !== v) })}><X className="size-3" /></button>
                  </span>))}
                </div>
              )}
              {sentGroups.length > 0 && (
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">The last test sign-in sent these; click one to allow it:</span>
                  <div className="flex flex-wrap gap-1">{sentGroups.slice(0, 30).map((v) => (
                    <button key={v} type="button" onClick={() => addValue(v)} className="max-w-full truncate rounded border px-1.5 py-0.5 font-mono text-xs hover:bg-accent">+ {v}</button>
                  ))}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {a.mode === "groups" && <p className="text-xs text-muted-foreground">Someone is let in if they are in ANY chosen ServiceNow group or AD group. Already signed-in people keep their session until it ends (at most 12 hours).</p>}
    </div>
  );
}

