// E-mail: settings (Admin › Email), the outbox, and the moments the app writes to people.
//
//   submitted  to the person's manager, each time they send ratings for validation
//   returned   to the person, when their manager sends ratings back with a note
//   validated  to the person, when their manager validates ratings
//   reminder   to the person, while an assessment round is open and they have not sent it:
//              weekly, and a few days before it is due, at a set hour in a set time zone
//   nudge      to the person, when their manager presses Remind on My team
//
// Nothing is sent from inside a user's action: the action writes to the outbox, and the
// outbox is sent by one worker (a lease), straight away and then every minute. Returns and
// validations wait two minutes, so a manager's sitting becomes one e-mail, not one per skill.
// A failed send is tried again three times, then kept as failed with the relay's answer.
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import type { DB } from "../../db/index.ts";
import * as s from "../../db/schema.ts";
import type { Employee, Engine } from "../engine/engine.ts";
import { withLease } from "../lease.ts";
import { sendSmtp, type SmtpSecurity } from "./smtp.ts";
import { buildMessage, isEmail } from "./message.ts";
import { render, type MailItem, type MailKind, type Payloads } from "./templates.ts";

export interface EmailSettings {
  enabled: boolean;
  host: string;
  port: number;
  security: SmtpSecurity;
  fromAddress: string;
  fromName: string;
  replyTo: string;
  send: { submitted: boolean; returned: boolean; validated: boolean; reminders: boolean; nudge: boolean };
  /** reminders go out at sendHour in this time zone */
  timeZone: string;
  sendHour: number;
  /** 0 Sunday … 6 Saturday */
  weeklyDay: number;
  daysBeforeDue: number;
}

export const DEFAULT_EMAIL: EmailSettings = {
  enabled: false, host: "", port: 25, security: "starttls", fromAddress: "", fromName: "Skill Management", replyTo: "",
  send: { submitted: true, returned: true, validated: true, reminders: true, nudge: true },
  timeZone: "America/New_York", sendHour: 10, weeklyDay: 1, daysBeforeDue: 3,
};

const KEY = "email";
const BATCH_MS = 2 * 60e3;
const MAX_ATTEMPTS = 3;

export async function readEmailSettings(db: DB): Promise<EmailSettings> {
  const [row] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, KEY));
  const v = (row?.value ?? {}) as Partial<EmailSettings>;
  return { ...DEFAULT_EMAIL, ...v, send: { ...DEFAULT_EMAIL.send, ...(v.send ?? {}) } };
}

export async function writeEmailSettings(db: DB, v: EmailSettings): Promise<void> {
  await db.insert(s.appSetting).values({ key: KEY, value: v }).onConflictDoUpdate({ target: s.appSetting.key, set: { value: v } });
}

export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

/** The date, hour and weekday in a time zone (reminders follow the organisation's clock, not the server's). */
export function localParts(now: Date, timeZone: string): { date: string; hour: number; weekday: number } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
export function validTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400e3);

// ---- the outbox ------------------------------------------------------------------------------

interface Outgoing<K extends MailKind> { kind: K; employeeId: string | null; to: { email: string; name: string }; payload: Payloads[K]; dedupeKey?: string; sendAfter?: Date }

/** Writes an e-mail to the outbox. False when there is no usable address, or it was already written (dedupeKey). */
export async function enqueue<K extends MailKind>(db: DB, m: Outgoing<K>): Promise<boolean> {
  if (!isEmail(m.to.email)) return false;
  const rows = await db.insert(s.emailMessage).values({
    kind: m.kind, employeeId: m.employeeId, toEmail: m.to.email, toName: m.to.name, payload: m.payload,
    dedupeKey: m.dedupeKey ?? null, sendAfter: m.sendAfter ?? new Date(),
  }).onConflictDoNothing().returning({ id: s.emailMessage.id });
  return rows.length > 0;
}

/** Adds skills to an e-mail still waiting to go to this person, or writes a new one; either way it waits BATCH_MS more. */
async function enqueueBatched(db: DB, kind: "returned" | "validated", employeeId: string, to: { email: string; name: string }, base: Omit<Payloads["returned"], "items"> & { personId?: string }, items: MailItem[]) {
  if (!isEmail(to.email)) return;
  const sendAfter = new Date(Date.now() + BATCH_MS);
  const [open] = await db.select().from(s.emailMessage).where(and(eq(s.emailMessage.kind, kind), eq(s.emailMessage.employeeId, employeeId), eq(s.emailMessage.status, "pending"), eq(s.emailMessage.toEmail, to.email)));
  if (open) {
    const was = open.payload as { items?: MailItem[] };
    const merged = [...(was.items ?? []).filter((i) => !items.some((n) => n.skill === i.skill)), ...items];
    await db.update(s.emailMessage).set({ payload: { ...was, ...base, items: merged }, sendAfter }).where(eq(s.emailMessage.id, open.id));
  } else {
    await enqueue(db, { kind, employeeId, to, payload: { ...base, items } as Payloads[typeof kind], sendAfter });
  }
}

/** Sends what is due. One worker at a time; safe to call often. */
export async function processOutbox(db: DB, now = new Date()): Promise<number> {
  const settings = await readEmailSettings(db);
  if (!settings.enabled || !settings.host || !isEmail(settings.fromAddress)) return 0;
  const sent = await withLease(db, "email-outbox", 5 * 60e3, async () => {
    const due = await db.select().from(s.emailMessage)
      .where(and(eq(s.emailMessage.status, "pending"), lte(s.emailMessage.sendAfter, now)))
      .orderBy(asc(s.emailMessage.sendAfter)).limit(100);
    if (!due.length) return 0;
    const ctx = await renderContext(db);
    let n = 0;
    for (const m of due) {
      let subject = m.subject;
      try {
        const r = render(m.kind as MailKind, m.payload as never, { ...ctx, toName: m.toName || m.toEmail });
        subject = r.subject;
        await sendSmtp(settings, settings.fromAddress, [m.toEmail], buildMessage({
          from: { email: settings.fromAddress, name: settings.fromName }, to: [{ email: m.toEmail, name: m.toName }],
          replyTo: isEmail(settings.replyTo) ? settings.replyTo : undefined, subject: r.subject, html: r.html, text: r.text,
        }));
        await db.update(s.emailMessage).set({ status: "sent", subject, sentAt: new Date(), error: "", attempts: m.attempts + 1 }).where(eq(s.emailMessage.id, m.id));
        n++;
      } catch (e) {
        const attempts = m.attempts + 1;
        await db.update(s.emailMessage).set({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", subject, attempts, error: (e as Error).message.slice(0, 500),
          sendAfter: new Date(Date.now() + attempts * 10 * 60e3),
        }).where(eq(s.emailMessage.id, m.id));
      }
    }
    return n;
  });
  return sent ?? 0;
}

/** Sends now, in the background; anything left is picked up by the minute timer. */
export function kickOutbox(db: DB): void {
  void processOutbox(db).catch((e) => console.error("email: sending failed -", (e as Error).message));
}

async function renderContext(db: DB) {
  const levels = await db.select().from(s.proficiencyLevel);
  const names = new Map(levels.map((l) => [l.level, l.name]));
  return { appUrl: appUrl(), levelName: (n: number) => names.get(n) ?? String(n), orgName: process.env.ORG_NAME || "Skills" };
}

/** A test e-mail, sent straight away so the page can show the relay's answer. */
export async function sendTestEmail(db: DB, settings: EmailSettings, to: string, byName: string): Promise<string> {
  if (!isEmail(to)) throw new Error("Give an e-mail address to send the test to.");
  if (!settings.host) throw new Error("Set the mail relay first.");
  if (!isEmail(settings.fromAddress)) throw new Error("Set the sender address first.");
  const r = render("test", { byName }, { ...(await renderContext(db)), toName: byName });
  const [row] = await db.insert(s.emailMessage).values({ kind: "test", toEmail: to, toName: byName, payload: { byName }, subject: r.subject, attempts: 1 }).returning();
  try {
    const { response } = await sendSmtp(settings, settings.fromAddress, [to], buildMessage({
      from: { email: settings.fromAddress, name: settings.fromName }, to: [{ email: to }],
      replyTo: isEmail(settings.replyTo) ? settings.replyTo : undefined, subject: r.subject, html: r.html, text: r.text,
    }));
    await db.update(s.emailMessage).set({ status: "sent", sentAt: new Date() }).where(eq(s.emailMessage.id, row.id));
    return response;
  } catch (e) {
    await db.update(s.emailMessage).set({ status: "failed", error: (e as Error).message.slice(0, 500) }).where(eq(s.emailMessage.id, row.id));
    throw e;
  }
}

export async function recentEmails(db: DB, limit = 50) {
  return db.select().from(s.emailMessage).orderBy(desc(s.emailMessage.createdAt)).limit(limit);
}

// ---- who, and how far they are ------------------------------------------------------------------

/** Whom a person's ratings go to: their manager, else the manager of their unit (never themselves). */
export function approverOf(engine: Engine, emp: Employee): Employee | null {
  const ok = (e: Employee | undefined): e is Employee => !!e && e.active && e.id !== emp.id && isEmail(e.email);
  const direct = emp.managerId ? engine.empById.get(emp.managerId) : undefined;
  if (ok(direct)) return direct;
  const unitMgr = emp.unitId ? engine.unitById.get(emp.unitId)?.managerId : null;
  const viaUnit = unitMgr ? engine.empById.get(unitMgr) : undefined;
  return ok(viaUnit) ? viaUnit : null;
}

/** How far a person's self-assessment has got, and whether it still needs them. */
export function assessmentState(engine: Engine, emp: Employee) {
  const cells = engine.personProfile(emp).cells;
  const required = cells.filter((c) => c.target != null && c.mandatory);
  const rated = required.filter((c) => c.selfLevel != null).length;
  const started = cells.some((c) => c.selfLevel != null);
  const returned = cells.some((c) => c.status === "returned");
  const drafts = cells.some((c) => c.status === "draft");
  return {
    rated, required: required.length,
    missing: required.filter((c) => c.selfLevel == null).map((c) => engine.skillLabel(c.skillId)).sort(),
    needsUpdate: !engine.isTop(emp) && (returned || drafts || !started || rated < required.length),
  };
}

// ---- the moments --------------------------------------------------------------------------------

async function ratingsOf(db: DB, employeeId: string, skillIds: string[]) {
  if (!skillIds.length) return [];
  return db.select().from(s.rating).where(and(eq(s.rating.employeeId, employeeId), inArray(s.rating.skillId, skillIds)));
}

/** A person sent ratings for validation: their manager is told, with the levels and comments. */
export async function notifySubmitted(db: DB, engine: Engine, employeeId: string, skillIds: string[]): Promise<void> {
  const settings = await readEmailSettings(db);
  if (!settings.enabled || !settings.send.submitted || !skillIds.length) return;
  const emp = engine.empById.get(employeeId);
  if (!emp) return;
  const mgr = approverOf(engine, emp);
  if (!mgr) return;
  const rows = await ratingsOf(db, employeeId, skillIds);
  const items: MailItem[] = rows.map((r) => ({ skill: engine.skillLabel(r.skillId), self: r.selfLevel, target: engine.targetFor(emp, r.skillId)?.target ?? null, note: r.selfComment }))
    .sort((a, b) => a.skill.localeCompare(b.skill));
  if (!items.length) return;
  await enqueue(db, { kind: "submitted", employeeId, to: { email: mgr.email, name: mgr.name }, payload: { personName: emp.name, personTitle: emp.title, personId: emp.id, items } });
  kickOutbox(db);
}

/** A manager sent a rating back: the person is told why (several in one sitting become one e-mail). */
export async function notifyReturned(db: DB, engine: Engine, employeeId: string, skillId: string, note: string, byName: string): Promise<void> {
  const settings = await readEmailSettings(db);
  if (!settings.enabled || !settings.send.returned) return;
  const emp = engine.empById.get(employeeId);
  if (!emp?.active) return;
  const [r] = await ratingsOf(db, employeeId, [skillId]);
  await enqueueBatched(db, "returned", employeeId, { email: emp.email, name: emp.name }, { byName }, [{ skill: engine.skillLabel(skillId), self: r?.selfLevel ?? null, note }]);
}

/** A manager validated ratings: each person is told the levels (one e-mail per person per sitting). */
export async function notifyValidated(db: DB, engine: Engine, items: { employeeId: string; skillId: string; level: number; comment: string }[], byName: string): Promise<void> {
  const settings = await readEmailSettings(db);
  if (!settings.enabled || !settings.send.validated) return;
  const byPerson = new Map<string, typeof items>();
  for (const i of items) byPerson.set(i.employeeId, [...(byPerson.get(i.employeeId) ?? []), i]);
  for (const [employeeId, list] of byPerson) {
    const emp = engine.empById.get(employeeId);
    if (!emp?.active) continue;
    const rows = await ratingsOf(db, employeeId, list.map((i) => i.skillId));
    const self = new Map(rows.map((r) => [r.skillId, r.selfLevel]));
    await enqueueBatched(db, "validated", employeeId, { email: emp.email, name: emp.name }, { byName, personId: emp.id },
      list.map((i) => ({ skill: engine.skillLabel(i.skillId), self: self.get(i.skillId) ?? null, validated: i.level, note: i.comment })));
  }
}

/** A manager's Remind: one e-mail per person per day at most. */
export async function nudgePeople(db: DB, engine: Engine, people: Employee[], byName: string, note: string, now = new Date()) {
  const settings = await readEmailSettings(db);
  const out = { sent: 0, already: 0, noEmail: 0, upToDate: 0 };
  if (!settings.enabled || !settings.send.nudge) throw new Error("E-mail reminders are switched off. An administrator can switch them on in Admin › Email.");
  const day = localParts(now, settings.timeZone).date;
  for (const emp of people) {
    const st = assessmentState(engine, emp);
    if (!st.needsUpdate) { out.upToDate++; continue; }
    if (!isEmail(emp.email)) { out.noEmail++; continue; }
    const fresh = await enqueue(db, {
      kind: "nudge", employeeId: emp.id, to: { email: emp.email, name: emp.name }, dedupeKey: `nudge:${emp.id}:${day}`,
      payload: { byName, note: note.trim(), rated: st.rated, required: st.required, missing: st.missing },
    });
    if (fresh) out.sent++; else out.already++;
  }
  if (out.sent) kickOutbox(db);
  return out;
}

/**
 * While an assessment round is open: from sendHour (organisation time) on the weekly day, and on
 * the day daysBeforeDue before it is due, everyone who still has to send their self-assessment
 * gets a reminder. Runs once a day; the dedupe key makes a second run harmless anyway.
 */
export async function remindersIfDue(db: DB, engine: Engine, now = new Date()): Promise<number> {
  const settings = await readEmailSettings(db);
  if (!settings.enabled || !settings.send.reminders) return 0;
  const local = localParts(now, settings.timeZone);
  if (local.hour < settings.sendHour) return 0;
  const [done] = await db.select().from(s.appSetting).where(eq(s.appSetting.key, "email_reminders"));
  if ((done?.value as { day?: string } | undefined)?.day === local.date) return 0;
  const queued = await withLease(db, "email-reminders", 10 * 60e3, async () => {
    const [cycle] = await db.select().from(s.assessmentCycle).where(eq(s.assessmentCycle.status, "open"));
    let n = 0;
    if (cycle) {
      const untilDue = daysBetween(local.date, cycle.dueOn);
      const dueSoon = untilDue === settings.daysBeforeDue;
      if ((local.weekday === settings.weeklyDay && untilDue >= 0) || dueSoon) {
        for (const emp of engine.empById.values()) {
          if (!emp.active || !isEmail(emp.email)) continue;
          const st = assessmentState(engine, emp);
          if (!st.needsUpdate) continue;
          if (await enqueue(db, {
            kind: "reminder", employeeId: emp.id, to: { email: emp.email, name: emp.name }, dedupeKey: `reminder:${cycle.id}:${emp.id}:${local.date}`,
            payload: { cycleName: cycle.name, dueOn: cycle.dueOn, rated: st.rated, required: st.required, missing: st.missing, dueSoon },
          })) n++;
        }
      }
    }
    await db.insert(s.appSetting).values({ key: "email_reminders", value: { day: local.date, queued: n } })
      .onConflictDoUpdate({ target: s.appSetting.key, set: { value: { day: local.date, queued: n } } });
    return n;
  });
  if (queued) kickOutbox(db);
  return queued ?? 0;
}
