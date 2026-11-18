// What each e-mail says. HTML for mail clients (tables and inline styles: Outlook ignores
// most CSS) and the same content as plain text. Every button goes through /login?next=...,
// so after single sign-on the person lands on the page the e-mail is about.

export type MailKind = "test" | "submitted" | "returned" | "validated" | "reminder" | "nudge";
export interface MailItem { skill: string; self?: number | null; validated?: number | null; target?: number | null; note?: string }
export interface Payloads {
  test: { byName: string };
  submitted: { personName: string; personTitle: string; personId: string; items: MailItem[] };
  returned: { byName: string; items: MailItem[] };
  validated: { byName: string; personId: string; items: MailItem[] };
  reminder: { cycleName: string; dueOn: string; rated: number; required: number; missing: string[]; dueSoon: boolean };
  nudge: { byName: string; note: string; rated: number; required: number; missing: string[] };
}
export interface Rendered { subject: string; html: string; text: string }
export interface RenderContext { appUrl: string; toName: string; levelName: (n: number) => string; orgName: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const deepLink = (appUrl: string, path: string) => `${appUrl}/login?next=${encodeURIComponent(path)}`;
const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
};

const C = { text: "#1f2937", muted: "#6b7280", line: "#e5e7eb", soft: "#f9fafb", brand: "#2563eb", warn: "#b45309" };

function levelCell(ctx: RenderContext, n: number | null | undefined) {
  return n == null ? `<span style="color:${C.muted}">–</span>` : `<b>${n}</b> <span style="color:${C.muted}">${esc(ctx.levelName(n))}</span>`;
}
const levelText = (ctx: RenderContext, n: number | null | undefined) => (n == null ? "–" : `${n} ${ctx.levelName(n)}`);

function table(head: string[], rows: string[][]): string {
  const th = head.map((h) => `<th align="left" style="padding:8px 10px;border-bottom:1px solid ${C.line};font-size:12px;font-weight:600;color:${C.muted};text-transform:uppercase;letter-spacing:.03em">${esc(h)}</th>`).join("");
  const tr = rows.map((r, i) => `<tr style="background:${i % 2 ? C.soft : "#ffffff"}">${r.map((c) => `<td valign="top" style="padding:8px 10px;border-bottom:1px solid ${C.line};font-size:14px;color:${C.text}">${c}</td>`).join("")}</tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${C.line};margin:16px 0">${`<tr>${th}</tr>`}${tr}</table>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px"><tr><td style="border-radius:6px;background:${C.brand}">`
    + `<a href="${esc(href)}" style="display:inline-block;padding:11px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">${esc(label)}</a>`
    + `</td></tr></table><p style="margin:0 0 4px;font-size:12px;color:${C.muted}">Or open <a href="${esc(href)}" style="color:${C.brand}">${esc(href)}</a></p>`;
}

function layout(ctx: RenderContext, o: { preheader: string; heading: string; body: string; why: string }): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.heading)}</title></head>`
    + `<body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:${C.text}">`
    + `<div style="display:none;max-height:0;overflow:hidden">${esc(o.preheader)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${C.line};border-radius:8px">`
    + `<tr><td style="padding:16px 24px;border-bottom:3px solid ${C.brand};font-size:15px;font-weight:700">Skill Management<span style="font-weight:400;color:${C.muted}"> · ${esc(ctx.orgName)}</span></td></tr>`
    + `<tr><td style="padding:24px">`
    + `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${esc(o.heading)}</h1>`
    + `<p style="margin:0 0 4px;font-size:14px">Hello ${esc(first(ctx.toName))},</p>${o.body}`
    + `</td></tr>`
    + `<tr><td style="padding:14px 24px;border-top:1px solid ${C.line};font-size:12px;color:${C.muted}">${esc(o.why)} Sign-in is with your company account (single sign-on). This is an automatic message: replies are not read.</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

const p = (html: string) => `<p style="margin:12px 0 0;font-size:14px;line-height:1.5">${html}</p>`;
const quote = (s: string) => `<div style="margin:12px 0 0;padding:10px 14px;border-left:3px solid ${C.brand};background:${C.soft};font-size:14px;white-space:pre-wrap">${esc(s)}</div>`;
const progress = (rated: number, required: number) => required
  ? `You have rated <b>${rated} of ${required}</b> skills your role requires.`
  : "Your role has no required skills yet; rate the skills you have.";
const missingList = (missing: string[]) => missing.length
  ? `<ul style="margin:8px 0 0;padding-left:20px;font-size:14px;line-height:1.6">${missing.slice(0, 10).map((m) => `<li>${esc(m)}</li>`).join("")}${missing.length > 10 ? `<li style="color:${C.muted}">and ${missing.length - 10} more</li>` : ""}</ul>`
  : "";
const textList = (missing: string[]) => missing.slice(0, 10).map((m) => `  - ${m}`).join("\n") + (missing.length > 10 ? `\n  - and ${missing.length - 10} more` : "");
const textFooter = (link: string) => `\n\nOpen: ${link}\n\nSign-in is with your company account (single sign-on). This is an automatic message: replies are not read.`;

export function render<K extends MailKind>(kind: K, data: Payloads[K], ctx: RenderContext): Rendered {
  const d = data as Payloads[MailKind];
  switch (kind) {
    case "test": {
      const x = d as Payloads["test"];
      const link = deepLink(ctx.appUrl, "/admin/email");
      return {
        subject: "Skill Management: test e-mail",
        html: layout(ctx, { preheader: "The mail relay works.", heading: "The mail relay works", why: `${x.byName} sent this test from Admin › Email.`,
          body: p("This test came through the mail relay set in Admin › Email, so the app can send approvals and reminders.") + button(link, "Open e-mail settings") }),
        text: `Hello ${first(ctx.toName)},\n\nThis test came through the mail relay set in Admin › Email, so the app can send approvals and reminders.${textFooter(link)}`,
      };
    }
    case "submitted": {
      const x = d as Payloads["submitted"];
      const link = deepLink(ctx.appUrl, `/validate?person=${encodeURIComponent(x.personId)}`);
      const n = plural(x.items.length, "skill rating");
      return {
        subject: `${x.personName} sent ${n} for your validation`,
        html: layout(ctx, {
          preheader: `${x.personName} is waiting for you to validate ${n}.`, heading: `${x.personName} sent ${n} to validate`,
          why: `You get this because ${x.personName} reports to you.`,
          body: p(`<b>${esc(x.personName)}</b>${x.personTitle ? ` (${esc(x.personTitle)})` : ""} rated these skills and sent them to you. Accept each level, change it, or send it back with a note.`)
            + table(["Skill", "Their level", "Role target", "Their comment"], x.items.map((i) => [esc(i.skill), levelCell(ctx, i.self), levelCell(ctx, i.target), i.note ? esc(i.note) : `<span style="color:${C.muted}">–</span>`]))
            + button(link, "Review and validate"),
        }),
        text: `Hello ${first(ctx.toName)},\n\n${x.personName}${x.personTitle ? ` (${x.personTitle})` : ""} rated these skills and sent them to you to validate:\n\n`
          + x.items.map((i) => `  - ${i.skill}: ${levelText(ctx, i.self)} (role target ${levelText(ctx, i.target)})${i.note ? ` - "${i.note}"` : ""}`).join("\n") + textFooter(link),
      };
    }
    case "returned": {
      const x = d as Payloads["returned"];
      const link = deepLink(ctx.appUrl, "/assess");
      const n = plural(x.items.length, "skill rating");
      return {
        subject: `${x.byName} sent back ${n} for you to look at again`,
        html: layout(ctx, {
          preheader: `${x.byName} asks you to look at ${n} again.`, heading: `${x.byName} sent back ${n}`,
          why: `You get this because ${x.byName} reviewed your self-assessment.`,
          body: p(`Your manager looked at these ratings and asks you to look at them again. Read the note, update the level or your comment, and send them again.`)
            + table(["Skill", "Your level", "Note from your manager"], x.items.map((i) => [esc(i.skill), levelCell(ctx, i.self), esc(i.note ?? "")]))
            + button(link, "Update my self-assessment"),
        }),
        text: `Hello ${first(ctx.toName)},\n\n${x.byName} sent back these ratings for you to look at again:\n\n`
          + x.items.map((i) => `  - ${i.skill} (your level ${levelText(ctx, i.self)}): "${i.note ?? ""}"`).join("\n") + textFooter(link),
      };
    }
    case "validated": {
      const x = d as Payloads["validated"];
      const link = deepLink(ctx.appUrl, `/people/${encodeURIComponent(x.personId)}`);
      const n = plural(x.items.length, "skill rating");
      const changed = x.items.filter((i) => i.self != null && i.validated != null && i.self !== i.validated).length;
      return {
        subject: `${x.byName} validated ${n}`,
        html: layout(ctx, {
          preheader: `${x.byName} validated ${n}${changed ? `, ${changed} at another level` : ""}.`, heading: `${x.byName} validated ${n}`,
          why: `You get this because ${x.byName} validated your self-assessment.`,
          body: p(changed ? `${plural(changed, "level")} differ from yours: the validated level is the one that counts. Talk to your manager if you see it differently.` : "Your manager agreed with your levels.")
            + table(["Skill", "Your level", "Validated", "Comment"], x.items.map((i) => [esc(i.skill), levelCell(ctx, i.self),
              i.self != null && i.validated != null && i.validated !== i.self ? `<span style="color:${C.warn}">${levelCell(ctx, i.validated)}</span>` : levelCell(ctx, i.validated),
              i.note ? esc(i.note) : `<span style="color:${C.muted}">–</span>`]))
            + button(link, "See my profile"),
        }),
        text: `Hello ${first(ctx.toName)},\n\n${x.byName} validated these ratings:\n\n`
          + x.items.map((i) => `  - ${i.skill}: yours ${levelText(ctx, i.self)}, validated ${levelText(ctx, i.validated)}${i.note ? ` - "${i.note}"` : ""}`).join("\n") + textFooter(link),
      };
    }
    case "reminder": {
      const x = d as Payloads["reminder"];
      const link = deepLink(ctx.appUrl, "/assess");
      const due = fmtDate(x.dueOn);
      return {
        subject: x.dueSoon ? `Reminder: your skills self-assessment is due ${due}` : `Reminder: please update your skills for ${x.cycleName}`,
        html: layout(ctx, {
          preheader: `${x.cycleName} is due ${due}.`, heading: x.dueSoon ? `Your self-assessment is due ${due}` : `Please update your skills for ${x.cycleName}`,
          why: `You get this because the assessment round “${x.cycleName}” is open and your self-assessment has not been sent yet.`,
          body: p(`The assessment round <b>${esc(x.cycleName)}</b> is open until <b>${esc(due)}</b>. ${progress(x.rated, x.required)} Rate each skill, then press <b>Submit for validation</b> so your manager can validate it.`)
            + (x.missing.length ? p("Still to rate:") + missingList(x.missing) : "")
            + button(link, "Update my skills"),
        }),
        text: `Hello ${first(ctx.toName)},\n\nThe assessment round "${x.cycleName}" is open until ${due}. ${progress(x.rated, x.required).replace(/<\/?b>/g, "")} Rate each skill, then press "Submit for validation".`
          + (x.missing.length ? `\n\nStill to rate:\n${textList(x.missing)}` : "") + textFooter(link),
      };
    }
    case "nudge": {
      const x = d as Payloads["nudge"];
      const link = deepLink(ctx.appUrl, "/assess");
      return {
        subject: `${x.byName} asks you to update your skills`,
        html: layout(ctx, {
          preheader: `${x.byName} asks you to update your skills self-assessment.`, heading: `${x.byName} asks you to update your skills`,
          why: `You get this because ${x.byName}, your manager, sent a reminder.`,
          body: (x.note ? quote(x.note) : "") + p(`${progress(x.rated, x.required)} Rate each skill, then press <b>Submit for validation</b>.`)
            + (x.missing.length ? p("Still to rate:") + missingList(x.missing) : "")
            + button(link, "Update my skills"),
        }),
        text: `Hello ${first(ctx.toName)},\n\n${x.byName} asks you to update your skills.${x.note ? `\n\n"${x.note}"` : ""}\n\n${progress(x.rated, x.required).replace(/<\/?b>/g, "")}`
          + (x.missing.length ? `\n\nStill to rate:\n${textList(x.missing)}` : "") + textFooter(link),
      };
    }
  }
  throw new Error(`unknown e-mail ${kind}`);
}
