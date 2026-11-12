"use server";
// Feedback from anyone signed in; the administrators' inbox; the FAQ and contact details.
import { revalidatePath } from "next/cache";
import { and, count, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { actionViewer, audit } from "@/lib/server";
import { FEEDBACK_KINDS, writeHelp, type Help } from "@/lib/help";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the fields." : (e as Error).message });

const feedbackIn = z.object({
  kind: z.enum(FEEDBACK_KINDS.map((k) => k.id) as [string, ...string[]]),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(5000),
  page: z.string().trim().max(300).optional().default(""),
});

/** Anyone signed in. At most 10 in an hour, so a stuck button cannot flood the inbox. */
export async function submitFeedback(data: unknown): Promise<Result> {
  try {
    const v = await actionViewer();
    const d = feedbackIn.parse(data);
    const db = await getDb();
    const [{ n }] = await db.select({ n: count() }).from(schema.feedback)
      .where(and(eq(schema.feedback.userId, v.userId), gt(schema.feedback.at, new Date(Date.now() - 3600e3))));
    if (n >= 10) return { ok: false, error: "That is a lot of feedback in an hour. Please wait a little, or write to the contact below." };
    await db.insert(schema.feedback).values({ userId: v.userId, name: v.name, email: v.email, kind: d.kind, message: d.message, page: d.page.startsWith("/") ? d.page : "" });
    revalidatePath("/help");
    revalidatePath("/admin/feedback");
    return { ok: true, message: "Thank you. It has reached the people who run the portal; the answer appears under Your feedback." };
  } catch (e) { return fail(e); }
}

async function admin() {
  const v = await actionViewer();
  if (!v.isAdmin) throw new Error("Administrators only.");
  return v;
}

const handleIn = z.object({
  id: z.string().min(1),
  status: z.enum(["new", "in_progress", "done"]),
  note: z.string().trim().max(2000).optional().default(""),
});

export async function handleFeedback(data: unknown): Promise<Result> {
  try {
    const v = await admin();
    const d = handleIn.parse(data);
    const db = await getDb();
    const [row] = await db.update(schema.feedback)
      .set({ status: d.status, adminNote: d.note, handledBy: v.name, handledAt: new Date() })
      .where(eq(schema.feedback.id, d.id)).returning({ id: schema.feedback.id });
    if (!row) return { ok: false, error: "Not found." };
    await audit(v, "handle_feedback", "feedback", d.id, { status: d.status });
    revalidatePath("/admin/feedback");
    revalidatePath("/help");
    return { ok: true, message: "Saved. The person sees the status and your note on their Help page." };
  } catch (e) { return fail(e); }
}

const helpIn = z.object({
  faq: z.array(z.object({
    q: z.string().trim().min(3, "Every question needs its question.").max(300),
    a: z.string().trim().min(3, "Every question needs an answer.").max(4000),
    audience: z.enum(["everyone", "manager", "admin"]),
  })).max(100),
  contact: z.object({
    team: z.string().trim().max(120), email: z.string().trim().max(200), channel: z.string().trim().max(120),
    channelUrl: z.string().trim().max(500).refine((u) => !u || /^https:\/\//.test(u), "The chat link must start with https://"),
    phone: z.string().trim().max(60), hours: z.string().trim().max(120), note: z.string().trim().max(1000),
  }),
});

export async function saveHelp(data: unknown): Promise<Result> {
  try {
    const v = await admin();
    const d = helpIn.parse(data) as Help;
    await writeHelp(await getDb(), d);
    await audit(v, "update_help", "app_setting", "help", { faq: d.faq.length });
    revalidatePath("/help");
    revalidatePath("/admin/feedback");
    return { ok: true, message: "Help updated." };
  } catch (e) { return fail(e); }
}
