// Runs once when the server starts: open and migrate the live database (and import version 1
// on the very first start), so the first request is not the one that waits; then keep the
// directory sync, backups, the single sign-on gate and e-mail going. Everything here works on
// the LIVE database: the demo database never syncs, backs up or sends anything.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getDb } = await import("./db/index.ts");
  const { syncIfDue } = await import("./lib/directory/schedule.ts");
  const { refreshGate } = await import("./lib/sso-gate.ts");
  const { backupIfDue } = await import("./lib/backup.ts");
  const { warmEngine, getEngine } = await import("./lib/server.ts");
  const { processOutbox, remindersIfDue } = await import("./lib/mail/notify.ts");
  const warm = async () => {
    try { await warmEngine("live"); } catch (err) { console.error("engine warm-up: failed -", (err as Error).message); }
  };
  const db = await getDb("live");
  const directory = async () => {
    try { await syncIfDue(db); } catch (err) { console.error("directory sync: check failed -", (err as Error).message); }
  };
  const gate = async () => {
    try { await refreshGate(db); } catch (err) { console.error("sso gate: refresh failed -", (err as Error).message); }
  };
  await gate();
  // e-mail (Settings › E-mail): the weekly reminders and digests when due, then the outbox
  const email = async () => {
    try {
      await remindersIfDue(db, await getEngine());
      await processOutbox(db);
    } catch (err) {
      console.error("email: check failed -", (err as Error).message);
    }
  };
  const g = globalThis as unknown as { __skillsTimers?: NodeJS.Timeout[] };
  for (const t of g.__skillsTimers ?? []) clearInterval(t);
  g.__skillsTimers = [
    setInterval(directory, 10 * 60e3),
    setInterval(gate, 60e3),
    // precompute after every data change, before a request needs it
    setInterval(() => void warm(), Number(process.env.WARM_SECONDS || 3) * 1000),
    // automatic backups (Settings › Data): checked every 10 minutes, taken when due
    setInterval(() => void backupIfDue(db), 10 * 60e3),
    setInterval(() => void email(), 60e3),
  ];
  for (const t of g.__skillsTimers) t.unref?.();
  void directory();
  void backupIfDue(db);
  void warm();
}
