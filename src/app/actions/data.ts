"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { actionViewer, audit } from "@/lib/server";
import { importCsv, KINDS, type Kind, type ImportReport } from "@/lib/transfer";
import { refreshGate } from "@/lib/sso-gate";

export async function importData(kind: string, text: string, dryRun: boolean): Promise<{ ok: true; report: ImportReport } | { ok: false; error: string }> {
  const v = await actionViewer();
  if (!v.isAdmin) return { ok: false, error: "Administrators only." };
  if (!(KINDS as readonly string[]).includes(kind)) return { ok: false, error: "Unknown kind of data." };
  if (text.length > 20_000_000) return { ok: false, error: "That file is over 20 MB. Split it." };
  try {
    const db = await getDb();
    const report = await importCsv(db, kind as Kind, text, { dryRun, actorId: v.userId });
    if (!dryRun) {
      await refreshGate(db);
      await audit(v, "import", kind, null, { rows: report.rows, created: report.created, updated: report.updated, errors: report.errors.length });
      revalidatePath("/", "layout");
    }
    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
