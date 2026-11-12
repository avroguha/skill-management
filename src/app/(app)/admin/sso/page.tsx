import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { appUrl } from "@/lib/auth";
import { readSsoSettings } from "@/lib/sso-gate";
import { SsoAdmin } from "./client";
import { SsoActivate } from "./activate";

export const metadata = { title: "Single sign-on · Admin" };

export default async function SsoPage() {
  const db = await getDb();
  const [providers, settings] = await Promise.all([db.select().from(schema.ssoProvider), readSsoSettings(db)]);
  const base = appUrl();
  return (
    <>
      <PageHeader title="Single sign-on (SAML 2.0)"
        description="1. Add the identity provider. 2. Test sign-in: see what it returns. 3. Choose which value identifies the person. 4. Activate. Until then the sign-in page shows only the local login, and every SSO attempt is captured and refused." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title={providers.length ? "1. Identity provider" : "1. Add the identity provider"}>
          <SsoAdmin base={base} providers={providers.map((p) => {
            let entity = "";
            try { entity = JSON.parse(p.samlConfig ?? "{}")?.idpMetadata?.entityID ?? ""; } catch { /* metadata-based */ }
            return { providerId: p.providerId, domain: p.domain, idp: entity || "from metadata" };
          })} />
        </Section>
        <Section title="Give these to the identity team" description="Service-provider details, per provider ID. Replace <id> with the provider ID you choose.">
          <dl className="grid gap-3 text-sm">
            {[
              ["Entity ID (Audience)", `${base}/api/auth/sso/saml2/sp/metadata?providerId=<id>`],
              ["Assertion Consumer Service (ACS) URL, HTTP-POST", `${base}/api/auth/sso/saml2/sp/acs/<id>`],
              ["Service-provider metadata", `${base}/api/auth/sso/saml2/sp/metadata?providerId=<id>`],
              ["Name ID format", "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"],
              ["Attributes", "e-mail (required for new accounts) and display name; anything else is shown in the test"],
              ["Signing", "Assertions must be signed (SHA-256)"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 rounded bg-muted px-2 py-1 font-mono text-xs break-all">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            APP_URL is <code className="font-mono">{base}</code>. It must be the address people use, or the identity provider will refuse the ACS URL.
          </p>
        </Section>
        <Section className="xl:col-span-2" title="2-4. Test, map and activate">
          <SsoActivate providers={providers.map((p) => p.providerId)} initial={settings} />
        </Section>
      </div>
    </>
  );
}
