import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { appUrl } from "@/lib/auth";
import { SsoAdmin } from "./client";

export const metadata = { title: "Single sign-on · Admin" };

export default async function SsoPage() {
  const db = await getDb();
  const providers = await db.select().from(schema.ssoProvider);
  const base = appUrl();
  return (
    <>
      <PageHeader title="Single sign-on (SAML 2.0)"
        description="People sign in with the company identity provider. Accounts are created on first sign-in and linked to the person with the same e-mail address. Once it works, make your SSO account an Administrator in Users & access, sign in with it, and disable the local admin there." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title={providers.length ? "Configured providers" : "Add the identity provider"}>
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
              ["Attributes", "email (required), displayName (optional) - names are configurable"],
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
      </div>
    </>
  );
}
