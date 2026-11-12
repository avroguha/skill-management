"use server";
// Admin › ServiceNow: save the connection, test it (a dry run - nothing is written),
// list a field's values for the user-type filter, sync now, and the photo URL template.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { actionViewer, audit, type Viewer } from "@/lib/server";
import {
  readDirectoryConfig, writeDirectoryConfig, sealPassword, directoryPassword, publicDirectoryConfig,
  type DirectoryConfig, photoUrl,
} from "@/lib/directory/config";
import { createServiceNow, assertFieldName } from "@/lib/directory/servicenow";
import { fetchDirectory } from "@/lib/directory/sync";
import { syncNow } from "@/lib/directory/schedule";
import { asc, eq } from "drizzle-orm";

type Fail = { ok: false; error: string };

async function admin(): Promise<Viewer> {
  const v = await actionViewer();
  if (!v.isAdmin) throw new Error("Administrators only.");
  return v;
}

const field = z.string().trim().regex(/^[a-z0-9_.]+$/i, "Field names are letters, digits, _ and . only.");
const formSchema = z.object({
  enabled: z.boolean(),
  instanceUrl: z.string().trim().regex(/^https?:\/\/[^/\s]+\/?$/i, "The instance URL looks like https://company.service-now.com"),
  username: z.string().trim().min(1, "The integration user name is required."),
  password: z.string().optional().default(""),
  table: field.default("sys_user"),
  rootUserName: z.string().trim().min(1, "The top-level user name is required.").refine((v) => !/[\^=,]/.test(v), "No ^ = or , in a user name."),
  typeField: z.union([field, z.literal("")]),
  typeValues: z.array(z.string().trim().refine((v) => !/[\^=,]/.test(v), "No ^ = or , in a value.")).default([]),
  extraQuery: z.string().trim().max(500).default(""),
  fields: z.object({ userName: field, name: field, email: field, manager: field, title: field }),
  extraFields: z.array(field).max(20).default([]),
  orgFromHierarchy: z.boolean(),
  syncEveryHours: z.coerce.number().int().min(0).max(168),
});
export type DirectoryForm = z.input<typeof formSchema>;

/** The form merged over what is stored; a blank password keeps the stored one. */
async function merged(form: DirectoryForm): Promise<DirectoryConfig> {
  const d = formSchema.parse(form);
  const cur = await readDirectoryConfig(await getDb());
  const { password, ...rest } = d;
  return {
    ...cur, ...rest,
    instanceUrl: d.instanceUrl.replace(/\/+$/, ""),
    passwordSealed: password ? sealPassword(password) : cur.passwordSealed,
  };
}

function client(c: DirectoryConfig) {
  if (!c.passwordSealed) throw new Error("Enter the password.");
  return createServiceNow({ instanceUrl: c.instanceUrl, username: c.username, password: directoryPassword(c) });
}

const message = (e: unknown) => (e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the fields." : (e as Error).message);

export async function saveDirectory(form: DirectoryForm): Promise<{ ok: true } | Fail> {
  try {
    const v = await admin();
    const c = await merged(form);
    await writeDirectoryConfig(await getDb(), c);
    await audit(v, "save_directory", "app_setting", "directory", publicDirectoryConfig(c));
    revalidatePath("/admin/directory");
    return { ok: true };
  } catch (e) { return { ok: false, error: message(e) }; }
}

export interface TestResult {
  ok: true;
  root: { name: string; title: string; email: string };
  included: number;
  excluded: number;
  byType: Record<string, number>;
  truncated: boolean;
  sample: { userName: string; name: string; email: string; title: string; manager: string; userType: string; depth: number; included: boolean }[];
}

/** A full walk with the form's settings; nothing is saved or written. */
export async function testDirectory(form: DirectoryForm): Promise<TestResult | Fail> {
  try {
    const v = await admin();
    const c = await merged(form);
    const r = await fetchDirectory(client(c), c, { maxPeople: Math.min(c.maxPeople, 5000) });
    const nameOf = new Map(r.people.map((p) => [p.externalId, p.name]));
    const sample = [
      ...r.people.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name)).slice(0, 40).map((p) => ({
        userName: p.userName, name: p.name, email: p.email, title: p.title, manager: p.managerExternalId ? nameOf.get(p.managerExternalId) ?? "" : "",
        userType: p.userType, depth: p.depth, included: true,
      })),
      ...r.excluded.slice(0, 15).map((p) => ({ userName: p.userName, name: p.name, email: "", title: "", manager: "", userType: p.userType, depth: -1, included: false })),
    ];
    await audit(v, "test_directory", "app_setting", "directory", { included: r.people.length, excluded: r.excluded.length });
    return {
      ok: true, root: { name: r.root.name, title: r.root.title, email: r.root.email },
      included: r.people.length, excluded: r.excluded.length, byType: r.byType, truncated: r.truncated, sample,
    };
  } catch (e) { return { ok: false, error: message(e) }; }
}

/** The values a field takes in the table, most common first - to pick the user types to bring in. */
export async function fieldValues(form: DirectoryForm, fieldName: string): Promise<{ ok: true; values: { value: string; count: number }[] } | Fail> {
  try {
    await admin();
    const c = await merged(form);
    const values = await client(c).distinct(c.table, assertFieldName(fieldName), c.extraQuery);
    return { ok: true, values: values.slice(0, 50) };
  } catch (e) { return { ok: false, error: message(e) }; }
}

export async function syncDirectoryNow(): Promise<{ ok: true; status: string; message: string } | Fail> {
  try {
    const v = await admin();
    const run = await syncNow(await getDb(), "manual", v.name);
    await audit(v, "sync_directory", "sync_run", run.id, { status: run.status });
    revalidatePath("/", "layout");
    return { ok: true, status: run.status, message: run.message };
  } catch (e) { return { ok: false, error: message(e) }; }
}

export async function saveProfileSettings(input: { photoUrlTemplate: string }): Promise<{ ok: true; preview: string | null } | Fail> {
  try {
    const v = await admin();
    const t = input.photoUrlTemplate.trim();
    if (t && !/^https?:\/\/\S+$/i.test(t)) return { ok: false, error: "The photo URL starts with http:// or https://" };
    if (t && !/\{[a-zA-Z0-9_.]+\}/.test(t)) return { ok: false, error: "Put a {field} placeholder in the URL, e.g. {user_name}." };
    const db = await getDb();
    await db.insert(schema.appSetting).values({ key: "profile", value: { photoUrlTemplate: t } })
      .onConflictDoUpdate({ target: schema.appSetting.key, set: { value: { photoUrlTemplate: t } } });
    const [p] = await db.select().from(schema.employee).where(eq(schema.employee.active, true)).orderBy(asc(schema.employee.name)).limit(1);
    await audit(v, "save_photo_template", "app_setting", "profile", { photoUrlTemplate: t });
    revalidatePath("/", "layout");
    return { ok: true, preview: p ? photoUrl(t, p) : null };
  } catch (e) { return { ok: false, error: message(e) }; }
}
