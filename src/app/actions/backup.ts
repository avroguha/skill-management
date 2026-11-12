"use server";
// Admin › Import & export: back up now, restore a stored backup, delete one, and the
// automatic backup settings. Uploading a backup file goes through /api/backup/restore
// (files can be larger than a server action accepts); downloads through /api/backup/<name>.
import fs from "node:fs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { actionViewer, audit, type Viewer } from "@/lib/server";
import { backupPath, deleteBackup, pruneBackups, readBackupSettings, saveBackup, writeBackupSettings, type BackupSettings } from "@/lib/backup";
import { restoreFrom } from "@/lib/restore";

type Fail = { ok: false; error: string };
const fail = (e: unknown): Fail => ({ ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the values." : (e as Error).message });

async function admin(): Promise<Viewer> {
  const v = await actionViewer();
  if (!v.isAdmin) throw new Error("Administrators only.");
  return v;
}

export async function backupNow(): Promise<{ ok: true; name: string } | Fail> {
  try {
    const v = await admin();
    const b = await saveBackup(await getDb(), v.name, "manual");
    await audit(v, "backup", "backup", b.name, b.summary);
    revalidatePath("/admin/data");
    return { ok: true, name: b.name };
  } catch (e) { return fail(e); }
}

export async function restoreStored(name: string, confirm: string): Promise<{ ok: true; message: string } | Fail> {
  try {
    const v = await admin();
    if (confirm.trim().toUpperCase() !== "RESTORE") return { ok: false, error: "Type RESTORE to confirm." };
    const r = await restoreFrom(fs.readFileSync(backupPath(name)), v, name);
    revalidatePath("/", "layout");
    return { ok: true, message: `Restored the backup from ${new Date(r.from).toLocaleString("en-GB")}. What was there before is saved as ${r.safety}. Everyone signs in again.` };
  } catch (e) { return fail(e); }
}

export async function removeStored(name: string): Promise<{ ok: true } | Fail> {
  try {
    const v = await admin();
    deleteBackup(name);
    await audit(v, "delete_backup", "backup", name);
    revalidatePath("/admin/data");
    return { ok: true };
  } catch (e) { return fail(e); }
}

const settingsIn = z.object({
  enabled: z.boolean(),
  everyHours: z.coerce.number().int().min(1, "Every 1 hour at most often.").max(168, "Every 168 hours (a week) at the longest."),
  keep: z.coerce.number().int().min(1, "Keep at least one.").max(365, "Keep at most 365."),
});

export async function saveBackupSettings(input: BackupSettings): Promise<{ ok: true } | Fail> {
  try {
    const v = await admin();
    const s = settingsIn.parse(input);
    const db = await getDb();
    const before = await readBackupSettings(db);
    await writeBackupSettings(db, s);
    if (s.keep < before.keep) pruneBackups(s.keep);
    await audit(v, "backup_settings", "app_setting", "backup", s);
    revalidatePath("/admin/data");
    return { ok: true };
  } catch (e) { return fail(e); }
}
