"use server";
// Asking for a new skill or category, and deciding on what was asked (src/lib/requests.ts).
//  - Anyone signed in may ask, change what they asked while it is open, or withdraw it.
//  - A coordinator or an administrator approves (and may change it), sends it back with a
//    note, or says no with a reason. Nobody else can.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { guardAction, audit, type Viewer } from "@/lib/server";
import { askFor, decide, resend, withdraw, type Who } from "@/lib/requests";

export type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const who = (v: Viewer): Who => ({ id: v.viewAs ? v.viewAs.byUserId : v.userId, employeeId: v.employee?.id ?? null, name: v.name });

function refresh() {
  for (const p of ["/requests", "/team", "/my-skills", "/skills", "/settings/skills"]) revalidatePath(p);
  revalidatePath("/", "layout");
}

const askIn = z.object({
  kind: z.enum(["skill", "category"]),
  name: z.string().max(200),
  description: z.string().max(600).optional(),
  categoryId: z.string().nullish(),
  categoryName: z.string().max(100).optional(),
  parentId: z.string().nullish(),
  reason: z.string().max(600).optional(),
});

export async function askForCatalogue(input: z.input<typeof askIn>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const p = askIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  const r = await askFor(await getDb(), who(g.v), p.data);
  if (r.ok) { await audit(g.v, "ask_catalogue", "catalogue_request", r.id, p.data); refresh(); }
  return r;
}

export async function resendRequest(id: string, input: Omit<z.input<typeof askIn>, "kind">): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const p = askIn.omit({ kind: true }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  const r = await resend(await getDb(), who(g.v), id, p.data);
  if (r.ok) { await audit(g.v, "resend_request", "catalogue_request", id, p.data); refresh(); }
  return r;
}

export async function withdrawRequest(id: string): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const r = await withdraw(await getDb(), who(g.v), id);
  if (r.ok) { await audit(g.v, "withdraw_request", "catalogue_request", id); refresh(); }
  return r;
}

const decideIn = z.object({
  id: z.string().min(1),
  decision: z.enum(["approve", "return", "reject"]),
  comment: z.string().max(1200).optional(),
  name: z.string().max(200).optional(),
  description: z.string().max(600).optional(),
  categoryId: z.string().nullish(),
  categoryName: z.string().max(100).optional(),
  parentId: z.string().nullish(),
});

export async function decideRequest(input: z.input<typeof decideIn>): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!v.coordinator) return { ok: false, error: "Coordinators and administrators decide on requests." };
  const p = decideIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  const r = await decide(await getDb(), who(v), p.data);
  if (r.ok) { await audit(v, `${p.data.decision}_request`, "catalogue_request", p.data.id, p.data); refresh(); }
  return r;
}
