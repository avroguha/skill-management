"use server";
// Settings › E-mail (the mail relay and which e-mails go out) and a manager's Remind on My team.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { guardAction, audit, getEngine } from "@/lib/server";
import { DEFAULT_EMAIL, nudgePeople, sendTestEmail, validTimeZone, writeEmailSettings, type EmailSettings } from "@/lib/mail/notify";
import { isEmail } from "@/lib/mail/message";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the fields." : (e as Error).message });

const address = (what: string) => z.string().trim().max(254).refine((x) => !x || isEmail(x), `${what} is not an e-mail address.`);
const settingsIn = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(253).regex(/^[A-Za-z0-9.\-:\[\]]*$/, "The relay is a host name or an IP address, nothing else."),
  port: z.coerce.number().int().min(1, "Port 1 to 65535.").max(65535, "Port 1 to 65535."),
  security: z.enum(["none", "starttls", "starttls-required", "tls"]),
  fromAddress: address("The sender"),
  fromName: z.string().trim().max(100).regex(/^[^\r\n]*$/),
  replyTo: address("Reply-to"),
  send: z.object({ submitted: z.boolean(), returned: z.boolean(), validated: z.boolean(), reminders: z.boolean(), nudge: z.boolean(), digest: z.boolean() }),
  timeZone: z.string().trim().refine(validTimeZone, "Not a time zone. Use a name such as America/New_York or Asia/Kolkata."),
  sendHour: z.coerce.number().int().min(0).max(23),
  weeklyDay: z.coerce.number().int().min(0).max(6),
}).superRefine((v, ctx) => {
  if (v.enabled && !v.host) ctx.addIssue({ code: "custom", message: "Set the mail relay before switching e-mail on." });
  if (v.enabled && !v.fromAddress) ctx.addIssue({ code: "custom", message: "Set the sender address before switching e-mail on." });
});

async function admin() {
  const g = await guardAction({ live: true });
  if (g.fail) throw new Error(g.fail.error);
  if (!g.v.isAdmin) throw new Error("Administrators only.");
  return g.v;
}

export async function saveEmailSettings(input: EmailSettings): Promise<Result> {
  try {
    const v = await admin();
    const d = settingsIn.parse(input);
    const db = await getDb();
    await writeEmailSettings(db, { ...DEFAULT_EMAIL, ...d });
    await audit(v, "save_email_settings", "app_setting", "email", d);
    revalidatePath("/settings/email");
    return { ok: true, message: d.enabled ? "Saved. E-mail is on." : "Saved. E-mail is off: nothing is sent." };
  } catch (e) { return fail(e); }
}

/** Sends a test with the settings on the form (saved or not), so the relay can be tried before switching on. */
export async function sendTest(input: EmailSettings, to: string): Promise<Result> {
  try {
    const v = await admin();
    const d = settingsIn.parse({ ...input, enabled: false });
    const db = await getDb();
    const response = await sendTestEmail(db, { ...DEFAULT_EMAIL, ...d }, to.trim(), v.name);
    await audit(v, "send_test_email", "app_setting", "email", { to: to.trim(), host: d.host, port: d.port });
    revalidatePath("/settings/email");
    return { ok: true, message: `Sent to ${to.trim()}. The relay answered: ${response}` };
  } catch (e) { return fail(e); }
}

/** A manager reminds people below them who have not updated their skills (one e-mail per person per day). */
export async function remindTeam(employeeIds: string[], note: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (v.demo) return { ok: true, message: "Demo mode: in real use each of them gets an e-mail with what they still have to rate. Nothing was sent." };
  try {
    const ids = z.array(z.string().min(1)).min(1, "Choose who to remind.").max(5000).parse(employeeIds);
    const text = z.string().max(1000).parse(note ?? "");
    if (ids.some((id) => !v.reportIds.has(id))) return { ok: false, error: "You can only remind people who report to you." };
    const engine = await getEngine();
    const db = await getDb();
    const people = ids.map((id) => engine.empById.get(id)).filter((e): e is NonNullable<typeof e> => !!e && e.active);
    const r = await nudgePeople(db, engine, people, v.name, text);
    await audit(v, "remind_team", "employee", null, { ...r, people: ids.length });
    const parts = [
      r.sent ? `Reminded ${r.sent} ${r.sent === 1 ? "person" : "people"}.` : "Nobody new to remind.",
      r.already ? `${r.already} already reminded today.` : "",
      r.upToDate ? `${r.upToDate} up to date.` : "",
      r.noEmail ? `${r.noEmail} without an e-mail address.` : "",
    ];
    return { ok: true, message: parts.filter(Boolean).join(" ") };
  } catch (e) { return fail(e); }
}
