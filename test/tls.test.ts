// The certificate the app serves (deploy/tls.cjs): a pair is checked before use, and a
// changed pair replaces the served one only when it loads. Certificates are made with
// openssl on the spot; without openssl on this machine the test is skipped.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadPair, watchPair, describe } = require("../deploy/tls.cjs") as {
  loadPair: (dir: string) => { cert: Buffer; key: Buffer; names: string; fingerprint: string; validTo: Date };
  watchPair: (dir: string, onChange: (p: { cert: Buffer; key: Buffer; fingerprint: string }) => void, o?: object) => { first: { cert: Buffer; key: Buffer; fingerprint: string }; check: (again?: boolean) => void; stop: () => void };
  describe: (p: object) => string;
};

const OPENSSL = ["openssl", "C:/Program Files/Git/usr/bin/openssl.exe", "C:/Program Files/Git/mingw64/bin/openssl.exe"]
  .find((c) => spawnSync(c, ["version"], { encoding: "utf8" }).status === 0);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skm-tls-"));
// MSYS2_ARG_CONV_EXCL: Git's openssl would read "/CN=..." as a Windows path
const ssl = (...args: string[]) => {
  const r = spawnSync(OPENSSL!, args, { cwd: dir, encoding: "utf8", env: { ...process.env, MSYS2_ARG_CONV_EXCL: "/CN=" } });
  assert.equal(r.status, 0, r.stderr);
};
function pair(name: string, cn: string) {
  ssl("req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "30",
    "-keyout", `${name}.key`, "-out", `${name}.crt`, "-subj", `/CN=${cn}`, "-addext", `subjectAltName=DNS:${cn},IP:127.0.0.1`);
  return { crt: fs.readFileSync(path.join(dir, `${name}.crt`)), key: fs.readFileSync(path.join(dir, `${name}.key`)) };
}
const live = path.join(dir, "live");
const put = (p: { crt: Buffer; key: Buffer }) => {
  fs.writeFileSync(path.join(live, "tls.crt"), p.crt);
  fs.writeFileSync(path.join(live, "tls.key"), p.key);
};
const skip = OPENSSL ? false : "openssl is not on this machine";

test("a pair is checked before it is used: names, a key of another certificate, a key with a password", { skip }, () => {
  fs.mkdirSync(live, { recursive: true });
  const a = pair("a", "one.avro.test");
  const b = pair("b", "two.avro.test");
  put(a);
  const p = loadPair(live);
  assert.match(p.names, /DNS:one\.avro\.test/);
  assert.match(describe(p), /one\.avro\.test.*valid until \d{4}-\d{2}-\d{2} - EXPIRES IN \d+ DAYS/, "30 days is flagged");

  fs.writeFileSync(path.join(live, "tls.key"), b.key);
  assert.throws(() => loadPair(live), /does not belong to the first certificate/);

  ssl("pkcs8", "-topk8", "-in", "a.key", "-v2", "aes-256-cbc", "-passout", "pass:pw", "-out", "a.enc.key");
  fs.copyFileSync(path.join(dir, "a.enc.key"), path.join(live, "tls.key"));
  assert.throws(() => loadPair(live), /has a password.*install-cert\.sh/);

  fs.rmSync(path.join(live, "tls.key"));
  assert.throws(() => loadPair(live), /cannot read .*tls\.key/);
});

test("a new pair is served without a restart; an unusable one leaves the old one in place", { skip }, async () => {
  const a = pair("c", "first.avro.test");
  const b = pair("d", "second.avro.test");
  put(a);
  const errors: string[] = [];
  const logs: string[] = [];
  const log = { log: (m: string) => logs.push(m), error: (m: string) => errors.push(m) };
  const server = https.createServer({ cert: a.crt, key: a.key }, (_q, r) => r.end("ok"));
  const w = watchPair(live, (p) => server.setSecureContext({ cert: p.cert, key: p.key }), { log, everyMs: 3600e3 });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const served = () => new Promise<string>((resolve, reject) => {
    const req = https.get({ host: "127.0.0.1", port, rejectUnauthorized: false, agent: false }, (res) => {
      const cert = (res.socket as import("node:tls").TLSSocket).getPeerCertificate();
      res.resume();
      resolve(cert.subject.CN as string);
    });
    req.on("error", reject);
  });
  try {
    assert.equal(await served(), "first.avro.test");

    // the new pair: picked up at the next check
    put(b);
    w.check();
    assert.equal(await served(), "second.avro.test");
    assert.match(logs.join("\n"), /new certificate in use: .*second\.avro\.test/);

    // half a pair (a key from another certificate): not used, reported, old one kept
    fs.writeFileSync(path.join(live, "tls.key"), a.key);
    w.check(false);
    assert.equal(await served(), "second.avro.test");
    assert.match(errors.join("\n"), /cannot be used .*still serving the previous one/);

    // the same certificate written again: no reload reported
    put(b);
    const before = logs.length;
    w.check(false);
    assert.equal(logs.length, before);
  } finally {
    w.stop();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the HTTPS server reads the config the Next.js build embeds, and the build checks it is there", () => {
  const serve = fs.readFileSync(path.join(import.meta.dirname, "..", "deploy", "serve.cjs"), "utf8");
  const docker = fs.readFileSync(path.join(import.meta.dirname, "..", "Dockerfile"), "utf8");
  assert.match(serve, /\^const nextConfig = \(\\\{\.\*\\\}\)/);
  assert.match(docker, /grep -q '\^const nextConfig = \{' \.next\/standalone\/server\.js/);
  // the regex as serve.cjs uses it, against the shape of a standalone server.js
  const sample = "const dir = path.join(__dirname)\nconst nextConfig = {\"distDir\":\"./.next\",\"output\":\"standalone\"}\n\nprocess.env.X = 1\n";
  const m = /^const nextConfig = (\{.*\})\s*$/m.exec(sample);
  assert.deepEqual(JSON.parse(m![1]), { distDir: "./.next", output: "standalone" });
});

test("the database password reaches pg, which ignores a separate password next to a connection string", async () => {
  const { withPassword } = await import("../src/db/index.ts");
  const { parse } = (await import("pg-connection-string")).default as { parse: (s: string) => { password?: string; host?: string; port?: string; database?: string } };
  const url = "postgres://skills@db:5433/skills";
  const pw = "a1b2c3d4e5f6";
  const p = parse(withPassword(url, pw));
  assert.equal(p.password, pw);
  assert.deepEqual([p.host, p.port, p.database], ["db", "5433", "skills"]);
  assert.equal(parse(withPassword(url, "p@ss/w:rd")).password, "p@ss/w:rd", "special characters survive");
  assert.equal(withPassword(url, undefined), url);
  assert.equal(parse(withPassword("postgres://u:own@db/x", pw)).password, "own", "a password in DATABASE_URL wins");
});
