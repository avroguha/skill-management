"use server";
// Settings › Single sign-on: the test capture, the mapping of what the identity provider sends
// (who the person is, and the account fields), who may sign in, activation, and what an
// uploaded metadata file holds.
import { revalidatePath } from "next/cache";
import { asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { actionViewer, audit } from "@/lib/server";
import {
  readSsoSettings, writeSsoSettings, loadAttempts, findPerson, matchValue, profileFrom, checkAccess,
  type SsoAttempt, type SsoSettings,
} from "@/lib/sso-gate";
import { inspectIdpMetadata, type IdpInfo } from "@/lib/saml-inspect";

type Fail = { ok: false; error: string };
const fail = (e: unknown): Fail => ({ ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the fields." : (e as Error).message });

async function admin() {
  const v = await actionViewer({ live: true });
  if (!v.isAdmin) throw new Error("Administrators only.");
  return v;
}

export interface GroupOption { id: string; name: string; members: number; active: boolean }

/** The ServiceNow groups that can be chosen in "Who may sign in", with member counts. */
async function groupOptions(): Promise<GroupOption[]> {
  const db = await getDb();
  const rows = await db.select({
    id: schema.snGroup.externalId, name: schema.snGroup.name, active: schema.snGroup.active,
    members: sql<number>`(select count(*)::int from group_member m where m.group_id = ${schema.snGroup.id})`,
  }).from(schema.snGroup).orderBy(asc(schema.snGroup.name));
  return rows.map((r) => ({ ...r, members: Number(r.members) }));
}

export async function ssoState(): Promise<{ ok: true; settings: SsoSettings; attempts: SsoAttempt[]; groups: GroupOption[] } | Fail> {
  try {
    await admin();
    const db = await getDb();
    return { ok: true, settings: await readSsoSettings(db), attempts: await loadAttempts(db), groups: await groupOptions() };
  } catch (e) { return fail(e); }
}

const attr = z.string().trim().max(300);
const settingsIn = z.object({
  matchAttribute: z.string().trim().min(1, "Choose the value that identifies the person."),
  matchField: z.enum(["email", "user_name"]),
  profile: z.object({ name: attr, email: attr, userName: attr }),
  access: z.object({
    mode: z.enum(["people", "groups"]),
    snGroups: z.array(z.string().trim().min(1)).max(500),
    claimAttribute: attr,
    claimValues: z.array(z.string().trim().min(1).max(300)).max(200),
  }),
});
type SettingsIn = z.input<typeof settingsIn>;

export interface Preview {
  value: string;
  person: string | null;
  access: { ok: boolean; reason: string } | null;
  profile: { name?: string; email?: string; userName?: string };
}

/** What the latest test sign-in would give with these settings: who, allowed or not, which account fields. */
export async function previewMatch(input: SettingsIn): Promise<({ ok: true } & Preview) | Fail> {
  try {
    await admin();
    const m = settingsIn.parse(input);
    const db = await getDb();
    const [last] = await loadAttempts(db);
    if (!last) return { ok: false, error: "Run a test sign-in first." };
    const value = matchValue(m, last.nameId, last.attributes);
    const p = await findPerson(db, m.matchField, value);
    let access: Preview["access"] = null;
    if (p) {
      const groups = await db.select({ ext: schema.snGroup.externalId, name: schema.snGroup.name })
        .from(schema.groupMember).innerJoin(schema.snGroup, eq(schema.snGroup.id, schema.groupMember.groupId))
        .where(sql`${schema.groupMember.employeeId} = ${p.id} and ${schema.snGroup.active}`);
      const [acct] = p.userId ? await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.id, p.userId)) : [];
      access = checkAccess(m.access, { groups: groups.map((g) => g.ext), isAdmin: acct?.role === "admin" }, last.attributes, new Map(groups.map((g) => [g.ext, g.name])));
    }
    return {
      ok: true, value, person: p ? `${p.name}${p.title ? ` (${p.title})` : ""}` : null, access,
      profile: profileFrom(m.profile, last.nameId, last.attributes),
    };
  } catch (e) { return fail(e); }
}

export async function saveSso(input: SettingsIn & { active: boolean }): Promise<{ ok: true; message: string } | Fail> {
  try {
    const v = await admin();
    const m = settingsIn.parse(input);
    const db = await getDb();
    if (m.access.mode === "groups" && !m.access.snGroups.length && !(m.access.claimAttribute && m.access.claimValues.length)) {
      return { ok: false, error: "Choose at least one ServiceNow group, or a groups attribute and its values, or let everyone in the organisation sign in." };
    }
    if (input.active) {
      const [{ n }] = await db.select({ n: count() }).from(schema.ssoProvider);
      if (!n) return { ok: false, error: "Add the identity provider first." };
      const [last] = await loadAttempts(db);
      if (!last) return { ok: false, error: "Run a test sign-in first, so the mapping is checked against what the identity provider really sends." };
      const value = matchValue(m, last.nameId, last.attributes);
      const p = await findPerson(db, m.matchField, value);
      if (!p) return { ok: false, error: `With this mapping the last test sign-in matches nobody (${m.matchField} = "${value || "(empty)"}"). Activating would lock people out.` };
    }
    await writeSsoSettings(db, { active: input.active, ...m });
    // new accounts take their e-mail and name from the same attributes (the provider's own mapping)
    if (m.profile.email || m.profile.name) {
      for (const p of await db.select().from(schema.ssoProvider)) {
        let cfg: { mapping?: Record<string, string> } = {};
        try { cfg = JSON.parse(p.samlConfig ?? "{}"); } catch { continue; }
        const mapping = { ...(cfg.mapping ?? {}) };
        if (m.profile.email && m.profile.email !== "nameID") mapping.email = m.profile.email;
        if (m.profile.name && m.profile.name !== "nameID") mapping.name = m.profile.name;
        await db.update(schema.ssoProvider).set({ samlConfig: JSON.stringify({ ...cfg, mapping }) }).where(eq(schema.ssoProvider.id, p.id));
      }
    }
    await audit(v, input.active ? "activate_sso" : "save_sso_mapping", "app_setting", "sso", { ...m, active: input.active });
    revalidatePath("/settings/sso");
    revalidatePath("/login");
    return { ok: true, message: input.active ? "Single sign-on is active. The sign-in page now offers it." : "Saved." };
  } catch (e) { return fail(e); }
}

/** What an identity provider metadata file holds, before it is saved. */
export async function inspectMetadata(xml: string): Promise<({ ok: true } & IdpInfo) | Fail> {
  try {
    await admin();
    if (!xml.trim()) return { ok: false, error: "The file is empty." };
    if (xml.length > 2_000_000) return { ok: false, error: "That file is too big to be SAML metadata." };
    return { ok: true, ...inspectIdpMetadata(xml) };
  } catch (e) { return fail(e); }
}
