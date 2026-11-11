"use client";
import { useState, useTransition } from "react";
import { Trash2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDelete } from "@/components/admin-crud";
import { registerSaml, deleteSaml } from "@/app/actions/admin";

export function SsoAdmin({ base, providers }: { base: string; providers: { providerId: string; domain: string; idp: string }[] }) {
  const [f, setF] = useState({ providerId: "corporate", domain: "", metadata: "", entityId: "", ssoUrl: "", cert: "", emailAttr: "", nameAttr: "" });
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid gap-5">
      {providers.length > 0 && (
        <ul className="grid gap-2">
          {providers.map((p) => (
            <li key={p.providerId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <div className="font-medium">{p.providerId} <span className="text-xs font-normal text-muted-foreground">· {p.domain}</span></div>
                <div className="truncate text-xs text-muted-foreground">Identity provider: {p.idp}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" asChild>
                  <a href={`${base}/api/auth/sso/saml2/sp/metadata?providerId=${p.providerId}`} target="_blank" rel="noreferrer"><ExternalLink />Metadata</a>
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Remove ${p.providerId}`} onClick={() => setRemoving(p.providerId)}><Trash2 className="size-3.5" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="grid gap-3" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await registerSaml(f);
          if (r.ok) toast.success(r.message ?? "Saved"); else toast.error(r.error);
        });
      }}>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5"><Label htmlFor="pid">Provider ID</Label><Input id="pid" value={f.providerId} onChange={set("providerId")} /></div>
          <div className="grid gap-1.5"><Label htmlFor="dom">E-mail domain</Label><Input id="dom" value={f.domain} onChange={set("domain")} placeholder="avro.com" /></div>
        </div>
        <Tabs defaultValue="metadata">
          <TabsList><TabsTrigger value="metadata">Metadata XML</TabsTrigger><TabsTrigger value="manual">Enter by hand</TabsTrigger></TabsList>
          <TabsContent value="metadata" className="grid gap-1.5 pt-2">
            <Label htmlFor="md">Identity provider metadata</Label>
            <Textarea id="md" rows={6} className="font-mono text-xs" value={f.metadata} onChange={set("metadata")} placeholder="<EntityDescriptor …>" />
            <p className="text-xs text-muted-foreground">Download it from the identity provider (Entra ID: Federation Metadata XML) and paste it here.</p>
          </TabsContent>
          <TabsContent value="manual" className="grid gap-3 pt-2">
            <div className="grid gap-1.5"><Label htmlFor="eid">Identity provider entity ID</Label><Input id="eid" value={f.entityId} onChange={set("entityId")} /></div>
            <div className="grid gap-1.5"><Label htmlFor="url">Sign-in URL</Label><Input id="url" value={f.ssoUrl} onChange={set("ssoUrl")} placeholder="https://login.avro.com/saml2" /></div>
            <div className="grid gap-1.5"><Label htmlFor="cert">Signing certificate (PEM)</Label><Textarea id="cert" rows={4} className="font-mono text-xs" value={f.cert} onChange={set("cert")} /></div>
          </TabsContent>
        </Tabs>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5"><Label htmlFor="ea">E-mail attribute (optional)</Label><Input id="ea" value={f.emailAttr} onChange={set("emailAttr")} placeholder="email" /></div>
          <div className="grid gap-1.5"><Label htmlFor="na">Name attribute (optional)</Label><Input id="na" value={f.nameAttr} onChange={set("nameAttr")} placeholder="displayName" /></div>
        </div>
        <Button type="submit" className="justify-self-start" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save provider</Button>
      </form>
      {removing && <ConfirmDelete what={`single sign-on “${removing}”`} onConfirm={() => deleteSaml(removing)} onClose={() => setRemoving(null)} />}
    </div>
  );
}
