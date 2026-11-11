// The SAML provider registration body, in one place: Admin › Single sign-on sends it,
// and test/saml.test.ts signs in through exactly this configuration.
export interface SamlInput {
  providerId: string;
  domain: string;
  /** identity provider metadata XML; or entityId + ssoUrl + cert */
  metadata?: string;
  entityId?: string;
  ssoUrl?: string;
  cert?: string;
  emailAttr?: string;
  nameAttr?: string;
}

export function spEntityId(base: string, providerId: string): string {
  return `${base}/api/auth/sso/saml2/sp/metadata?providerId=${providerId}`;
}

export function acsUrl(base: string, providerId: string): string {
  return `${base}/api/auth/sso/saml2/sp/acs/${providerId}`;
}

const SSO_SERVICE = /<(?:\w+:)?SingleSignOnService\b[^>]*>/g;

/** The identity provider's sign-in URL from its metadata (HTTP-Redirect preferred, then HTTP-POST). */
export function ssoUrlFromMetadata(xml: string): string | null {
  const services = [...xml.matchAll(SSO_SERVICE)].map((m) => m[0]);
  const loc = (tag: string) => /Location="([^"]+)"/.exec(tag)?.[1] ?? null;
  const pick = services.find((t) => /HTTP-Redirect/.test(t)) ?? services.find((t) => /HTTP-POST/.test(t)) ?? services[0];
  return pick ? loc(pick) : null;
}

export function samlProviderBody(d: SamlInput, base: string) {
  const issuer = spEntityId(base, d.providerId);
  const entryPoint = d.ssoUrl || (d.metadata ? ssoUrlFromMetadata(d.metadata) : null);
  if (!entryPoint) throw new Error("No sign-in URL: the metadata has no SingleSignOnService, and none was given.");
  return {
    providerId: d.providerId,
    issuer,
    domain: d.domain,
    samlConfig: {
      issuer,
      entryPoint,
      cert: d.cert || undefined,
      callbackUrl: `${base}/`,
      idpMetadata: d.metadata ? { metadata: d.metadata } : { entityID: d.entityId ?? "", cert: d.cert },
      spMetadata: {},
      // the identity provider must sign its assertions
      wantAssertionsSigned: true,
      identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      mapping: {
        email: d.emailAttr || "email",
        name: d.nameAttr || "displayName",
      },
    },
  };
}
