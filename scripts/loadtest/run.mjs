// A load test: personas signed in once, then N concurrent loops requesting whole pages for a
// fixed time. Prints throughput, latency percentiles, errors and the slowest pages.
//   node scripts/loadtest/run.mjs <base-url> <concurrency> <seconds>
// The mix follows who uses the portal: mostly team members (their profile and
// self-assessment), some managers (their team, validation), a few executives (whole-org views).
// Uses the demo accounts (exec, manager, employee / demo). Run it against a test instance.
const [base = "http://127.0.0.1:8080", concArg = "50", secArg = "60"] = process.argv.slice(2);
const concurrency = Number(concArg), seconds = Number(secArg);

async function signIn(username, password) {
  const r = await fetch(`${base}/api/auth/sign-in/username`, {
    method: "POST", headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ username, password }), redirect: "manual",
  });
  if (r.status !== 200) throw new Error(`sign-in ${username}: ${r.status} ${await r.text()}`);
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function landing(cookie) {
  const r = await fetch(`${base}/`, { headers: { cookie } });
  return new URL(r.url).pathname;
}

async function links(cookie, path, prefix) {
  const html = await (await fetch(`${base}${path}`, { headers: { cookie } })).text();
  return [...new Set([...html.matchAll(/href="(\/people\/[0-9a-f-]{36})"/g)].map((m) => m[1]))].filter((h) => h.startsWith(prefix)).slice(0, 20);
}

const personas = [];
{
  const emp = await signIn("employee", "demo");
  const own = await landing(emp);
  personas.push({ name: "employee", weight: 70, cookie: emp, paths: [own, own, "/assess", "/skills"] });
  const mgr = await signIn("manager", "demo");
  const reports = await links(mgr, "/team", "/people/");
  personas.push({ name: "manager", weight: 22, cookie: mgr, paths: ["/team", "/team?tab=gaps", "/validate", "/", "/org", ...reports.slice(0, 4)] });
  const ex = await signIn("exec", "demo");
  personas.push({ name: "executive", weight: 8, cookie: ex, paths: ["/", "/org", "/gaps", "/people", "/skills", "/team"] });
}
const total = personas.reduce((a, p) => a + p.weight, 0);
const choose = () => { let r = Math.random() * total; for (const p of personas) { if ((r -= p.weight) < 0) return p; } return personas[0]; };

const lat = [];
const byPath = new Map();
let errors = 0, done = 0;
const statuses = {};
const end = Date.now() + seconds * 1000;
async function loop() {
  while (Date.now() < end) {
    const p = choose();
    const path = p.paths[Math.floor(Math.random() * p.paths.length)];
    const t = performance.now();
    try {
      const r = await fetch(`${base}${path}`, { headers: { cookie: p.cookie } });
      await r.arrayBuffer();
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      if (r.status >= 400) errors += 1;
    } catch { errors += 1; statuses.network = (statuses.network ?? 0) + 1; }
    const ms = performance.now() - t;
    lat.push(ms);
    const key = `${p.name} ${path.replace(/[0-9a-f-]{36}/, ":id")}`;
    (byPath.get(key) ?? byPath.set(key, []).get(key)).push(ms);
    done += 1;
  }
}
const started = Date.now();
await Promise.all(Array.from({ length: concurrency }, loop));
const secs = (Date.now() - started) / 1000;
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) : 0; };
console.log(JSON.stringify({
  concurrency, seconds: Math.round(secs), requests: done, rps: Math.round(done / secs),
  p50: pct(lat, 0.5), p95: pct(lat, 0.95), p99: pct(lat, 0.99), errors, statuses,
  slowest: [...byPath].map(([k, v]) => ({ page: k, n: v.length, p95: pct(v, 0.95) })).sort((a, b) => b.p95 - a.p95).slice(0, 6),
}));
