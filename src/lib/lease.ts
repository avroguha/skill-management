// One worker at a time for a scheduled job. Every app worker runs the same timers; a job
// (directory sync, scheduled backup, snapshot) runs only in the worker that takes its lease.
// A lease expires by itself, so a worker that dies mid-job cannot block the job forever.
import os from "node:os";
import crypto from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import * as s from "../db/schema.ts";

export const WORKER_ID = `${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;

/** Takes the lease for `name` for `ttlMs` if nobody (else) holds it. */
export async function takeLease(db: DB, name: string, ttlMs: number, holder = WORKER_ID): Promise<boolean> {
  const until = new Date(Date.now() + ttlMs);
  const rows = await db.insert(s.jobLease).values({ name, holder, until })
    .onConflictDoUpdate({
      target: s.jobLease.name,
      set: { holder, until },
      where: sql`${s.jobLease.until} < now() or ${s.jobLease.holder} = ${holder}`,
    })
    .returning({ holder: s.jobLease.holder });
  return rows[0]?.holder === holder;
}

export async function releaseLease(db: DB, name: string, holder = WORKER_ID): Promise<void> {
  await db.delete(s.jobLease).where(and(eq(s.jobLease.name, name), eq(s.jobLease.holder, holder)));
}

/** Runs `fn` while holding the lease; returns null (without running) when another worker has it. */
export async function withLease<T>(db: DB, name: string, ttlMs: number, fn: () => Promise<T>, holder = WORKER_ID): Promise<T | null> {
  if (!(await takeLease(db, name, ttlMs, holder))) return null;
  try { return await fn(); } finally { await releaseLease(db, name, holder).catch(() => undefined); }
}
