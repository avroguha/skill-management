"use client";
// Step 1 of single sign-on: the identity provider, and the values to set on its side.
// The values panel follows the form as it is typed, so what the identity team is given is
// exactly what will be saved. The provider ID is internal ("corporate") and not asked for.
import { useState, useTransition } from "react";
import { Trash2, Loader2, ExternalLink, Copy, Check, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDelete } from "@/components/admin-crud";
import { Section } from "@/components/kpi";
import { registerSaml, deleteSaml } from "@/app/actions/admin";
import { DEFAULT_PROVIDER_ID, ENTITY_ID_PATTERN, defaultSpEntityId, spMetadataUrl } from "@/lib/saml";

export interface SavedProvider {
  providerId: string; domain: string; idp: string; spEntityId: string; emailAttr: string; nameAttr: string;
}

function CopyValue({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-start gap-1">
        <code className="min-w-0 flex-1 rounded bg-muted px-2 py-1.5 font-mono text-xs break-all">{value}</code>
        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Copy ${label}`}
          onClick={async () => {
            try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
            catch { toast.error("Copy failed: select the text and copy it."); }
          }}>
          {copied ? <Check className="text-status-meets-fg dark:text-foreground" /> : <Copy />}
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SsoSetup({ base, providers }: { base: string; providers: SavedProvider[] }) {
  const saved = providers.find((p) => p.providerId === DEFAULT_PROVIDER_ID) ?? providers[0] ?? null;
  const providerId = saved?.providerId ?? DEFAULT_PROVIDER_ID;
  const [f, setF] = useState({
    spEntityId: saved?.spEntityId ?? defaultSpEntityId(base), domain: saved?.domain ?? "",
    metadata: "", entityId: "", ssoUrl: "", cert: "", emailAttr: saved?.emailAttr ?? "", nameAttr: saved?.nameAttr ?? "",
  });
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const entity = f.spEntityId.trim() || defaultSpEntityId(base);
  const entityOk = ENTITY_ID_PATTERN.test(entity);
  const acs = `${base}/api/auth/sso/saml2/sp/acs/${providerId}`;
  const changedEntity = !!saved && entity !== saved.spEntityId;
  const plainHttp = /^http:\/\//i.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(base);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title={saved ? "1. Identity provider" : "1. Add the identity provider"}>
        <div className="grid gap-5">
          {providers.length > 0 && (
            <ul className="grid gap-2">
              {providers.map((p) => (
                <li key={p.providerId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.idp}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.domain} · Entity ID {p.spEntityId}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={spMetadataUrl(base, p.providerId)} target="_blank" rel="noreferrer"><ExternalLink />Metadata</a>
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${p.idp}`} onClick={() => setRemoving(p.providerId)}><Trash2 className="size-3.5" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form className="grid gap-3" onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await registerSaml({ ...f, providerId, spEntityId: entity });
              if (r.ok) { toast.success(r.message ?? "Saved"); setF((x) => ({ ...x, metadata: "", entityId: "", ssoUrl: "", cert: "" })); } else toast.error(r.error);
            });
          }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="spe">Entity ID (Entra: Identifier)</Label>
                <Input id="spe" value={f.spEntityId} onChange={set("spEntityId")} placeholder={defaultSpEntityId(base)} aria-invalid={!entityOk} />
                <p className="text-xs text-muted-foreground">This app&apos;s name at the identity provider. Usually its address; any https:// or urn: value works if it is the same on both sides.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dom">E-mail domain</Label>
                <Input id="dom" value={f.domain} onChange={set("domain")} placeholder="avro.com" />
                <p className="text-xs text-muted-foreground">The domain people sign in with.</p>
              </div>
            </div>
            <Tabs defaultValue="metadata">
              <TabsList><TabsTrigger value="metadata">Metadata XML</TabsTrigger><TabsTrigger value="manual">Enter by hand</TabsTrigger></TabsList>
              <TabsContent value="metadata" className="grid gap-1.5 pt-2">
                <Label htmlFor="md">Identity provider metadata</Label>
                <Textarea id="md" rows={6} className="max-h-64 font-mono text-xs" value={f.metadata} onChange={set("metadata")} placeholder="<EntityDescriptor …>" />
                <p className="text-xs text-muted-foreground">
                  Entra ID: download <b>Federation Metadata XML</b> from the app&apos;s Single sign-on page and paste it here.
                  {saved && " Leave it empty to keep the metadata already saved."}
                </p>
              </TabsContent>
              <TabsContent value="manual" className="grid gap-3 pt-2">
                <div className="grid gap-1.5"><Label htmlFor="eid">Identity provider entity ID (Entra: Microsoft Entra Identifier)</Label><Input id="eid" value={f.entityId} onChange={set("entityId")} /></div>
                <div className="grid gap-1.5"><Label htmlFor="url">Sign-in URL (Entra: Login URL)</Label><Input id="url" value={f.ssoUrl} onChange={set("ssoUrl")} placeholder="https://login.microsoftonline.com/<tenant>/saml2" /></div>
                <div className="grid gap-1.5"><Label htmlFor="cert">Signing certificate (PEM or Base64)</Label><Textarea id="cert" rows={4} className="font-mono text-xs" value={f.cert} onChange={set("cert")} /></div>
              </TabsContent>
            </Tabs>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label htmlFor="ea">E-mail attribute (optional)</Label><Input id="ea" value={f.emailAttr} onChange={set("emailAttr")} placeholder="email" /></div>
              <div className="grid gap-1.5"><Label htmlFor="na">Name attribute (optional)</Label><Input id="na" value={f.nameAttr} onChange={set("nameAttr")} placeholder="displayName" /></div>
            </div>
            <Button type="submit" className="justify-self-start" disabled={pending || !entityOk}>{pending && <Loader2 className="animate-spin" />}{saved ? "Save changes" : "Save provider"}</Button>
          </form>
        </div>
      </Section>

      <Section title="Set these at the identity provider" description="Entra ID: Enterprise application › Single sign-on › SAML › Basic SAML Configuration">
        <div className="grid gap-4 text-sm">
          <CopyValue label="Identifier (Entity ID)" value={entityOk ? entity : "–"}
            hint={changedEntity ? "Not saved yet. Save, then set the same value in Entra." : undefined} />
          <CopyValue label="Reply URL (Assertion Consumer Service URL)" value={acs} />
          <CopyValue label="Sign on URL (optional)" value={`${base}/login`} />
          {plainHttp && (
            <p className="flex gap-2 rounded-md border border-status-minor/60 bg-status-minor/15 px-2.5 py-2 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              Entra ID accepts only https:// Reply URLs (localhost excepted). Set APP_URL to the https address people use.
            </p>
          )}
          <div className="grid gap-1 text-xs text-muted-foreground">
            <div><b className="font-medium text-foreground">Attributes &amp; Claims:</b> Unique User Identifier (Name ID) = user.mail, format Email address. Other claims (e-mail, display name, user name) are listed by the test sign-in below.</div>
            <div><b className="font-medium text-foreground">SAML Certificates:</b> sign the assertion (or response and assertion), SHA-256. Then download <b>Federation Metadata XML</b> and paste it on the left.</div>
            {saved && <div>Service-provider metadata, for identity providers that import it: <a className="text-primary hover:underline" href={spMetadataUrl(base, providerId)} target="_blank" rel="noreferrer">open</a>.</div>}
            <div>APP_URL is <code className="font-mono">{base}</code>: it must be the address people use.</div>
          </div>
        </div>
      </Section>

      {removing && <ConfirmDelete what="this single sign-on provider" onConfirm={() => deleteSaml(removing)} onClose={() => setRemoving(null)} />}
    </div>
  );
}
