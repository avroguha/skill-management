// Runs the directory sync on its schedule (checked every 10 minutes) and on demand.
// One run at a time across every worker (a lease); a run left "running" by a crash is
// ignored after an hour.
import { desc } from "drizzle-orm";
import type { DB } from "../../db/index.ts";
import * as s from "../../db/schema.ts";
import { readDirectoryConfig, directoryPassword } from "./config.ts";
import { createServiceNow } from "./servicenow.ts";
import { runSync } from "./sync.ts";
import { takeSnapshot } from "../snapshots.ts";
import { refreshGate } from "../sso-gate.ts";
import { takeLease, releaseLease } from "../lease.ts";

const g = globalThis as unknown as { __skillsSyncRunning?: boolean };

export async function syncNow(db: DB, trigger: "manual" | "schedule", actorName = "") {
  if (g.__skillsSyncRunning || !(await takeLease(db, "directory-sync", 3600e3))) throw new Error("A sync is already running.");
  g.__skillsSyncRunning = true;
  try {
    const c = await readDirectoryConfig(db);
    const sn = createServiceNow({ instanceUrl: c.instanceUrl, username: c.username, password: directoryPassword(c) });
    const run = await runSync(db, sn, c, trigger, actorName);
    if (run.status === "ok") {
      await refreshGate(db); // newly synced people can sign in, leavers cannot
      await takeSnapshot(db);
    }
    return run;
  } finally {
    g.__skillsSyncRunning = false;
    await releaseLease(db, "directory-sync").catch(() => undefined);
  }
}

export async function syncIfDue(db: DB, now = Date.now()): Promise<boolean> {
  const c = await readDirectoryConfig(db);
  if (!c.enabled || !c.syncEveryHours || !c.instanceUrl || !c.rootUserName || g.__skillsSyncRunning) return false;
  const [last] = await db.select().from(s.syncRun).orderBy(desc(s.syncRun.startedAt)).limit(1);
  if (last) {
    const age = now - last.startedAt.getTime();
    if (last.status === "running" && age < 3600e3) return false;
    if (age < c.syncEveryHours * 3600e3) return false;
  }
  try {
    const run = await syncNow(db, "schedule");
    console.log(`directory sync (schedule): ${run.status} - ${run.message.slice(0, 200)}`);
  } catch (e) {
    console.error("directory sync (schedule): failed -", (e as Error).message);
  }
  return true;
}
