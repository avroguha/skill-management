// Restoring a backup from the admin page or an uploaded file: a safety backup of what is
// there now first, then the restore (all or nothing), then the sign-on gate is reloaded.
import { getDb } from "@/db";
import { decodeBackup, restoreBackup, saveBackup, summarise } from "@/lib/backup";
import { refreshGate } from "@/lib/sso-gate";
import { audit, type Viewer } from "@/lib/server";

export async function restoreFrom(buf: Buffer, v: Viewer, source: string) {
  const b = decodeBackup(buf);
  const db = await getDb();
  const safety = await saveBackup(db, v.name, "before-restore");
  await restoreBackup(db, b);
  await refreshGate(db);
  await audit(v, "restore_backup", "backup", source, { from: b.createdAt, by: b.by, safetyBackup: safety.name, ...summarise(b) });
  return { safety: safety.name, from: b.createdAt, summary: summarise(b) };
}
