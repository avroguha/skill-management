"use client";
// Step 1 of single sign-on: the identity provider, and the values to set on its side.
// The values panel follows the form as it is typed, so what the identity team is given is
// exactly what will be saved. The provider ID is internal ("corporate") and not asked for.
import { LocalTime } from "@/components/local-time";
import { CopyValue } from "@/components/copy-value";
import { useRef, useState, useTransition } from "react";
import { Trash2, Loader2, ExternalLink, TriangleAlert, Download, Upload, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabelInfo } from "@/components/info";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDelete } from "@/components/admin-crud";
import { Section } from "@/components/kpi";
import { cn } from "@/lib/utils";
import { registerSaml, deleteSaml } from "@/app/actions/admin";
import { inspectMetadata } from "@/app/actions/sso";
import { DEFAULT_PROVIDER_ID, ENTITY_ID_PATTERN, defaultSpEntityId, spMetadataUrl, spMetadataXml } from "@/lib/saml";
import type { IdpInfo } from "@/lib/saml-inspect";

export interface SavedProvider {
  providerId: string; domain: string; idp: string; spEntityId: string; emailAttr: string; nameAttr: string;
  /** the saved metadata's signing certificate that lasts longest */
  cert: { notAfter: string; daysLeft: number } | null;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/samlmetadata+xml" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CertLine({ notAfter, daysLeft }: { notAfter: string; daysLeft: number }) {
  const when = <LocalTime value={notAfter} options={{ dateStyle: "medium" }} />;
  return (
    <span className={daysLeft < 0 ? "text-destructive" : daysLeft < 30 ? "font-medium text-status-minor-fg dark:text-foreground" : ""}>
      {daysLeft < 0 ? <>expired {when}</> : <>expires {when} ({daysLeft} days)</>}
    </span>
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
  const [info, setInfo] = useState<IdpInfo | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const inspect = async (xml: string) => {
    if (!xml.trim()) { setInfo(null); return; }
    const r = await inspectMetadata(xml);
    if (r.ok) setInfo(r); else { setInfo(null); toast.error(r.error); }
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) { toast.error("That file is too big to be SAML metadata."); return; }
    const xml = await file.text();
    setFileName(file.name);
    setF((x) => ({ ...x, metadata: xml }));
    await inspect(xml);
  };
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
                    {p.cert && <div className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3" />Signing certificate <CertLine {...p.cert} /></div>}
                  </div>
                  <div className="flex shrink-0 gap-1">

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
              if (r.ok) { toast.success(r.message ?? "Saved"); setF((x) => ({ ...x, metadata: "", entityId: "", ssoUrl: "", cert: "" })); setInfo(null); setFileName(""); } else toast.error(r.error);
            });
          }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <LabelInfo htmlFor="spe" info="How the identity provider knows this app. Give the same value to the identity team (Entra: Identifier (Entity ID)).">Entity ID (Entra: Identifier)</LabelInfo>
                <Input id="spe" value={f.spEntityId} onChange={set("spEntityId")} placeholder={defaultSpEntityId(base)} aria-invalid={!entityOk} />
                <p className="text-xs text-muted-foreground">This app’s name at the identity provider. Usually its address; any https:// or urn: value works if it is the same on both sides.</p>
              </div>
              <div className="grid gap-1.5">
                <LabelInfo htmlFor="dom" info="The company e-mail domain: the sign-in page offers single sign-on to these addresses.">E-mail domain</LabelInfo>
                <Input id="dom" value={f.domain} onChange={set("domain")} placeholder="avro.com" />
                <p className="text-xs text-muted-foreground">The domain people sign in with.</p>
              </div>
            </div>
            <Tabs defaultValue="metadata">
              <TabsList><TabsTrigger value="metadata">Federation Metadata XML</TabsTrigger><TabsTrigger value="manual">Enter by hand</TabsTrigger></TabsList>
              <TabsContent value="metadata" className="grid gap-2 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={fileRef} type="file" accept=".xml,application/xml,text/xml,application/samlmetadata+xml" className="hidden"
                    onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} />
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><Upload />Upload the XML file</Button>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">{fileName || "or paste it below"}</span>
                </div>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); void readFile(e.dataTransfer.files?.[0]); }}>
                  <LabelInfo htmlFor="md" className="sr-only" info="The XML the identity provider publishes about itself (Entra: Federation Metadata XML), or its address.">Identity provider metadata</LabelInfo>
                  <Textarea id="md" rows={5} className="max-h-64 font-mono text-xs" value={f.metadata} onChange={set("metadata")}
                    onBlur={() => void inspect(f.metadata)} placeholder="<EntityDescriptor …> (or drop the file here)" />
                </div>
                {info && (
                  <div className={cn("grid gap-1 rounded-md border p-2.5 text-xs", info.problems.length ? "border-destructive/50" : "")}>
                    <div><span className="text-muted-foreground">Identity provider:</span> <span className="font-mono break-all">{info.entityId || "–"}</span></div>
                    <div><span className="text-muted-foreground">Sign-in URL:</span> <span className="font-mono break-all">{info.ssoUrl || "–"}</span></div>
                    {info.certs.map((c, i) => <div key={i}><span className="text-muted-foreground">Signing certificate:</span> <CertLine notAfter={c.notAfter} daysLeft={c.daysLeft} /></div>)}
                    {info.problems.map((p, i) => <div key={i} className="text-destructive">{p}</div>)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Entra ID: download <b>Federation Metadata XML</b> from the app’s Single sign-on page (SAML Certificates) and upload it here.
                  {saved && " Leave it empty to keep the metadata already saved."}
                </p>
              </TabsContent>
              <TabsContent value="manual" className="grid gap-3 pt-2">
                <div className="grid gap-1.5"><LabelInfo htmlFor="eid" info="The identity provider’s own identifier, from its metadata.">Identity provider entity ID (Entra: Microsoft Entra Identifier)</LabelInfo><Input id="eid" value={f.entityId} onChange={set("entityId")} /></div>
                <div className="grid gap-1.5"><LabelInfo htmlFor="url" info="Where people are sent to sign in, from the identity provider’s metadata.">Sign-in URL (Entra: Login URL)</LabelInfo><Input id="url" type="url" spellCheck={false} value={f.ssoUrl} onChange={set("ssoUrl")} placeholder="https://login.microsoftonline.com/<tenant>/saml2" /></div>
                <div className="grid gap-1.5"><LabelInfo htmlFor="cert" info="The certificate the identity provider signs sign-ins with. Sign-ins not signed with it are refused.">Signing certificate (PEM or Base64)</LabelInfo><Textarea id="cert" rows={4} className="font-mono text-xs" value={f.cert} onChange={set("cert")} /></div>
              </TabsContent>
            </Tabs>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><LabelInfo htmlFor="ea" info="The claim that carries the e-mail, if the identity provider does not send it as the NameID.">E-mail attribute (optional)</LabelInfo><Input id="ea" value={f.emailAttr} onChange={set("emailAttr")} placeholder="email" /></div>
              <div className="grid gap-1.5"><LabelInfo htmlFor="na" info="The claim that carries the display name.">Name attribute (optional)</LabelInfo><Input id="na" value={f.nameAttr} onChange={set("nameAttr")} placeholder="displayName" /></div>
            </div>
            <Button type="submit" className="justify-self-start" disabled={pending || !entityOk}>{pending && <Loader2 className="animate-spin" />}{saved ? "Save changes" : "Save provider"}</Button>
          </form>
        </div>
      </Section>

      <Section title="Set these at the identity provider" description="Entra ID: Enterprise application › Single sign-on › SAML › Basic SAML Configuration"
        actions={<Button size="sm" variant="outline" disabled={!entityOk} onClick={() => download(`skills-sp-metadata.xml`, spMetadataXml(entity, acs))}><Download />Download metadata</Button>}>
        <div className="grid gap-4 text-sm">
          <p className="text-xs text-muted-foreground">In Entra, <b>Upload metadata file</b> with the downloaded file fills in the Identifier and the Reply URL. Or copy them:</p>
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
            <div><b className="font-medium text-foreground">SAML Certificates:</b> sign the assertion (or response and assertion), SHA-256. Then download <b>Federation Metadata XML</b> and upload it on the left.</div>
            <div><b className="font-medium text-foreground">Groups claim</b> (only to let in members of AD groups): Attributes &amp; Claims › Add a group claim.</div>
            {saved && <div>For identity providers that import metadata from a URL: <a className="inline-flex items-center gap-0.5 text-primary hover:underline" href={spMetadataUrl(base, providerId)} target="_blank" rel="noreferrer">metadata URL<ExternalLink className="size-3" /></a>.</div>}
            <div>APP_URL is <code className="font-mono">{base}</code>: it must be the address people use.</div>
          </div>
        </div>
      </Section>

      {removing && <ConfirmDelete what="this single sign-on provider" onConfirm={() => deleteSaml(removing)} onClose={() => setRemoving(null)} />}
    </div>
  );
}
