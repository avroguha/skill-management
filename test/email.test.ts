// E-mail: the SMTP client and message against a stand-in relay, and each e-mail the app sends
// (approval to the manager, sent back, reminders, a manager's Remind) end to end on the demo
// organisation, through the outbox.
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { and, eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://";
process.env.APP_URL = "https://skills.example.test";
delete process.env.DATABASE_URL;

const { getDb, closeDb, schema: s } = await import("../src/db/index.ts");
const { loadDatasetFrom } = await import("../src/lib/dataset.ts");
const { createEngine } = await import("../src/lib/engine/engine.ts");
const { sendSmtp } = await import("../src/lib/mail/smtp.ts");
const { buildMessage } = await import("../src/lib/mail/message.ts");
const { safeNext } = await import("../src/lib/safe-next.ts");
const mail = await import("../src/lib/mail/notify.ts");
const { previewEmails, PREVIEW_KINDS } = await import("../src/lib/mail/preview.ts");

test.after(() => closeDb());

type Received = { from: string; to: string[]; data: string };
/** A relay that accepts everything (or refuses recipients), records what it got, offers no STARTTLS. */
async function fakeRelay(opts: { refuseRcpt?: boolean } = {}) {
  const received: Received[] = [];
  const server = net.createServer((sock) => {
    let buf = "", inData = false;
    let cur: Received = { from: "", to: [], data: "" };
    sock.on("error", () => undefined);
    sock.write("220 relay.test ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          cur.data = buf.slice(0, end);
          buf = buf.slice(end + 5);
          received.push(cur);
          cur = { from: "", to: [], data: "" };
          inData = false;
          sock.write("250 2.0.0 queued as TEST1\r\n");
          continue;
        }
        const i = buf.indexOf("\r\n");
        if (i < 0) return;
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        let m: RegExpMatchArray | null;
        if (/^EHLO /i.test(line)) sock.write("250-relay.test\r\n250-SIZE 10000000\r\n250 8BITMIME\r\n");
        else if ((m = line.match(/^MAIL FROM:<(.*)>$/i))) { cur.from = m[1]; sock.write("250 OK\r\n"); }
        else if ((m = line.match(/^RCPT TO:<(.*)>$/i))) {
          if (opts.refuseRcpt) sock.write("550 5.7.1 Relaying denied\r\n");
          else { cur.to.push(m[1]); sock.write("250 OK\r\n"); }
        } else if (/^DATA$/i.test(line)) { inData = true; sock.write("354 End data with <CR><LF>.<CR><LF>\r\n"); }
        else if (/^QUIT$/i.test(line)) { sock.write("221 bye\r\n"); sock.end(); }
        else sock.write("502 5.5.2 not recognised\r\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { port: (server.address() as net.AddressInfo).port, received, close: () => new Promise<void>((r) => server.close(() => r())) };
}

/** The decoded text of one MIME part. */
function part(raw: string, type: "text/html" | "text/plain"): string {
  const boundary = /boundary="([^"]+)"/.exec(raw)![1];
  const p = raw.split(`--${boundary}`).find((x) => x.includes(`Content-Type: ${type}`))!;
  return Buffer.from(p.split("\r\n\r\n")[1].replace(/\s+/g, ""), "base64").toString("utf8");
}
const decodeSubject = (raw: string) => /^Subject: (.*(?:\r\n .*)*)/m.exec(raw)![1].split(/\r\n /)
  .map((w) => { const m = /^=\?UTF-8\?B\?(.*)\?=$/.exec(w); return m ? Buffer.from(m[1], "base64").toString("utf8") : w; }).join("");

async function until(cond: () => boolean | Promise<boolean>, ms = 5000) {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 25));
  }
}

test("SMTP: a multipart UTF-8 message reaches the relay; a leading dot cannot end it early", async () => {
  const relay = await fakeRelay();
  try {
    const raw = buildMessage({ from: { email: "skills@example.test", name: "Skill Management" }, to: [{ email: "ana@example.test", name: "Ana Núñez" }], subject: "Revisión ✓ — 3 skills", html: "<p>Hello <b>Ana</b></p>", text: "Hello Ana" });
    const r = await sendSmtp({ host: "127.0.0.1", port: relay.port, security: "starttls" }, "skills@example.test", ["ana@example.test"], raw);
    assert.match(r.response, /^250/);
    const got = relay.received[0];
    assert.equal(got.from, "skills@example.test");
    assert.deepEqual(got.to, ["ana@example.test"]);
    assert.equal(decodeSubject(got.data), "Revisión ✓ — 3 skills");
    assert.match(got.data, /^To: =\?UTF-8\?B\?/m, "a non-ASCII name is encoded");
    assert.equal(part(got.data, "text/html"), "<p>Hello <b>Ana</b></p>");
    assert.equal(part(got.data, "text/plain"), "Hello Ana");

    await sendSmtp({ host: "127.0.0.1", port: relay.port, security: "none" }, "a@example.test", ["b@example.test"], "Subject: x\r\n\r\nline\r\n.hidden\r\n.\r\nafter");
    assert.match(relay.received[1].data, /\r\n\.\.hidden\r\n\.\.\r\nafter$/);
  } finally {
    await relay.close();
  }
});

test("SMTP: the relay's refusal, a missing STARTTLS and a closed port come back as readable errors", async () => {
  const refusing = await fakeRelay({ refuseRcpt: true });
  try {
    await assert.rejects(sendSmtp({ host: "127.0.0.1", port: refusing.port, security: "none" }, "a@example.test", ["b@example.test"], "x"), /refused the recipient b@example\.test: 550 5\.7\.1 Relaying denied/);
    await assert.rejects(sendSmtp({ host: "127.0.0.1", port: refusing.port, security: "starttls-required" }, "a@example.test", ["b@example.test"], "x"), /does not offer STARTTLS/);
  } finally {
    await refusing.close();
  }
  const port = refusing.port; // closed now
  await assert.rejects(sendSmtp({ host: "127.0.0.1", port, security: "none", timeoutMs: 3000 }, "a@example.test", ["b@example.test"], "x"), /Nothing answers|closed|did not answer/);
});

test("after sign-in only a path inside the app is followed", () => {
  assert.equal(safeNext("/team?tab=confirm&person=abc"), "/team?tab=confirm&person=abc");
  for (const bad of [undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/login?next=/x", "/a\r\nSet-Cookie: x"]) {
    assert.equal(safeNext(bad), "/", String(bad));
  }
});

test("every e-mail renders: a subject, a full HTML page with its button, and a plain-text twin", () => {
  const all = previewEmails({ appUrl: "https://skills.example.test", levelName: (n) => ["No Exposure", "Awareness", "Working", "Proficient", "Advanced", "Expert"][n] ?? String(n), orgName: "Avro" });
  assert.equal(all.length, PREVIEW_KINDS.length);
  for (const m of all) {
    assert.ok(m.subject.length > 5, m.kind);
    assert.match(m.html, /^<!DOCTYPE html>/, m.kind);
    assert.match(m.html, /href="https:\/\/skills\.example\.test\/login\?next=/, `${m.kind}: the button goes through sign-in`);
    assert.doesNotMatch(m.html + m.text + m.subject, /undefined|NaN|\[object Object\]/, m.kind);
    assert.doesNotMatch(m.text, /<[a-z/]/i, `${m.kind}: no markup in the plain text`);
    assert.equal((m.html.match(/<table/g) ?? []).length, (m.html.match(/<\/table>/g) ?? []).length, `${m.kind}: tables closed`);
  }
});

test("e-mails end to end: to the manager, sent back as one e-mail, weekly reminders and digests, Remind once a day", async () => {
  const relay = await fakeRelay();
  const db = await getDb("demo"); // the made-up organisation: people, managers and ratings to write about
  try {
    await mail.writeEmailSettings(db, { ...mail.DEFAULT_EMAIL, enabled: true, host: "127.0.0.1", port: relay.port, security: "none", fromAddress: "skills@example.test" });
    let engine = createEngine(await loadDatasetFrom(db));
    const emp = [...engine.empById.values()].find((e) => e.active && engine.assesses(e) && engine.ratingsOf(e.id).length >= 2 && mail.approverOf(engine, e))!;
    const mgr = mail.approverOf(engine, emp)!;
    const skills = engine.ratingsOf(emp.id).slice(0, 2).map((r) => r.skillId);

    // 1. sent to confirm: the manager gets the skills and a link through sign-in to this person's ratings
    await mail.notifySubmitted(db, engine, emp.id, skills);
    await until(() => relay.received.length === 1);
    const approval = relay.received[0];
    assert.deepEqual(approval.to, [mgr.email]);
    assert.match(decodeSubject(approval.data), new RegExp(`^${emp.name} sent 2 skill ratings for you to confirm$`));
    const html = part(approval.data, "text/html");
    assert.ok(html.includes(`https://skills.example.test/login?next=${encodeURIComponent(`/team?tab=confirm&person=${emp.id}`)}`), "deep link to confirming");
    for (const sid of skills) assert.ok(html.includes(engine.skillLabel(sid).replace(/&/g, "&amp;")), "each skill is listed");
    await until(async () => (await db.select().from(s.emailMessage).where(eq(s.emailMessage.kind, "submitted")))[0]?.status === "sent");

    // 2. two ratings sent back in one sitting: one e-mail, after the short wait
    await mail.notifyReturned(db, engine, emp.id, skills[0], "Which project was this?", mgr.name);
    await mail.notifyReturned(db, engine, emp.id, skills[1], "Add the certificate, please.", mgr.name);
    const waiting = await db.select().from(s.emailMessage).where(and(eq(s.emailMessage.kind, "returned"), eq(s.emailMessage.status, "pending")));
    assert.equal(waiting.length, 1);
    assert.equal((waiting[0].payload as { items: unknown[] }).items.length, 2);
    assert.equal(await mail.processOutbox(db), 0, "not before the wait is over");
    await until(async () => { await mail.processOutbox(db, new Date(Date.now() + 3 * 60e3)); return relay.received.length === 2; });
    const back = relay.received[1];
    assert.deepEqual(back.to, [emp.email]);
    const backHtml = part(back.data, "text/html");
    assert.ok(backHtml.includes("Which project was this?") && backHtml.includes("Add the certificate, please."));
    assert.ok(backHtml.includes(`login?next=${encodeURIComponent("/my-skills")}`));

    // 3. weekly: a reminder to everyone with something left to do, a digest to every manager
    //    with something waiting - on the weekly day, from the hour, once
    await db.update(s.rating).set({ status: "returned" }).where(and(eq(s.rating.employeeId, emp.id), eq(s.rating.skillId, skills[0])));
    engine = createEngine(await loadDatasetFrom(db));
    const people = engine.activeEmployees.filter((e) => /@/.test(e.email));
    const reminders = people.filter((e) => mail.assessmentState(engine, e).needsUpdate).length;
    const digests = people.filter((e) => engine.isManager(e)).filter((e) => { const d = mail.digestFor(engine, e); return d.waitingRatings > 0 || d.notStarted.length > 0; }).length;
    assert.ok(reminders >= 1 && digests >= 1, `${reminders} reminders, ${digests} digests`);
    // Monday 16 Nov 2026: 09:30 in New York is too early; 10:30 is the time
    assert.equal(await mail.remindersIfDue(db, engine, new Date("2026-11-16T14:30:00Z")), 0);
    assert.equal(await mail.remindersIfDue(db, engine, new Date("2026-11-16T15:30:00Z")), reminders + digests);
    assert.equal(await mail.remindersIfDue(db, engine, new Date("2026-11-16T18:00:00Z")), 0, "once a day");
    assert.equal(await mail.remindersIfDue(db, engine, new Date("2026-11-17T15:30:00Z")), 0, "Tuesday: not the weekly day");
    assert.equal(await mail.remindersIfDue(db, engine, new Date("2026-11-23T15:30:00Z")), reminders + digests, "the next Monday, again");
    const pending = async () => (await db.select().from(s.emailMessage).where(eq(s.emailMessage.status, "pending"))).length;
    await until(async () => { await mail.processOutbox(db); return (await pending()) === 0; }, 30000);
    const reminder = relay.received.find((r) => r.to[0] === emp.email && /^Reminder: your manager sent back/.test(decodeSubject(r.data)))!;
    assert.ok(reminder, "the person with a rating sent back is told so");
    assert.ok(part(reminder.data, "text/html").includes(`login?next=${encodeURIComponent("/my-skills")}`));
    const digest = relay.received.find((r) => r.to[0] === mgr.email && /^Your team's skills: /.test(decodeSubject(r.data)));
    assert.ok(digest, "their manager gets the weekly digest");
    const dHtml = part(digest!.data, "text/html");
    assert.ok(dHtml.includes(`login?next=${encodeURIComponent("/team?tab=confirm")}`) || dHtml.includes(`login?next=${encodeURIComponent("/team")}`));

    // 4. a manager's Remind: once per person per day
    const first = await mail.nudgePeople(db, engine, [emp], mgr.name, "By Friday, please.");
    assert.equal(first.sent, 1);
    const again = await mail.nudgePeople(db, engine, [emp], mgr.name, "");
    assert.deepEqual([again.sent, again.already], [0, 1]);

    // switched off: nothing is written
    await mail.writeEmailSettings(db, { ...mail.DEFAULT_EMAIL, enabled: false });
    const before = (await db.select().from(s.emailMessage)).length;
    await mail.notifySubmitted(db, engine, emp.id, skills);
    assert.equal((await db.select().from(s.emailMessage)).length, before);
  } finally {
    await relay.close();
  }
});
