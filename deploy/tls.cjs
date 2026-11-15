// The certificate the app serves: read from TLS_DIR (tls.crt = server certificate then
// intermediates, tls.key = unencrypted private key, both PEM) and re-read when either
// file changes, so a new certificate needs no restart.
//
// Rules (global requirement "HTTPS on 443", 2026-11-15):
//   - a pair that does not load (half-copied, key of another certificate, encrypted
//     key) never replaces the one being served: the old one stays and the error is logged
//   - the files are checked at most once a minute (TLS_RELOAD_SECONDS), by size and time
//   - scripts/install-cert.sh writes the pair; deploy/tls-init.sh makes a self-signed
//     one on the first start
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const tls = require("node:tls");
const crypto = require("node:crypto");

/** Reads and checks the pair; throws with a sentence a person can act on. */
function loadPair(dir) {
  const certFile = path.join(dir, "tls.crt");
  const keyFile = path.join(dir, "tls.key");
  let cert, key;
  try { cert = fs.readFileSync(certFile); } catch (e) { throw new Error(`cannot read ${certFile}: ${e.code || e.message}`); }
  try { key = fs.readFileSync(keyFile); } catch (e) { throw new Error(`cannot read ${keyFile}: ${e.code || e.message}`); }
  if (/ENCRYPTED/.test(key.toString("latin1"))) throw new Error(`${keyFile} has a password; install it with scripts/install-cert.sh, which removes it`);
  let leaf;
  try { leaf = new crypto.X509Certificate(cert); } catch (e) { throw new Error(`${certFile} is not a PEM certificate: ${e.message}`); }
  let priv;
  try { priv = crypto.createPrivateKey(key); } catch (e) { throw new Error(`${keyFile} is not a readable private key: ${e.message}`); }
  if (!leaf.checkPrivateKey(priv)) throw new Error(`${keyFile} does not belong to the first certificate in ${certFile}`);
  const context = tls.createSecureContext({ cert, key }); // what the server will use; throws if unusable
  return {
    cert, key, context,
    subject: leaf.subject.replace(/\n/g, ", "),
    names: leaf.subjectAltName || "",
    validTo: new Date(leaf.validTo),
    fingerprint: leaf.fingerprint256,
  };
}

function stamp(dir) {
  const parts = [];
  for (const f of ["tls.crt", "tls.key"]) {
    try { const s = fs.statSync(path.join(dir, f)); parts.push(`${s.size}:${s.mtimeMs}`); } catch { parts.push("-"); }
  }
  return parts.join("|");
}

function describe(p) {
  const days = Math.floor((p.validTo.getTime() - Date.now()) / 86400e3);
  return `${p.subject} [${p.names || "no names"}], valid until ${p.validTo.toISOString().slice(0, 10)}${days < 30 ? ` - EXPIRES IN ${days} DAYS` : ""}`;
}

/**
 * Watches dir and calls onChange(pair) with each new pair that loads. Returns the first
 * pair (throws when there is none: the app cannot serve HTTPS without one) and a stop().
 */
function watchPair(dir, onChange, { log = console, everyMs = 60e3 } = {}) {
  const first = loadPair(dir);
  let last = stamp(dir);
  let current = first.fingerprint;
  // A pair is replaced as two files: caught between the two, the key and the
  // certificate do not match yet, so a failure is looked at again a moment later
  // before it is reported.
  const check = (again = true) => {
    const now = stamp(dir);
    if (now === last && again) return;
    last = now;
    try {
      const pair = loadPair(dir);
      if (pair.fingerprint === current) return;
      current = pair.fingerprint;
      onChange(pair);
      log.log(`tls: new certificate in use: ${describe(pair)}`);
    } catch (e) {
      if (again) { setTimeout(() => check(false), 3000).unref(); return; }
      log.error(`tls: the certificate in ${dir} changed but cannot be used (${e.message}); still serving the previous one`);
    }
  };
  const timer = setInterval(check, everyMs);
  timer.unref();
  return { first, check, stop: () => clearInterval(timer) };
}

module.exports = { loadPair, watchPair, describe };
