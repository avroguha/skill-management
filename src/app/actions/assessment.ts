"use server";
// Rating your own skills, and a manager confirming them.
//  - Self and confirmed levels are separate columns; one never overwrites the other.
//  - Sending gives the manager every rating that changed since they last confirmed it.
//  - The direct manager confirms (agree, change the level, or send back with a note);
//    an administrator may step in. Nobody confirms their own ratings.
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { guardAction, audit, getEngine } from "@/lib/server";
import { notifyReturned, notifySubmitted, notifyValidated } from "@/lib/mail/notify";

export type Result = { ok: true; message?: string } | { ok: false; error: string };
/** E-mail goes out in the background: a slow or unreachable relay never holds up or fails the action. */
const inBackground = (p: Promise<unknown>) => void p.catch((e) => console.error("email: could not queue -", (e as Error).message));

const selfEntry = z.object({
  skillId: z.string().min(1),
  level: z.number().int().min(0).max(5).nullable(),
  comment: z.string().max(1000).default(""),
  interest: z.boolean().default(false),
});

function refresh(employeeId: string) {
  revalidatePath("/my-skills");
  revalidatePath("/team");
  revalidatePath("/");
  revalidatePath(`/people/${employeeId}`);
}

/**
 * Saves the person's own levels. With send: the changed ones go to the manager. A level set
 * to nothing removes a skill the person added themselves (one their role asks for stays,
 * unrated).
 */
export async function saveMySkills(entries: z.input<typeof selfEntry>[], send: boolean): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!v.employee) return { ok: false, error: "Your account is not linked to a person yet. Ask an administrator." };
  const parsed = z.array(selfEntry).max(1000).safeParse(entries);
  if (!parsed.success) return { ok: false, error: "Some entries are not valid." };
  const engine = await getEngine();
  const db = await getDb();
  const me = v.employee.id;
  const staleBefore = Date.now() - engine.settings.staleMonths * 30.4375 * 86400e3;
  const now = new Date();
  const hasManager = !!engine.empById.get(v.employee.managerId ?? "")?.active;
  let sent = 0, saved = 0, removed = 0;
  const sentIds: string[] = [];
  for (const e of parsed.data) {
    if (!engine.isRateable(e.skillId)) continue;
    const [cur] = await db.select().from(schema.rating).where(and(eq(schema.rating.employeeId, me), eq(schema.rating.skillId, e.skillId)));
    if (e.level == null) {
      if (cur && cur.validatedLevel == null) {
        await db.delete(schema.rating).where(and(eq(schema.rating.employeeId, me), eq(schema.rating.skillId, e.skillId)));
        removed += 1;
      }
      continue;
    }
    const unchanged = !!cur && cur.selfLevel === e.level && cur.selfComment === e.comment.trim();
    // Confirmed at this very level and not stale: nothing to send again.
    const fresh = !!cur && cur.status === "validated" && cur.selfLevel === e.level && !!cur.validatedAt && cur.validatedAt.getTime() >= staleBefore;
    let status = cur?.status ?? "draft";
    if (send && !fresh) status = hasManager ? "submitted" : "validated";
    else if (!unchanged && status !== "submitted") status = fresh ? "validated" : "draft";
    if (unchanged && cur?.interest === e.interest && status === cur?.status) continue;
    // Nobody above (the top of a tree): their own word stands.
    const selfConfirm = status === "validated" && !hasManager && !fresh;
    const values = {
      selfLevel: e.level, selfComment: e.comment.trim(), interest: e.interest,
      selfAt: unchanged ? cur?.selfAt ?? now : now, status,
      ...(selfConfirm ? { validatedLevel: e.level, validatedAt: now, validatedBy: v.userId } : {}),
    };
    if (cur) await db.update(schema.rating).set(values).where(and(eq(schema.rating.employeeId, me), eq(schema.rating.skillId, e.skillId)));
    else await db.insert(schema.rating).values({ employeeId: me, skillId: e.skillId, ...values });
    if (!unchanged || status !== cur?.status) {
      await db.insert(schema.ratingEvent).values({ employeeId: me, skillId: e.skillId, kind: status === "submitted" ? "submit" : "self", level: e.level, note: e.comment, actorId: v.userId });
    }
    if (status === "submitted" && cur?.status !== "submitted") { sent += 1; sentIds.push(e.skillId); }
    saved += 1;
  }
  await audit(v, send ? "send_my_skills" : "save_my_skills", "rating", me, { saved, sent, removed });
  if (sentIds.length) inBackground(notifySubmitted(db, engine, me, sentIds));
  refresh(me);
  if (send) {
    if (!hasManager) return { ok: true, message: "Saved. You have no manager in the app, so your levels count as they are." };
    return { ok: true, message: sent ? `Sent ${sent} rating${sent === 1 ? "" : "s"} to your manager.` : "Nothing new to send: your manager has confirmed everything." };
  }
  return { ok: true, message: saved || removed ? "Saved. Send them to your manager when you are ready." : "No changes." };
}

const confirmation = z.object({
  employeeId: z.string().min(1),
  skillId: z.string().min(1),
  level: z.number().int().min(0).max(5),
  comment: z.string().max(1000).default(""),
});

/** The manager agrees (or sets another level). */
export async function confirmRatings(items: z.input<typeof confirmation>[]): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  const parsed = z.array(confirmation).min(1, "Nothing to confirm.").max(2000).safeParse(items);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Some entries are not valid." };
  for (const it of parsed.data) {
    if (!v.reportIds.has(it.employeeId)) return { ok: false, error: "You can only confirm the ratings of people who report to you." };
  }
  const db = await getDb();
  const now = new Date();
  for (const it of parsed.data) {
    await db.update(schema.rating).set({
      validatedLevel: it.level, validatedBy: v.userId, validatedAt: now, status: "validated", managerComment: it.comment.trim(),
    }).where(and(eq(schema.rating.employeeId, it.employeeId), eq(schema.rating.skillId, it.skillId)));
    await db.insert(schema.ratingEvent).values({ employeeId: it.employeeId, skillId: it.skillId, kind: "validate", level: it.level, note: it.comment, actorId: v.userId });
  }
  await audit(v, "confirm", "rating", null, { count: parsed.data.length });
  inBackground(getEngine().then((engine) => notifyValidated(db, engine, parsed.data.map((i) => ({ ...i, comment: i.comment.trim() })), v.name)));
  for (const id of new Set(parsed.data.map((x) => x.employeeId))) refresh(id);
  return { ok: true, message: `Confirmed ${parsed.data.length} rating${parsed.data.length === 1 ? "" : "s"}.` };
}

/** The manager sends a rating back with a note. */
export async function returnRating(input: { employeeId: string; skillId: string; comment: string }): Promise<Result> {
  const g = await guardAction();
  if (g.fail) return g.fail;
  const v = g.v;
  if (!v.reportIds.has(input.employeeId)) return { ok: false, error: "You can only send back the ratings of people who report to you." };
  if (!input.comment.trim()) return { ok: false, error: "Say what to look at again." };
  const db = await getDb();
  await db.update(schema.rating).set({ status: "returned", managerComment: input.comment.trim() })
    .where(and(eq(schema.rating.employeeId, input.employeeId), eq(schema.rating.skillId, input.skillId)));
  await db.insert(schema.ratingEvent).values({ employeeId: input.employeeId, skillId: input.skillId, kind: "return", note: input.comment, actorId: v.userId });
  await audit(v, "return_rating", "rating", input.employeeId, { skillId: input.skillId });
  inBackground(getEngine().then((engine) => notifyReturned(db, engine, input.employeeId, input.skillId, input.comment.trim(), v.name)));
  refresh(input.employeeId);
  return { ok: true, message: "Sent back with your note." };
}
