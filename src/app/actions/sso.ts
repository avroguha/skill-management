"use server";
// Admin › Single sign-on: the test capture, the attribute-to-field mapping, activation.
import { revalidatePath } from "next/cache";
import { count } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { actionViewer, audit } from "@/lib/server";
import { readSsoSettings, writeSsoSettings, loadAttempts, findPerson, matchValue, type SsoAttempt, type SsoSettings } from "@/lib/sso-gate";

type Fail = { ok: false; error: string };

async function admin() {
  const v = await actionViewer();
  if (!v.isAdmin) throw new Error("Administrators only.");
  return v;
}

export async function ssoState(): Promise<{ ok: true; settings: SsoSettings; attempts: SsoAttempt[] } | Fail> {
  try {
    await admin();
    const db = await getDb();
    return { ok: true, settings: await readSsoSettings(db), attempts: await loadAttempts(db) };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

const mapping = z.object({
  matchAttribute: z.string().trim().min(1, "Choose the attribute that identifies the person."),
  matchField: z.enum(["email", "user_name"]),
});

/** Who the latest test sign-in would be, with this mapping. */
export async function previewMatch(input: z.input<typeof mapping>): Promise<{ ok: true; value: string; person: string | null } | Fail> {
  try {
    await admin();
    const m = mapping.parse(input);
    const [last] = await loadAttempts(await getDb());
    if (!last) return { ok: false, error: "Run a test sign-in first." };
    const value = matchValue({ active: false, ...m }, last.nameId, last.attributes);
    const p = await findPerson(await getDb(), m.matchField, value);
    return { ok: true, value, person: p ? `${p.name}${p.title ? ` (${p.title})` : ""}` : null };
  } catch (e) { return { ok: false, error: e instanceof z.ZodError ? e.issues[0].message : (e as Error).message }; }
}

export async function saveSso(input: z.input<typeof mapping> & { active: boolean }): Promise<{ ok: true; message: string } | Fail> {
  try {
    const v = await admin();
    const m = mapping.parse(input);
    const db = await getDb();
    if (input.active) {
      const [{ n }] = await db.select({ n: count() }).from(schema.ssoProvider);
      if (!n) return { ok: false, error: "Add the identity provider first." };
      const [last] = await loadAttempts(await getDb());
      if (!last) return { ok: false, error: "Run a test sign-in first, so the mapping is checked against what the identity provider really sends." };
      const p = await findPerson(db, m.matchField, matchValue({ active: false, ...m }, last.nameId, last.attributes));
      if (!p) return { ok: false, error: `With this mapping the last test sign-in matches nobody (${m.matchField} = "${matchValue({ active: false, ...m }, last.nameId, last.attributes) || "(empty)"}"). Activating would lock people out.` };
    }
    await writeSsoSettings(db, { active: input.active, ...m });
    await audit(v, input.active ? "activate_sso" : "save_sso_mapping", "app_setting", "sso", { ...m, active: input.active });
    revalidatePath("/admin/sso");
    revalidatePath("/login");
    return { ok: true, message: input.active ? "Single sign-on is active. The sign-in page now offers it." : "Saved. Single sign-on is not active." };
  } catch (e) { return { ok: false, error: e instanceof z.ZodError ? e.issues[0].message : (e as Error).message }; }
}
