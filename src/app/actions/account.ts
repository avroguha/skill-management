"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getAuth, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { getViewer, audit } from "@/lib/server";

export type FormState = { error?: string; ok?: string } | null;

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.viewAs) return { error: `Read-only: you are viewing as ${v.name}. Stop viewing to change a password.` };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH) return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (next !== confirm) return { error: "The two new passwords are different." };
  if (next === current) return { error: "Choose a password different from the current one." };
  if (next.toLowerCase() === (v.username ?? "").toLowerCase() || next.toLowerCase() === "admin") return { error: "Choose a password that is not your username." };
  const auth = await getAuth();
  try {
    await auth.api.changePassword({ body: { currentPassword: current, newPassword: next, revokeOtherSessions: true }, headers: await headers() });
  } catch (err) {
    const msg = (err as { body?: { code?: string }; message?: string }).body?.code ?? (err as Error).message;
    if (/INVALID_PASSWORD|invalid password/i.test(msg)) return { error: "The current password is not right." };
    if (/CREDENTIAL_ACCOUNT_NOT_FOUND/i.test(msg)) return { error: "This account signs in with single sign-on and has no password here." };
    return { error: `The password was not changed: ${msg}` };
  }
  const db = await getDb();
  await db.update(schema.user).set({ mustChangePassword: false }).where(eq(schema.user.id, v.userId));
  await audit(v, "change_password", "user", v.userId);
  redirect("/");
}
