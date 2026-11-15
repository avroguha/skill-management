// What an identity provider's metadata says, for Admin › Single sign-on: its entity ID, the
// sign-in URL this app will use, and the signing certificates with their expiry dates.
// Server only (reads certificates with node:crypto).
import { X509Certificate } from "node:crypto";
import { ssoUrlFromMetadata } from "./saml.ts";

export interface CertInfo { subject: string; notAfter: string; daysLeft: number }
export interface IdpInfo { entityId: string; ssoUrl: string | null; certs: CertInfo[]; problems: string[] }

export function inspectIdpMetadata(xml: string, now = Date.now()): IdpInfo {
  const problems: string[] = [];
  const text = xml.replace(/^﻿/, "").trim();
  if (!/<(?:\w+:)?EntityDescriptor\b/.test(text)) problems.push("This is not SAML metadata: there is no EntityDescriptor.");
  if (!/<(?:\w+:)?IDPSSODescriptor\b/.test(text)) problems.push("It describes no identity provider (no IDPSSODescriptor). Use the identity provider's Federation Metadata XML, not this app's.");
  const entityId = /<(?:\w+:)?EntityDescriptor\b[^>]*\bentityID="([^"]+)"/.exec(text)?.[1] ?? "";
  const ssoUrl = ssoUrlFromMetadata(text);
  if (!ssoUrl) problems.push("It has no SingleSignOnService (sign-in URL).");
  // signing certificates of the identity provider part only (Entra also lists them for other roles)
  const idp = /<(?:\w+:)?IDPSSODescriptor\b[\s\S]*?<\/(?:\w+:)?IDPSSODescriptor>/.exec(text)?.[0] ?? text;
  const seen = new Set<string>();
  const certs: CertInfo[] = [];
  for (const m of idp.matchAll(/<(?:\w+:)?X509Certificate>([\s\S]*?)<\/(?:\w+:)?X509Certificate>/g)) {
    const b64 = m[1].replace(/\s+/g, "");
    if (!b64 || seen.has(b64)) continue;
    seen.add(b64);
    try {
      const c = new X509Certificate(Buffer.from(b64, "base64"));
      const notAfter = new Date(c.validTo);
      certs.push({ subject: c.subject.replace(/\n/g, ", "), notAfter: notAfter.toISOString(), daysLeft: Math.floor((notAfter.getTime() - now) / 86400e3) });
    } catch {
      problems.push("A signing certificate in it could not be read.");
    }
  }
  if (!certs.length && !problems.length) problems.push("It has no signing certificate.");
  if (certs.length && certs.every((c) => c.daysLeft < 0)) problems.push("Every signing certificate in it has expired.");
  return { entityId, ssoUrl, certs, problems };
}
