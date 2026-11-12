"use server";
// Self-assessment (P0 #4) and manager validation (P0 #5).
//  - Self and validated levels are separate columns; one never overwrites the other.
//  - Submitting sends a rating to the manager unless the manager has already
//    validated it, the person's own level is unchanged since, and it is not stale.
//  - Validating at 4 (Advanced) or 5 (Expert) needs a line of evidence: those
//    are the levels the organisation relies on most.
//  - Nobody validates their own ratings.
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { guardAction, audit, getEngine } from "@/lib/server";

export type Result = { ok: true; message?: string } | { ok: false; error: string };
const EVIDENCE_FROM = 4;

const selfEntry = z.object({
  skillId: z.string().min(1),
  level: z.number().int().min(0).max(5).nullable(),
  comment: z.string().max(1000).default(""),
  interest: z.boolean().default(false),
});

export async function saveSelfAssessment(entries: z.input<typeof selfEntry>[], submit: boolean): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!v.employee) return { ok: false, error: "Your account is not linked to an employee record. Ask an administrator." };
  const parsed = z.array(selfEntry).max(500).safeParse(entries);
  if (!parsed.success) return { ok: false, error: "Some entries are not valid." };
  const engine = await getEngine();
  const db = await getDb();
  const [cycle] = await db.select().from(schema.assessmentCycle).where(eq(schema.assessmentCycle.status, "open"));
  const staleBefore = Date.now() - engine.settings.staleMonths * 30.4375 * 86400e3;
  const now = new Date();
  let sent = 0, saved = 0;
  for (const e of parsed.data) {
    if (!engine.isRateable(e.skillId)) continue;
    const [cur] = await db.select().from(schema.rating)
      .where(and(eq(schema.rating.employeeId, v.employee.id), eq(schema.rating.skillId, e.skillId)));
    if (e.level == null && !cur) continue;
    const unchanged = !!cur && cur.selfLevel === e.level && cur.selfComment === e.comment;
    // Already decided by the manager (at whatever level they chose), the person has not
    // changed their own level since, and the decision is not stale: nothing to send.
    const freshValidated = !!cur && cur.status === "validated" && cur.selfLevel === e.level
      && !!cur.validatedAt && cur.validatedAt.getTime() >= staleBefore;
    let status = cur?.status ?? "draft";
    if (submit && e.level != null && !freshValidated) status = "submitted";
    else if (!unchanged && e.level != null && status !== "submitted") status = freshValidated ? "validated" : "draft";
    if (unchanged && cur?.interest === e.interest && status === cur?.status) continue;
    const values = {
      selfLevel: e.level, selfComment: e.comment.trim(), interest: e.interest,
      selfAt: unchanged ? cur?.selfAt ?? now : now, status, cycleId: cycle?.id ?? cur?.cycleId ?? null,
    };
    if (cur) {
      await db.update(schema.rating).set(values).where(and(eq(schema.rating.employeeId, v.employee.id), eq(schema.rating.skillId, e.skillId)));
    } else {
      await db.insert(schema.rating).values({ employeeId: v.employee.id, skillId: e.skillId, ...values });
    }
    if (!unchanged || status !== cur?.status) {
      await db.insert(schema.ratingEvent).values({
        employeeId: v.employee.id, skillId: e.skillId, kind: status === "submitted" ? "submit" : "self",
        level: e.level, note: e.comment, actorId: v.userId, cycleId: cycle?.id ?? null,
      });
    }
    if (status === "submitted" && cur?.status !== "submitted") sent += 1;
    saved += 1;
  }
  await audit(v, submit ? "submit_self_assessment" : "save_self_assessment", "rating", v.employee.id, { saved, sent });
  revalidatePath("/assess");
  revalidatePath(`/people/${v.employee.id}`);
  if (submit) return { ok: true, message: sent ? `Sent ${sent} rating${sent === 1 ? "" : "s"} to your manager.` : "Nothing new to send: everything is already validated." };
  return { ok: true, message: saved ? "Saved as a draft." : "No changes." };
}

const validation = z.object({
  employeeId: z.string().min(1),
  skillId: z.string().min(1),
  level: z.number().int().min(0).max(5),
  evidence: z.string().max(1000).default(""),
  comment: z.string().max(1000).default(""),
});

export async function validateRatings(items: z.input<typeof validation>[]): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  const parsed = z.array(validation).max(500).safeParse(items);
  if (!parsed.success) return { ok: false, error: "Some entries are not valid." };
  for (const it of parsed.data) {
    if (!v.reportIds.has(it.employeeId)) return { ok: false, error: "You can only validate the ratings of people you manage." };
    if (it.level >= EVIDENCE_FROM && !it.evidence.trim()) {
      return { ok: false, error: "Advanced and Expert need a line of evidence: a project, a certificate, work you have seen." };
    }
  }
  const db = await getDb();
  const now = new Date();
  for (const it of parsed.data) {
    await db.update(schema.rating).set({
      validatedLevel: it.level, validatedBy: v.userId, validatedAt: now, status: "validated",
      evidence: it.evidence.trim(), managerComment: it.comment.trim(),
    }).where(and(eq(schema.rating.employeeId, it.employeeId), eq(schema.rating.skillId, it.skillId)));
    await db.insert(schema.ratingEvent).values({
      employeeId: it.employeeId, skillId: it.skillId, kind: "validate", level: it.level,
      note: [it.evidence, it.comment].filter(Boolean).join(" · "), actorId: v.userId,
    });
  }
  await audit(v, "validate", "rating", null, { count: parsed.data.length });
  revalidatePath("/validate");
  for (const id of new Set(parsed.data.map((x) => x.employeeId))) revalidatePath(`/people/${id}`);
  return { ok: true, message: `Validated ${parsed.data.length} rating${parsed.data.length === 1 ? "" : "s"}.` };
}

export async function returnRating(input: { employeeId: string; skillId: string; comment: string }): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!v.reportIds.has(input.employeeId)) return { ok: false, error: "You can only return the ratings of people you manage." };
  if (!input.comment.trim()) return { ok: false, error: "Say what to look at again." };
  const db = await getDb();
  await db.update(schema.rating).set({ status: "returned", managerComment: input.comment.trim() })
    .where(and(eq(schema.rating.employeeId, input.employeeId), eq(schema.rating.skillId, input.skillId)));
  await db.insert(schema.ratingEvent).values({ employeeId: input.employeeId, skillId: input.skillId, kind: "return", note: input.comment, actorId: v.userId });
  await audit(v, "return_rating", "rating", input.employeeId, { skillId: input.skillId });
  revalidatePath("/validate");
  return { ok: true, message: "Sent back with your note." };
}
