// One app worker: Next.js (the standalone build) served over HTTPS.
//
//   :8443  HTTPS - the app. The certificate comes from TLS_DIR and is swapped in
//          without a restart when the files change (deploy/tls.cjs).
//   :8080  HTTP  - redirects every request to HTTPS. Requests from inside the
//          container itself (the health check, Next.js calling itself) are served,
//          so nothing internal needs a certificate.
//
// APP_TLS=off is for running behind a load balancer or proxy that terminates TLS:
// then :8080 serves the app over plain HTTP and :8443 is not opened. There is no
// other way to plain HTTP - a missing certificate stops the worker instead.
//
// Next.js's own standalone server.js serves plain HTTP only, so this is a custom
// server: the same request handler (next() + getRequestHandler), with the config the
// build embedded in server.js.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { watchPair, describe } = require("./tls.cjs");

process.env.NODE_ENV = "production";
process.chdir(__dirname);

const HTTPS_PORT = 8443;
const HTTP_PORT = 8080;
const tlsOn = (process.env.APP_TLS || "on").toLowerCase() !== "off";
const tlsDir = process.env.TLS_DIR || "/tls";
const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");

// The build writes its config into server.js as one JSON line (checked in the Dockerfile).
const built = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const m = /^const nextConfig = (\{.*\})\s*$/m.exec(built);
if (!m) {
  console.error("server: the Next.js config was not found in server.js; this Next.js version builds differently");
  process.exit(1);
}
const nextConfig = JSON.parse(m[1]);
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);
// Next.js forwards some server action requests to itself: over loopback HTTP, served below.
process.env.__NEXT_PRIVATE_ORIGIN = `http://127.0.0.1:${HTTP_PORT}`;

const isLoopback = (a) => a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";

function redirect(req, res) {
  // the address people type when it is https; otherwise the host they asked for
  let target;
  try {
    const base = appUrl.startsWith("https://") ? appUrl : `https://${(req.headers.host || "localhost").replace(/:\d+$/, "")}`;
    target = new URL(req.url || "/", base).toString();
  } catch {
    res.writeHead(400).end();
    return;
  }
  res.writeHead(308, { Location: target, "Content-Length": "0" }).end();
}

async function main() {
  const next = require("next");
  const app = next({ dir: __dirname, dev: false, conf: nextConfig, hostname: "0.0.0.0", port: tlsOn ? HTTPS_PORT : HTTP_PORT });
  await app.prepare();
  const handle = app.getRequestHandler();
  const upgrade = typeof app.getUpgradeHandler === "function" ? app.getUpgradeHandler() : null;
  const serve = (req, res) => handle(req, res).catch((e) => {
    console.error(`server: ${req.method} ${req.url}: ${e && e.stack ? e.stack : e}`);
    if (!res.headersSent) res.writeHead(500).end("Internal Server Error");
  });
  const fail = (what) => (e) => { console.error(`server: ${what}: ${e.message}`); process.exit(1); };

  const plain = http.createServer((req, res) => (!tlsOn || isLoopback(req.socket.remoteAddress) ? serve(req, res) : redirect(req, res)));
  if (upgrade) plain.on("upgrade", (req, socket, head) => (!tlsOn || isLoopback(req.socket.remoteAddress) ? upgrade(req, socket, head) : socket.destroy()));
  plain.on("error", fail(`port ${HTTP_PORT}`));
  plain.listen(HTTP_PORT, "0.0.0.0");

  if (!tlsOn) {
    console.log(`server: APP_TLS=off - plain HTTP on :${HTTP_PORT}, for use behind a proxy that terminates TLS`);
    return;
  }
  let watched;
  try {
    watched = watchPair(tlsDir, (pair) => secure.setSecureContext({ cert: pair.cert, key: pair.key }), {
      everyMs: (Number(process.env.TLS_RELOAD_SECONDS) || 60) * 1000,
    });
  } catch (e) {
    console.error(`server: no usable certificate (${e.message}). tls-init makes one on "docker compose up"; or install one with scripts/install-cert.sh`);
    process.exit(1);
  }
  const secure = https.createServer({ cert: watched.first.cert, key: watched.first.key, minVersion: "TLSv1.2" }, serve);
  if (upgrade) secure.on("upgrade", upgrade);
  secure.on("error", fail(`port ${HTTPS_PORT}`));
  secure.listen(HTTPS_PORT, "0.0.0.0", () => {
    // once per start, not once per worker
    const worker = require("node:cluster").worker;
    if (!worker || worker.id === 1) console.log(`server: HTTPS on :${HTTPS_PORT} with ${describe(watched.first)}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
