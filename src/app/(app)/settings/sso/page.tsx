import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { appUrl } from "@/lib/auth";
import { readSsoSettings } from "@/lib/sso-gate";
import { inspectIdpMetadata } from "@/lib/saml-inspect";
import { SsoSetup, type SavedProvider } from "./client";
import { SsoActivate } from "./activate";

export const metadata = { title: "Single sign-on · Settings" };

export default async function SsoPage() {
  const db = await getDb("live");
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
      cert: cfg.idpMetadata?.metadata ? inspectIdpMetadata(cfg.idpMetadata.metadata).certs.sort((a, b) => b.daysLeft - a.daysLeft)[0] ?? null : null,
    };
  });
  return (
    <>
      <PageHeader title="Single sign-on (SAML 2.0)"
        description="1. Add the identity provider (upload its Federation Metadata XML) and give it this app's values (download the metadata). 2. Test SSO: see what it returns. 3. Map it to the person and the account. 4. Choose who may sign in. 5. Activate. Until then the sign-in page shows only the local login, and every SSO attempt is captured and refused." />
      <div className="grid gap-5">
        <SsoSetup base={base} providers={saved} />
        <Section title="2-5. Test, map, who may sign in, activate" info="Single sign-on stays off until a test sign-in finds an active person. Until then every attempt is captured here and refused, so nobody can sign in by mistake. The local admin account always keeps working.">
          <SsoActivate providers={providers.map((p) => p.providerId)} initial={settings} />
        </Section>
      </div>
    </>
  );
}
