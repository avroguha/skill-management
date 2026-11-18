// E-mail: the SMTP client and message against a stand-in relay, and each e-mail the app sends
// (approval to the manager, sent back, reminders, a manager's Remind) end to end on the demo
// organisation, through the outbox.
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { and, eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://";
process.env.SEED_DEMO = "true";
process.env.APP_URL = "https://skills.example.test";
delete process.env.DATABASE_URL;

const { getDb, closeDb, schema: s } = await import("../src/db/index.ts");
const { loadDatasetFrom } = await import("../src/lib/dataset.ts");
const { createEngine } = await import("../src/lib/engine/engine.ts");
const { sendSmtp } = await import("../src/lib/mail/smtp.ts");
const { buildMessage } = await import("../src/lib/mail/message.ts");
const { safeNext } = await import("../src/lib/safe-next.ts");
const mail = await import("../src/lib/mail/notify.ts");

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
  assert.equal(safeNext("/validate?person=abc"), "/validate?person=abc");
  for (const bad of [undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/login?next=/x", "/a\r\nSet-Cookie: x"]) {
    assert.equal(safeNext(bad), "/", String(bad));
  }
});

test("e-mails end to end: approval to the manager, sent back as one e-mail, reminders on the day, Remind once a day", async () => {
  const relay = await fakeRelay();
  const db = await getDb();
  try {
    await mail.writeEmailSettings(db, { ...mail.DEFAULT_EMAIL, enabled: true, host: "127.0.0.1", port: relay.port, security: "none", fromAddress: "skills@example.test" });
    let engine = createEngine(await loadDatasetFrom(db));
    const emp = [...engine.empById.values()].find((e) => e.active && engine.ratingsOf(e.id).length >= 2 && mail.approverOf(engine, e) && !engine.isTop(e))!;
    const mgr = mail.approverOf(engine, emp)!;
    const skills = engine.ratingsOf(emp.id).slice(0, 2).map((r) => r.skillId);

    // 1. sent for validation: the manager gets the skills and a link through sign-in to this person's queue
    await mail.notifySubmitted(db, engine, emp.id, skills);
    await until(() => relay.received.length === 1);
    const approval = relay.received[0];
    assert.deepEqual(approval.to, [mgr.email]);
    assert.match(decodeSubject(approval.data), new RegExp(`^${emp.name} sent 2 skill ratings for your validation$`));
    const html = part(approval.data, "text/html");
    assert.ok(html.includes(`https://skills.example.test/login?next=${encodeURIComponent(`/validate?person=${emp.id}`)}`), "deep link to the validation page");
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
    assert.ok(backHtml.includes(`login?next=${encodeURIComponent("/assess")}`));

    // 3. reminders: someone has to look at a rating again, so they still need to send it
    await db.update(s.rating).set({ status: "returned" }).where(and(eq(s.rating.employeeId, emp.id), eq(s.rating.skillId, skills[0])));
    engine = createEngine(await loadDatasetFrom(db));
    const expected = [...engine.empById.values()].filter((e) => e.active && mail.assessmentState(engine, e).needsUpdate && /@/.test(e.email)).length;
    assert.ok(expected >= 1);
    // Monday 16 Nov 2026: 09:30 in New York is too early; 10:30 is the time
    assert.equal(await mail.remindersIfDue(db, engine, new Date("2026-11-16T14:30:00Z")), 0);
    assert.equal(await mail.remindersIfDue(db, engine, new Date("2026-11-16T15:30:00Z")), expected);
    assert.equal(await mail.remindersIfDue(db, engine, new Date("2026-11-16T18:00:00Z")), 0, "once a day");
    assert.equal(await mail.remindersIfDue(db, engine, new Date("2026-11-17T15:30:00Z")), 0, "Tuesday: not the weekly day, not 3 days before");
    // three days before 15 December, whatever the weekday
    assert.equal(await mail.remindersIfDue(db, engine, new Date("2026-12-12T15:30:00Z")), expected);
    const dueSoon = await db.select().from(s.emailMessage).where(and(eq(s.emailMessage.kind, "reminder"), eq(s.emailMessage.employeeId, emp.id)));
    assert.equal(dueSoon.length, 2);
    assert.ok(dueSoon.some((m) => (m.payload as { dueSoon: boolean }).dueSoon));
    const pending = async () => (await db.select().from(s.emailMessage).where(eq(s.emailMessage.status, "pending"))).length;
    await until(async () => { await mail.processOutbox(db); return (await pending()) === 0; }, 15000);
    const reminder = relay.received.find((r) => r.to[0] === emp.email && /^Reminder: your skills self-assessment is due/.test(decodeSubject(r.data)))!;
    const remindHtml = part(reminder.data, "text/html");
    assert.ok(remindHtml.includes("2026 H2 assessment") && remindHtml.includes("December 15, 2026"));

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
