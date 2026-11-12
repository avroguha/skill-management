// Guards for the deployment rules. They read the deployment files as text and
// fail when a rule is broken - these regressions never show up in app tests.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.join(import.meta.dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");
const LOCATIONS = ["IMAGE_REGISTRY", "APT_MIRROR", "NPM_REGISTRY", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"];
const HOUR = 3600e3;
const envKeys = (text: string) => Object.fromEntries([...text.matchAll(/^([A-Z_][A-Z0-9_]*)=(.*)$/gm)].map((m) => [m[1], m[2]]));
const code = (text: string) => text.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

test("the Dockerfile bakes in no site location and persists no proxy, registry or token", () => {
  const d = read("Dockerfile");
  assert.match(d, /^ARG IMAGE_REGISTRY=$/m);
  for (const k of ["APT_MIRROR", "NPM_REGISTRY", "NPM_TOKEN", "HTTP_PROXY", "HTTPS_PROXY"]) {
    for (const m of d.matchAll(new RegExp(`^ARG ${k}=(.*)$`, "gm"))) assert.equal(m[1], "", `${k} must have no built-in value`);
  }
  for (const m of d.matchAll(/^ARG NO_PROXY=(.*)$/gm)) assert.equal(m[1], "localhost,127.0.0.1");
  assert.ok(d.includes(': "${NPM_REGISTRY:?'), "a build without an env file must stop, not fall back");
  const envLines: string[] = [];
  let inEnv = false;
  for (const l of d.split("\n")) {
    if (l.startsWith("ENV")) inEnv = true;
    if (inEnv) envLines.push(l);
    if (!l.trimEnd().endsWith("\\")) inEnv = false;
  }
  assert.ok(envLines.length > 0);
  // NODE_USE_ENV_PROXY only tells fetch to honour a runtime proxy; it holds no address
  for (const line of envLines) assert.ok(!/(proxy|NPM_REGISTRY|NPM_TOKEN|APT_MIRROR)/i.test(line.replace("NODE_USE_ENV_PROXY=1", "")), `persisted: ${line}`);
});

test("every pulled image goes through IMAGE_REGISTRY, is pinned by digest, and the pin is at least 72 hours old", () => {
  const d = read("Dockerfile");
  const c = code(read("docker-compose.yml"));
  const pins = JSON.parse(read("image-pins.json")) as Record<string, { digest: string; pushedAt: string; pinnedAt: string }>;
  for (const f of [...d.matchAll(/^FROM (\S+)/gm)].map((m) => m[1])) assert.ok(f.startsWith("${IMAGE_REGISTRY}"), f);
  const refs = [
    ...[...d.matchAll(/^ARG IMAGE_(?!REGISTRY)\w+=(\S+)$/gm)].map((m) => m[1]),
    ...[...c.matchAll(/^\s*image: (.+)$/gm)].map((m) => m[1].trim()).filter((i) => i !== "skill-management:local")
      .map((i) => { assert.ok(i.startsWith("${IMAGE_REGISTRY?"), `${i} must go through IMAGE_REGISTRY`); return i.replace(/^\$\{IMAGE_REGISTRY\?[^}]*\}/, ""); }),
  ];
  assert.ok(refs.length >= 3);
  for (const img of refs) {
    const [ref, digest] = img.split("@");
    assert.match(digest ?? "", /^sha256:[0-9a-f]{64}$/, `${img} is not pinned by digest`);
    const pin = pins[ref];
    assert.ok(pin, `${ref} is missing from image-pins.json`);
    assert.equal(pin.digest, digest, `${ref}: digest differs from image-pins.json`);
    assert.ok(Date.parse(pin.pinnedAt) - Date.parse(pin.pushedAt) >= 72 * HOUR, `${ref} was pinned less than 72 hours after it was pushed`);
  }
});

test("the 72-hour gate runs after npm ci, offline; the cache covers the lockfile; versions are exact", () => {
  const d = read("Dockerfile");
  assert.ok(d.indexOf("npm ci") > 0 && d.indexOf("npm ci") < d.indexOf("check-release-age.cjs --hours 72 --offline"));
  assert.ok(!/npm install/.test(d), "install from the lockfile only");
  const lock = JSON.parse(read("package-lock.json")) as { packages: Record<string, { version?: string; link?: boolean }> };
  const cache = JSON.parse(read("deps-publish-times.json")) as Record<string, string>;
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key || entry.link || !entry.version) continue;
    const name = key.slice(key.lastIndexOf("node_modules/") + 13);
    const at = cache[`${name}@${entry.version}`];
    assert.ok(at, `${name}@${entry.version} has no cached publish time - run npm run deps:age`);
    assert.ok(Date.now() - Date.parse(at) >= 72 * HOUR, `${name}@${entry.version} is younger than 72 hours`);
  }
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  for (const [n, v] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    assert.match(v, /^\d+\.\d+\.\d+/, `${n} must be pinned to an exact version, not "${v}"`);
    assert.equal(v, lock.packages[`node_modules/${n}`]?.version, `${n}: package.json and the lockfile disagree`);
  }
});

test("legacy-builder compatible, unprivileged, cheap health check, no outbound font fetch", () => {
  const d = read("Dockerfile");
  assert.ok(!/RUN --mount|^# syntax=|COPY --chmod|COPY --link|<<\s*['"]?EOF/m.test(d), "BuildKit-only syntax");
  assert.match(d, /userdel -r ubuntu/);
  assert.match(d, /useradd -r -u 10001/);
  assert.match(d, /^USER skills$/m);
  const hc = d.slice(d.indexOf("HEALTHCHECK"), d.indexOf("CMD ["));
  assert.match(hc, /curl/);
  assert.ok(!/node -e|python/.test(hc), "no language runtime in the health check");
  assert.match(d, /apt-get install[^\n]*\bcurl\b/);
  // next/font/google downloads at build time and breaks behind a proxy
  const layout = read("src/app/layout.tsx");
  assert.ok(!/next\/font\/google/.test(layout), "use the self-hosted geist package, not next/font/google");
});

test("compose requires every location from the env file, pins nothing public and never pulls the local image", () => {
  const c = read("docker-compose.yml");
  const body = code(c);
  for (const k of LOCATIONS) {
    assert.match(body, new RegExp(`\\b${k}: \\$\\{${k}\\?`), `${k} must be required`);
  }
  assert.ok(!/\$\{[A-Z_]+:-/.test(body), "no ${VAR:-default}: an empty value must mean empty");
  // ($${X} is an escaped dollar for the container's shell, not a compose variable)
  for (const m of body.matchAll(/(?<!\$)\$\{([A-Z_][A-Z0-9_]*)([^}]*)\}/g)) {
    if (m[1] === "NPM_TOKEN") assert.equal(m[2], "-", "the token defaults to empty");
    else assert.ok(m[2].startsWith("?"), `\${${m[1]}} must be required with ?`);
  }
  assert.match(body, /NPM_TOKEN: \$\{NPM_TOKEN-\}/, "the token reaches the build, empty by default");
  assert.match(body, /pull_policy: build/);
  assert.equal([...body.matchAll(/network_mode: host/g)].length, 2, "host networking for both services");
  assert.match(body, /listen_addresses=127\.0\.0\.1/, "PostgreSQL listens on loopback only");
  assert.ok(!/^volumes:\s*$/m.test(body), "bind mounts only, no named volumes");
  assert.ok(!/POSTGRES_PASSWORD:/.test(body), "no password in the compose file");
  for (const pub of ["docker.io", "ghcr.io", "quay.io", "registry.npmjs.org", "pypi.org", "archive.ubuntu.com"]) {
    assert.ok(!c.includes(pub), `compose names a public location: ${pub}`);
  }
  assert.match(body, /max-size/);
});

test("work.env and home.env define the same keys, everything compose requires, and no secrets", () => {
  const body = code(read("docker-compose.yml"));
  const required = [...new Set([...body.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\?/g)].map((m) => m[1]))];
  const work = envKeys(read("work.env"));
  const home = envKeys(read("home.env"));
  assert.deepEqual(Object.keys(work).sort(), Object.keys(home).sort());
  for (const k of required) {
    assert.ok(k in work, `work.env lacks ${k}`);
    assert.ok(k in home, `home.env lacks ${k}`);
  }
  for (const [name, env] of [["work.env", work], ["home.env", home]] as const) {
    for (const [k, v] of Object.entries(env)) if (/(PASSWORD|SECRET|TOKEN|KEY)$/.test(k)) assert.equal(v, "", `${name} holds a value for ${k}`);
    assert.match(env.SEED_DEMO, /^(true|false)$/);
    assert.match(env.FORCE_PASSWORD_CHANGE, /^(true|false)$/);
  }
  assert.equal(home.IMAGE_REGISTRY, "");
  assert.equal(home.HTTP_PROXY, "");
  assert.equal(home.HTTPS_PROXY, "");
  assert.match(work.IMAGE_REGISTRY, /\S+\/$/);
  for (const k of ["IMAGE_REGISTRY", "APT_MIRROR", "NPM_REGISTRY", "HTTP_PROXY", "HTTPS_PROXY"]) {
    assert.match(work[k], /avro\.com/, `work.env ${k} should be an avro.com placeholder`);
  }
  assert.match(work.DATA_DIR, /^\.\.\//, "work data lives outside the code folder");
  // the ServiceNow sync goes out through the site's proxy at work, directly at home
  assert.match(code(read("docker-compose.yml")), /HTTPS_PROXY: \$\{RUNTIME_HTTPS_PROXY\?/);
  assert.equal(home.RUNTIME_HTTPS_PROXY, "");
  assert.match(work.RUNTIME_HTTPS_PROXY, /avro\.com/);
  assert.match(work.APP_URL, /^https:\/\//, "at work the app is reached over https");
});

test(".gitignore keeps state, keys and certificates out, but not the env files or any source", () => {
  const g = read(".gitignore").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  for (const p of ["/state/", "/secrets/", "/data/", "/.data/", "*.key", "/node_modules/", "/certs/*.crt"]) assert.ok(g.includes(p), p);
  for (const p of g) {
    assert.ok(!/(^|\/)(work|home)\.env$|^\*\.env$/.test(p), `env files must be committed: ${p}`);
    if (p.endsWith("/") && !p.startsWith("*")) assert.ok(p.startsWith("/"), `directory rule not anchored: ${p}`);
  }
  const di = read(".dockerignore");
  for (const p of ["state", "node_modules", ".env*", ".data"]) assert.ok(di.split(/\r?\n/).includes(p), `.dockerignore lacks ${p}`);
  // no source file may be ignored (an unanchored rule once dropped a package from every clone)
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel); else files.push(rel);
    }
  };
  for (const d of ["src", "test", "scripts", "deploy", "drizzle"]) walk(d);
  files.push("Dockerfile", "docker-compose.yml", "work.env", "home.env", "package.json", "package-lock.json", "certs/README.txt");
  const r = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], { cwd: ROOT, input: Buffer.from(files.join("\n")), encoding: "buffer" });
  if (r.error) return; // no git on this machine
  const ignored = r.stdout.toString("utf8").split(/\r?\n/).filter(Boolean);
  assert.deepEqual(ignored, [], "source files that .gitignore would drop");
});

test("scripts are LF and the npm test glob is quoted", () => {
  for (const f of ["deploy/db-entrypoint.sh"]) {
    assert.ok(!fs.readFileSync(path.join(ROOT, f)).includes(Buffer.from("\r\n")), `${f}: CRLF gives "bad interpreter" on Linux`);
  }
  assert.match(read(".gitattributes"), /\*\.sh text eol=lf/);
  assert.match((JSON.parse(read("package.json")) as { scripts: { test: string } }).scripts.test, /"test\/\*\.test\.ts"/);
});

// The private deny list (one ERE per line) lives outside every repository; when it
// is present on this machine, no project file may match any of its terms.
test("no company term anywhere in the project", (t) => {
  const listFile = path.join(os.homedir(), ".config", "git", "denylist");
  if (!fs.existsSync(listFile)) {
    t.skip("no deny list on this machine");
    return;
  }
  const patterns = fs.readFileSync(listFile, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((p) => new RegExp(p, "i"));
  const skip = new Set(["node_modules", ".next", ".data", "state", "secrets", ".git", ".claude"]);
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (!/\.(png|jpg|ico|woff2|tsbuildinfo)$/.test(e.name) && e.name !== ".env.local") {
        const text = `${path.relative(ROOT, p)}\n${fs.readFileSync(p, "utf8")}`;
        if (patterns.some((re) => re.test(text))) hits.push(path.relative(ROOT, p));
      }
    }
  };
  walk(ROOT);
  assert.deepEqual(hits, [], "files containing a deny-listed term (terms not printed on purpose)");
});
