"use server";
// The Help page's FAQ and contact details (Settings › Help page).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { actionViewer, audit } from "@/lib/server";
import { writeHelp, type Help } from "@/lib/help";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the fields." : (e as Error).message });

async function admin() {
  const v = await actionViewer();
  if (!v.isAdmin) throw new Error("Administrators only.");
  return v;
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
    return { ok: true, message: "Help updated." };
  } catch (e) { return fail(e); }
}
