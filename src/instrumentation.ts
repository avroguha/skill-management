// Runs once when the server starts: open and migrate the database (so the first
// request is not the one that waits), keep this month's snapshot current, and run
// the directory sync when it is due.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getDb } = await import("./db/index.ts");
  const { takeSnapshot } = await import("./lib/snapshots.ts");
  const { syncIfDue } = await import("./lib/directory/schedule.ts");
  const { refreshGate } = await import("./lib/sso-gate.ts");
  const db = await getDb();
  const snapshot = async () => {
    try {
      await takeSnapshot(db);
    } catch (err) {
      console.error("snapshot: failed -", (err as Error).message);
    }
  };
  const directory = async () => {
    try {
      await syncIfDue(db);
    } catch (err) {
      console.error("directory sync: check failed -", (err as Error).message);
    }
  };
  await snapshot();
  const gate = async () => {
    try {
      await refreshGate(db);
    } catch (err) {
      console.error("sso gate: refresh failed -", (err as Error).message);
    }
  };
  await gate();
  const g = globalThis as unknown as { __skillsTimers?: NodeJS.Timeout[] };
  for (const t of g.__skillsTimers ?? []) clearInterval(t);
  g.__skillsTimers = [
    setInterval(snapshot, Number(process.env.SNAPSHOT_HOURS || 6) * 3600e3),
    setInterval(directory, 10 * 60e3),
    setInterval(gate, 60e3),
  ];
  for (const t of g.__skillsTimers) t.unref?.();
  void directory();
}
