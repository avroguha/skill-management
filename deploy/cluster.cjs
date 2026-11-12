// Runs several copies of the app's server sharing one port, so every CPU core serves
// requests. APP_WORKERS sets how many (default: the number of cores, at most 8; 1 = no
// cluster). Sessions, caches and scheduled jobs are designed for several workers: sessions
// live in the database, every worker checks the data version, and jobs take a lease.
"use strict";
const cluster = require("node:cluster");
const os = require("node:os");

const cores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
const workers = Math.max(1, Math.min(32, Number(process.env.APP_WORKERS) || Math.min(cores, 8)));

if (workers === 1 || !cluster.isPrimary) {
  require("./server.js");
} else {
  let stopping = false;
  const startedAt = new Map();
  const start = () => { const w = cluster.fork(); startedAt.set(w.id, Date.now()); };
  console.log(`cluster: starting ${workers} workers on ${cores} core(s)`);
  for (let i = 0; i < workers; i++) start();
  cluster.on("exit", (w, code, signal) => {
    if (stopping) return;
    const lived = Date.now() - (startedAt.get(w.id) ?? 0);
    startedAt.delete(w.id);
    console.error(`cluster: worker ${w.process.pid} exited (${signal || code}) after ${Math.round(lived / 1000)}s; starting another`);
    // a worker that dies at once is not restarted in a tight loop
    setTimeout(start, lived < 10_000 ? 5_000 : 0);
  });
  const stop = (sig) => {
    stopping = true;
    for (const w of Object.values(cluster.workers ?? {})) w?.process.kill(sig);
    setTimeout(() => process.exit(0), 10_000).unref();
    let left = Object.keys(cluster.workers ?? {}).length;
    if (!left) process.exit(0);
    cluster.on("exit", () => { left -= 1; if (left <= 0) process.exit(0); });
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}
