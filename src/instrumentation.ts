// Runs once when the server starts: open and migrate the database (so the first
// request is not the one that waits), then keep this month's snapshot current.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getDb } = await import("./db/index.ts");
  const { takeSnapshot } = await import("./lib/snapshots.ts");
  const db = await getDb();
  const run = async () => {
    try {
      await takeSnapshot(db);
    } catch (err) {
      console.error("snapshot: failed -", (err as Error).message);
    }
  };
  await run();
  const every = Number(process.env.SNAPSHOT_HOURS || 6) * 3600e3;
  const g = globalThis as unknown as { __skillsSnapshotTimer?: NodeJS.Timeout };
  if (g.__skillsSnapshotTimer) clearInterval(g.__skillsSnapshotTimer);
  g.__skillsSnapshotTimer = setInterval(run, every);
  g.__skillsSnapshotTimer.unref?.();
}
