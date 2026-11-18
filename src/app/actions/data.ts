"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { guardAction, audit } from "@/lib/server";
import { importCsv, KINDS, type Kind, type ImportReport, type SkillDecision } from "@/lib/transfer";
import { refreshGate } from "@/lib/sso-gate";

const decisionsIn = z.array(z.object({
  key: z.string().min(1).max(500),
  action: z.enum(["separate", "merge", "skip", "replace"]),
  targetId: z.string().max(100).optional(),
})).max(20_000);

export async function importData(kind: string, text: string, dryRun: boolean, decisions: SkillDecision[] = []): Promise<{ ok: true; report: ImportReport } | { ok: false; error: string }> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!v.isAdmin) return { ok: false, error: "Administrators only." };
  if (!(KINDS as readonly string[]).includes(kind)) return { ok: false, error: "Unknown kind of data." };
  if (text.length > 20_000_000) return { ok: false, error: "That file is over 20 MB. Split it." };
  const parsed = decisionsIn.safeParse(decisions);
  if (!parsed.success) return { ok: false, error: "The choices for near-identical skills could not be read. Check the file again." };
  try {
    const db = await getDb();
    const report = await importCsv(db, kind as Kind, text, { dryRun, actorId: v.userId, decisions: parsed.data });
    if (!dryRun) {
      await refreshGate(db);
      const chosen = Object.fromEntries(["separate", "merge", "skip", "replace"].map((a) => [a, parsed.data.filter((d) => d.action === a).length]));
      await audit(v, "import", kind, null, { rows: report.rows, created: report.created, updated: report.updated, errors: report.errors.length, ...(kind === "skills" ? { nearIdentical: chosen } : {}) });
      revalidatePath("/", "layout");
    }
    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
