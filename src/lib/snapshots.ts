// Monthly roll-ups per unit (the trend line). The current month's row is
// rewritten on every run; past months are never touched.
import { sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";
import { loadDatasetFrom } from "./dataset.ts";
import { createEngine } from "./engine/engine.ts";

export async function takeSnapshot(db: DB, now = new Date()): Promise<number> {
  const rows = createEngine(await loadDatasetFrom(db)).snapshotRows();
  const period = now.toISOString().slice(0, 7);
  for (const r of rows) {
    await db.insert(s.snapshot).values({ ...r, period, takenAt: now })
      .onConflictDoUpdate({
        target: [s.snapshot.unitId, s.snapshot.period],
        set: { required: r.required, met: r.met, assessed: r.assessed, people: r.people, avgLevel: r.avgLevel, takenAt: now },
      });
  }
  await db.execute(sql`delete from snapshot where unit_id not in (select id from org_unit)`);
  return rows.length;
}
