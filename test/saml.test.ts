// SAML 2.0 single sign-on end to end, against the real auth stack and an in-memory
// database. The identity provider is made up on the spot: a fresh RSA key and a
// self-signed certificate built in code, so no private key is ever stored in the repo.
//
//   admin signs in (admin / admin)
//   -> registers the provider with the metadata, through the same body the admin page sends
//   -> a person starts SSO and is sent to the identity provider with an AuthnRequest
//   -> the identity provider posts back a signed assertion to the ACS URL
//   -> before activation: captured and refused; after: only synced people get a session
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { eq } from "drizzle-orm";
import { SignedXml } from "xml-crypto";

const APP = "https://skills.avro.test";
process.env.PGLITE_DIR = "memory://";
process.env.SEED_DEMO = "true";
process.env.APP_URL = APP;
process.env.BETTER_AUTH_SECRET = crypto.randomBytes(32).toString("hex");
delete process.env.DATABASE_URL;

const { getDb, closeDb, schema } = await import("../src/db/index.ts");
const { getAuth } = await import("../src/lib/auth.ts");
const { samlProviderBody, acsUrl, defaultSpEntityId } = await import("../src/lib/saml.ts");
const { recentAttempts, writeSsoSettings, readSsoSettings, linkSignedInUser, matchValue, findPerson } = await import("../src/lib/sso-gate.ts");

// ---- a minimal X.509 certificate, DER by hand ---------------------------------------
const len = (n: number) => {
  if (n < 128) return Buffer.from([n]);
  const b: number[] = [];
  for (let v = n; v > 0; v >>= 8) b.unshift(v & 0xff);
  return Buffer.from([0x80 | b.length, ...b]);
};
const tlv = (tag: number, c: Buffer) => Buffer.concat([Buffer.from([tag]), len(c.length), c]);
const seq = (...c: Buffer[]) => tlv(0x30, Buffer.concat(c));
const set = (...c: Buffer[]) => tlv(0x31, Buffer.concat(c));
const int = (b: Buffer) => tlv(0x02, b[0] & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b);
const oid = (s: string) => {
  const p = s.split(".").map(Number);
  const out = [40 * p[0] + p[1]];
  for (const n of p.slice(2)) {
    const b = [n & 0x7f];
    for (let v = n >> 7; v > 0; v >>= 7) b.unshift((v & 0x7f) | 0x80);
    out.push(...b);
  }
  return tlv(0x06, Buffer.from(out));
};
const utc = (d: Date) => tlv(0x17, Buffer.from(`${d.toISOString().replace(/[-:T]/g, "").slice(2, 14)}Z`));

function identityProvider() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const alg = seq(oid("1.2.840.113549.1.1.11"), Buffer.from([0x05, 0x00]));
  const name = seq(set(seq(oid("2.5.4.3"), tlv(0x0c, Buffer.from("Test IdP")))));
  const now = Date.now();
  const tbs = seq(tlv(0xa0, int(Buffer.from([2]))), int(crypto.randomBytes(8)), alg, name,
    seq(utc(new Date(now - 86400e3)), utc(new Date(now + 365 * 86400e3))), name, publicKey.export({ type: "spki", format: "der" }));
  const der = seq(tbs, alg, tlv(0x03, Buffer.concat([Buffer.from([0]), crypto.sign("sha256", tbs, privateKey)])));
  const b64 = der.toString("base64");
  return {
    b64,
    certPem: `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`,
    keyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    entityId: "https://sts.idp.avro.test/tenant-1234/",
    ssoUrl: "https://login.idp.avro.test/tenant-1234/saml2",
  };
}
type Idp = ReturnType<typeof identityProvider>;

const metadata = (idp: Idp) => `<?xml version="1.0" encoding="utf-8"?>
<EntityDescriptor ID="_m1" entityID="${idp.entityId}" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol" WantAuthnRequestsSigned="false">
    <KeyDescriptor use="signing"><KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><X509Data><X509Certificate>${idp.b64}</X509Certificate></X509Data></KeyInfo></KeyDescriptor>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${idp.ssoUrl}"/>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${idp.ssoUrl}"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;

function samlResponse(idp: Idp, o: { requestId: string; acs: string; audience: string; email: string; name: string; tamper?: boolean }) {
  const now = Date.now();
  const iso = (ms: number) => new Date(now + ms).toISOString();
  const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r${crypto.randomUUID()}" Version="2.0" IssueInstant="${iso(0)}" Destination="${o.acs}" InResponseTo="${o.requestId}">
<saml:Issuer>${idp.entityId}</saml:Issuer>
<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
<saml:Assertion ID="_a${crypto.randomUUID()}" Version="2.0" IssueInstant="${iso(0)}">
<saml:Issuer>${idp.entityId}</saml:Issuer>
<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${o.email}</saml:NameID>
<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${o.requestId}" NotOnOrAfter="${iso(300e3)}" Recipient="${o.acs}"/></saml:SubjectConfirmation></saml:Subject>
<saml:Conditions NotBefore="${iso(-60e3)}" NotOnOrAfter="${iso(300e3)}"><saml:AudienceRestriction><saml:Audience>${o.audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions>
<saml:AuthnStatement AuthnInstant="${iso(0)}" SessionIndex="_s1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>
<saml:AttributeStatement>
<saml:Attribute Name="email"><saml:AttributeValue>${o.email}</saml:AttributeValue></saml:Attribute>
<saml:Attribute Name="displayName"><saml:AttributeValue>${o.name}</saml:AttributeValue></saml:Attribute>
</saml:AttributeStatement>
</saml:Assertion>
</samlp:Response>`;
  const sig = new SignedXml({
    privateKey: idp.keyPem,
    publicCert: idp.certPem,
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  });
  sig.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"],
  });
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']", action: "after" } });
  let signed = sig.getSignedXml();
  // after signing, claim to be someone else: the signature must catch it
  if (o.tamper) signed = signed.split(`>${o.email}<`).join(">intruder@avro.com<");
  return Buffer.from(signed).toString("base64");
}

const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

async function call(path: string, init: { method?: string; json?: unknown; form?: Record<string, string>; cookie?: string; origin?: string } = {}) {
  const auth = await getAuth();
  const headers: Record<string, string> = {};
  if (init.cookie) headers.cookie = init.cookie;
  if (init.origin !== "") headers.origin = init.origin ?? APP;
  let body: string | undefined;
  if (init.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(init.json); }
  if (init.form) { headers["content-type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(init.form).toString(); }
  return auth.handler(new Request(`${APP}/api/auth${path}`, { method: init.method ?? (body ? "POST" : "GET"), headers, body }));
}

let idp: Idp;
let adminCookie = "";

test.before(async () => {
  await getDb();
  idp = identityProvider();
  const res = await call("/sign-in/username", { json: { username: "admin", password: "admin" } });
  assert.equal(res.status, 200, await res.clone().text());
  adminCookie = cookieOf(res);
});
test.after(() => closeDb());

test("an employee cannot register an identity provider; the admin can, from metadata", async () => {
  const anon = await call("/sso/register", { json: samlProviderBody({ providerId: "corporate", domain: "avro.com", metadata: metadata(idp) }, APP) });
  assert.ok(anon.status >= 400, `unauthenticated register refused (${anon.status})`);
  const res = await call("/sso/register", { cookie: adminCookie, json: samlProviderBody({ providerId: "corporate", domain: "avro.com", metadata: metadata(idp) }, APP) });
  assert.equal(res.status, 200, await res.clone().text());
  const db = await getDb();
  const [row] = await db.select().from(schema.ssoProvider).where(eq(schema.ssoProvider.providerId, "corporate"));
  assert.equal(row.domain, "avro.com");
  const md = await call(`/sso/saml2/sp/metadata?providerId=corporate`);
  const xml = await md.text();
  assert.match(xml, new RegExp(`Location="${acsUrl(APP, "corporate").replace(/[.?]/g, "\\$&")}"`), "SP metadata names our ACS URL");
  assert.ok(xml.includes(`entityID="${defaultSpEntityId(APP)}"`), "by default the Entity ID is the app address");
});

async function startLogin(providerId = "corporate") {
  const res = await call("/sign-in/sso", { json: { providerId, callbackURL: "/", errorCallbackURL: "/sso-test/done" } });
  assert.equal(res.status, 200, await res.clone().text());
  const { url } = (await res.json()) as { url: string };
  const u = new URL(url);
  assert.equal(`${u.origin}${u.pathname}`, idp.ssoUrl, "sent to the identity provider");
  const request = zlib.inflateRawSync(Buffer.from(u.searchParams.get("SAMLRequest")!, "base64")).toString("utf8");
  const requestId = /ID="([^"]+)"/.exec(request)![1];
  return { requestId, request, relayState: u.searchParams.get("RelayState") ?? "", cookie: cookieOf(res) };
}

async function signIn(email: string, name: string) {
  const { requestId, relayState, cookie } = await startLogin();
  const SAMLResponse = samlResponse(idp, { requestId, acs: acsUrl(APP, "corporate"), audience: defaultSpEntityId(APP), email, name });
  return call(`/sso/saml2/sp/acs/corporate`, { form: { SAMLResponse, RelayState: relayState }, cookie, origin: "https://login.idp.avro.test" });
}

test("before activation every SSO sign-in is a test: attributes captured, refused, nobody created", async () => {
  const db = await getDb();
  const [emp] = await db.select().from(schema.employee).where(eq(schema.employee.active, true)).limit(1);
  const usersBefore = (await db.select().from(schema.user)).length;
  const res = await signIn(emp.email, emp.name);
  assert.ok([302, 303].includes(res.status), `redirect, got ${res.status}: ${await res.clone().text()}`);
  assert.match(res.headers.get("location") ?? "", /\/sso-test\/done\?.*error=SSO_TEST/i, `back to the test page: ${res.headers.get("location")}`);
  assert.doesNotMatch(cookieOf(res), /session_token=[^;]+/, "no session");
  assert.equal((await db.select().from(schema.user)).length, usersBefore, "no user created");
  const [captured] = recentAttempts();
  assert.equal(captured.outcome, "test");
  assert.equal(captured.nameId, emp.email);
  assert.deepEqual(captured.attributes.email, [emp.email]);
  assert.deepEqual(captured.attributes.displayName, [emp.name]);
});

test("once active, a synced person signs in and is linked to their record", async () => {
  const db = await getDb();
  await writeSsoSettings(db, { active: true, matchAttribute: "email", matchField: "email" });
  const [emp] = await db.select().from(schema.employee).where(eq(schema.employee.active, true)).limit(1);
  const res = await signIn(emp.email, emp.name);
  assert.ok([302, 303].includes(res.status), `redirect after ACS, got ${res.status}: ${await res.clone().text()}`);
  assert.doesNotMatch(res.headers.get("location") ?? "", /error/i, `no error redirect: ${res.headers.get("location")}`);
  const session = cookieOf(res);
  assert.match(session, /session_token=/);
  const me = await call("/get-session", { cookie: session });
  const body = (await me.json()) as { user: { id: string; email: string; role: string } };
  assert.equal(body.user.email, emp.email);
  assert.equal(recentAttempts()[0].outcome, "allowed");
  assert.equal(recentAttempts()[0].matchedPerson, emp.name);
  // the first page after sign-in links the account (outside the auth transaction)
  assert.equal(await linkSignedInUser(db, body.user), emp.id);
  const [linked] = await db.select().from(schema.employee).where(eq(schema.employee.id, emp.id));
  assert.equal(linked.userId, body.user.id);
  const [user] = await db.select().from(schema.user).where(eq(schema.user.id, body.user.id));
  assert.equal(user.role, "employee", "SSO users start as employees; managing people makes them managers");
  // a second sign-in goes to the same account
  const again = await signIn(emp.email, emp.name);
  const me2 = (await (await call("/get-session", { cookie: cookieOf(again) })).json()) as { user: { id: string } };
  assert.equal(me2.user.id, body.user.id);
});

test("someone the identity provider knows but who is not a synced person is refused", async () => {
  const db = await getDb();
  const usersBefore = (await db.select().from(schema.user)).length;
  const res = await signIn("svc.integration@avro.com", "Integration Account");
  assert.match(res.headers.get("location") ?? "", /error=NOT_ALLOWED/i, `refused: ${res.headers.get("location")}`);
  assert.doesNotMatch(cookieOf(res), /session_token=[^;]+/);
  assert.equal((await db.select().from(schema.user)).length, usersBefore);
  assert.equal(recentAttempts()[0].outcome, "refused");
  // matching on the login name instead
  const [emp] = await db.select().from(schema.employee).where(eq(schema.employee.active, true)).limit(1);
  await db.update(schema.employee).set({ userName: "the.login" }).where(eq(schema.employee.id, emp.id));
  await writeSsoSettings(db, { active: true, matchAttribute: "login", matchField: "user_name" });
  assert.equal(matchValue(await readSsoSettings(db), "x", { login: ["THE.LOGIN"] }), "THE.LOGIN");
  assert.equal((await findPerson(db, "user_name", "THE.LOGIN"))?.id, emp.id, "case-insensitive");
  await writeSsoSettings(db, { active: true, matchAttribute: "email", matchField: "email" });
});

test("a tampered assertion is refused and creates no session", async () => {
  const db = await getDb();
  const before = (await db.select().from(schema.session)).length;
  const { requestId, relayState, cookie } = await startLogin();
  const SAMLResponse = samlResponse(idp, { requestId, acs: acsUrl(APP, "corporate"), audience: defaultSpEntityId(APP), email: "dan@avro.com", name: "Dan", tamper: true });
  const res = await call(`/sso/saml2/sp/acs/corporate`, { form: { SAMLResponse, RelayState: relayState }, cookie, origin: "https://login.idp.avro.test" });
  assert.doesNotMatch(cookieOf(res), /session_token=[^;]+/, "no session cookie");
  assert.equal((await db.select().from(schema.session)).length, before, "no new session row");
  const intruder = await db.select().from(schema.user).where(eq(schema.user.email, "intruder@avro.com"));
  assert.equal(intruder.length, 0);
});

test("an assertion signed by a different key is refused", async () => {
  const other = identityProvider();
  const { requestId, relayState, cookie } = await startLogin();
  const SAMLResponse = samlResponse({ ...other, entityId: idp.entityId }, { requestId, acs: acsUrl(APP, "corporate"), audience: defaultSpEntityId(APP), email: "eve@avro.com", name: "Eve" });
  const res = await call(`/sso/saml2/sp/acs/corporate`, { form: { SAMLResponse, RelayState: relayState }, cookie, origin: "https://login.idp.avro.test" });
  assert.doesNotMatch(cookieOf(res), /session_token=[^;]+/);
});

test("the Entity ID can be chosen: sign-in requests carry it, and only answers addressed to it are accepted", async () => {
  const db = await getDb();
  const entity = "urn:avro:skills";
  const reg = await call("/sso/register", { cookie: adminCookie, json: samlProviderBody({ providerId: "custom", spEntityId: entity, domain: "custom.avro.test", metadata: metadata(idp) }, APP) });
  assert.equal(reg.status, 200, await reg.clone().text());
  const md = await (await call("/sso/saml2/sp/metadata?providerId=custom")).text();
  assert.ok(md.includes(`entityID="${entity}"`), "the service-provider metadata names the chosen Entity ID");

  const [emp] = await db.select().from(schema.employee).where(eq(schema.employee.active, true)).limit(1);
  const send = async (audience: string) => {
    const { requestId, request, relayState, cookie } = await startLogin("custom");
    assert.match(request, new RegExp(`<(?:saml:)?Issuer[^>]*>${entity}</`), "the sign-in request is issued by the chosen Entity ID");
    const SAMLResponse = samlResponse(idp, { requestId, acs: acsUrl(APP, "custom"), audience, email: emp.email, name: emp.name });
    return call(`/sso/saml2/sp/acs/custom`, { form: { SAMLResponse, RelayState: relayState }, cookie, origin: "https://login.idp.avro.test" });
  };
  const wrong = await send(defaultSpEntityId(APP));
  assert.doesNotMatch(cookieOf(wrong), /session_token=[^;]+/, "an answer for another Entity ID is refused");
  const right = await send(entity);
  assert.match(cookieOf(right), /session_token=[^;]+/, `an answer for the chosen Entity ID signs in: ${right.status} ${right.headers.get("location")}`);
});
