"use server";
// Admin › Integrations: create a key for a reporting tool, revoke it, remove it. The key is
// returned once, at creation; only its hash is kept.
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { actionViewer, audit } from "@/lib/server";
import { newKey, TOOLS } from "@/lib/integrations/keys";
import { DATASET_KEYS } from "@/lib/integrations/datasets";

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function admin() {
  const v = await actionViewer();
  if (!v.isAdmin) throw new Error("Administrators only.");
  return v;
}

const createIn = z.object({
  name: z.string().trim().min(2, "Name the integration, e.g. \"Power BI - HR dashboard\".").max(80),
  tool: z.enum(TOOLS),
  datasets: z.array(z.enum(DATASET_KEYS as [string, ...string[]])).min(1, "Choose at least one dataset."),
  expiresDays: z.coerce.number().int().min(0).max(3650),
});

export async function createIntegration(data: unknown): Promise<{ ok: true; key: string; id: string } | { ok: false; error: string }> {
  try {
    const v = await admin();
    const d = createIn.parse(data);
    const db = await getDb();
    const k = newKey();
    const [row] = await db.insert(schema.apiClient).values({
      name: d.name, tool: d.tool, tokenHash: k.hash, tokenHint: k.hint, datasets: d.datasets, createdBy: v.name,
      expiresAt: d.expiresDays ? new Date(Date.now() + d.expiresDays * 86400e3) : null,
    }).returning({ id: schema.apiClient.id });
    await audit(v, "create_integration", "api_client", row.id, { name: d.name, tool: d.tool, datasets: d.datasets, expiresDays: d.expiresDays || null });
    revalidatePath("/admin/integrations");
    return { ok: true, key: k.key, id: row.id };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the fields." };
    return { ok: false, error: (e as Error).message };
  }
}

export async function revokeIntegration(id: string): Promise<Result> {
  try {
    const v = await admin();
    const db = await getDb();
    const [row] = await db.update(schema.apiClient).set({ revokedAt: new Date() }).where(eq(schema.apiClient.id, id)).returning({ name: schema.apiClient.name });
    if (!row) return { ok: false, error: "Not found." };
    await audit(v, "revoke_integration", "api_client", id, { name: row.name });
    revalidatePath("/admin/integrations");
    return { ok: true, message: `${row.name}: key revoked. Anything still using it now gets "401 revoked".` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Remove a revoked or expired integration from the list (a live one is revoked first). */
export async function removeIntegration(id: string): Promise<Result> {
  try {
    const v = await admin();
    const db = await getDb();
    const [row] = await db.select().from(schema.apiClient).where(eq(schema.apiClient.id, id));
    if (!row) return { ok: false, error: "Not found." };
    const live = !row.revokedAt && !(row.expiresAt && row.expiresAt.getTime() < Date.now());
    if (live) return { ok: false, error: "Revoke the key first." };
    await db.delete(schema.apiClient).where(eq(schema.apiClient.id, id));
    await audit(v, "remove_integration", "api_client", id, { name: row.name });
    revalidatePath("/admin/integrations");
    return { ok: true, message: `${row.name} removed.` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
