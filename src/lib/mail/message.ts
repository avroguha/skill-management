// A multipart e-mail: an HTML part and a plain-text part (for clients that do not show HTML),
// UTF-8 throughout, base64 bodies (no line-length or 8-bit worries on any relay).
import crypto from "node:crypto";

export interface Address { email: string; name?: string }
export interface Message { from: Address; to: Address[]; replyTo?: string; subject: string; html: string; text: string }

const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** RFC 2047 encoded words, split so none is longer than the standard allows. */
export function encodeHeader(value: string): string {
  if (isAscii(value)) return value;
  const words: string[] = [];
  let chunk = "";
  for (const ch of value) {
    if (Buffer.byteLength(chunk + ch) > 45) { words.push(chunk); chunk = ""; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w).toString("base64")}?=`).join("\r\n ");
}

export function formatAddress(a: Address): string {
  if (!a.name) return `<${a.email}>`;
  const name = isAscii(a.name) ? `"${a.name.replace(/["\\]/g, "\\$&")}"` : encodeHeader(a.name);
  return `${name} <${a.email}>`;
}

const base64Lines = (s: string) => (Buffer.from(s, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");

export function buildMessage(m: Message, now = new Date()): string {
  const boundary = `skm-${crypto.randomBytes(12).toString("hex")}`;
  const domain = m.from.email.split("@")[1] || "localhost";
  const headers = [
    `From: ${formatAddress(m.from)}`,
    `To: ${m.to.map(formatAddress).join(", ")}`,
    ...(m.replyTo ? [`Reply-To: <${m.replyTo}>`] : []),
    `Subject: ${encodeHeader(m.subject)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    // an automatic message: out-of-office replies are not sent back to it
    "Auto-Submitted: auto-generated",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type: string, body: string) => [
    `--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", base64Lines(body),
  ].join("\r\n");
  return [...headers, "", part("text/plain", m.text), part("text/html", m.html), `--${boundary}--`, ""].join("\r\n");
}

export const isEmail = (x: string) => /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]+$/.test(x);
