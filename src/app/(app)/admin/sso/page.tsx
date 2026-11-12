import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { appUrl } from "@/lib/auth";
import { readSsoSettings } from "@/lib/sso-gate";
import { SsoSetup, type SavedProvider } from "./client";
import { SsoActivate } from "./activate";

export const metadata = { title: "Single sign-on · Admin" };

export default async function SsoPage() {
  const db = await getDb();
  const [providers, settings] = await Promise.all([db.select().from(schema.ssoProvider), readSsoSettings(db)]);
  const base = appUrl();
  const saved: SavedProvider[] = providers.map((p) => {
    let cfg: { idpMetadata?: { entityID?: string; metadata?: string }; mapping?: { email?: string; name?: string } } = {};
    try { cfg = JSON.parse(p.samlConfig ?? "{}"); } catch { /* shown as unknown */ }
    const fromXml = cfg.idpMetadata?.metadata ? /entityID="([^"]+)"/.exec(cfg.idpMetadata.metadata)?.[1] : undefined;
    return {
      providerId: p.providerId, domain: p.domain, spEntityId: p.issuer,
      idp: cfg.idpMetadata?.entityID || fromXml || "Identity provider",
      emailAttr: cfg.mapping?.email && cfg.mapping.email !== "email" ? cfg.mapping.email : "",
      nameAttr: cfg.mapping?.name && cfg.mapping.name !== "displayName" ? cfg.mapping.name : "",
    };
  });
  return (
    <>
      <PageHeader title="Single sign-on (SAML 2.0)"
        description="1. Add the identity provider and set this app's values there. 2. Test sign-in: see what it returns. 3. Choose which value identifies the person. 4. Activate. Until then the sign-in page shows only the local login, and every SSO attempt is captured and refused." />
      <div className="grid gap-5">
        <SsoSetup base={base} providers={saved} />
        <Section title="2-4. Test, map and activate">
          <SsoActivate providers={providers.map((p) => p.providerId)} initial={settings} />
        </Section>
      </div>
    </>
  );
}
