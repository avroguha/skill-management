// A small SMTP client for a company mail relay: plain SMTP on port 25 (an open relay inside
// the network), STARTTLS when the relay offers it, or TLS from the start (port 465). No
// sign-in: relays that accept the app's server do not ask for one.
//
// Built on node:net and node:tls rather than a mail library, so the image gains no package.
// The relay's certificate is checked against the system's CAs (certs/*.crt are added to them
// at build time); "none" never starts TLS, for relays without a certificate the server trusts.
import net from "node:net";
import tls from "node:tls";
import os from "node:os";

export type SmtpSecurity = "none" | "starttls" | "starttls-required" | "tls";
export interface SmtpOptions { host: string; port: number; security: SmtpSecurity; heloName?: string; timeoutMs?: number }

export class SmtpError extends Error {
  readonly code?: number;
  constructor(message: string, code?: number) { super(message); this.code = code; }
}

interface Reply { code: number; lines: string[] }

/** Sends one message (already MIME-encoded) to the given recipients. */
export async function sendSmtp(o: SmtpOptions, from: string, to: string[], message: string): Promise<{ response: string }> {
  if (!o.host) throw new SmtpError("No mail relay is set.");
  if (!to.length) throw new SmtpError("No recipient.");
  const timeout = o.timeoutMs ?? 20_000;
  const helo = o.heloName || os.hostname() || "localhost";
  const servername = net.isIP(o.host) ? undefined : o.host;
  let socket: net.Socket = o.security === "tls" ? tls.connect({ host: o.host, port: o.port, servername }) : net.connect({ host: o.host, port: o.port });

  let buffer = "";
  let lines: string[] = [];
  let waiting: { resolve: (r: Reply) => void; reject: (e: Error) => void } | null = null;
  let failed: Error | null = null;
  const replies: Reply[] = [];
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let i: number;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).replace(/\r$/, "");
      buffer = buffer.slice(i + 1);
      lines.push(line);
      // "250-..." continues a reply, "250 ..." ends it
      if (/^\d{3}(?: |$)/.test(line)) {
        const reply = { code: Number(line.slice(0, 3)), lines: lines.map((l) => l.slice(4)) };
        lines = [];
        if (waiting) { const w = waiting; waiting = null; w.resolve(reply); } else replies.push(reply);
      }
    }
  };
  const fail = (e: Error) => {
    failed ??= e;
    if (waiting) { const w = waiting; waiting = null; w.reject(e); }
  };
  const listen = (s: net.Socket) => {
    s.setTimeout(timeout);
    s.on("data", onData);
    s.on("error", fail);
    s.on("timeout", () => { fail(new SmtpError(`The mail relay ${o.host}:${o.port} did not answer within ${Math.round(timeout / 1000)} seconds.`)); s.destroy(); });
    s.on("close", () => fail(new SmtpError("The mail relay closed the connection.")));
  };
  const unlisten = (s: net.Socket) => { for (const ev of ["data", "error", "timeout", "close"]) s.removeAllListeners(ev); };
  listen(socket);
  const read = () => new Promise<Reply>((resolve, reject) => {
    if (replies.length) return resolve(replies.shift()!);
    if (failed) return reject(failed);
    waiting = { resolve, reject };
  });
  const expect = async (what: string, ok: (code: number) => boolean) => {
    const r = await read();
    if (!ok(r.code)) throw new SmtpError(`The mail relay refused ${what}: ${r.code} ${r.lines.join(" ")}`.trim(), r.code);
    return r;
  };
  const command = (line: string, what: string, ok: (code: number) => boolean) => {
    socket.write(`${line}\r\n`);
    return expect(what, ok);
  };
  const is2xx = (c: number) => c >= 200 && c < 300;

  try {
    await expect("the connection", (c) => c === 220);
    let ehlo = await command(`EHLO ${helo}`, "EHLO", is2xx);
    const offersStartTls = ehlo.lines.some((l) => /^STARTTLS\b/i.test(l));
    if (o.security === "starttls-required" && !offersStartTls) {
      throw new SmtpError("The mail relay does not offer STARTTLS. Choose “Plain” or “STARTTLS when offered”.");
    }
    if ((o.security === "starttls" || o.security === "starttls-required") && offersStartTls) {
      await command("STARTTLS", "STARTTLS", (c) => c === 220);
      unlisten(socket);
      const plain = socket;
      socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
        const t = tls.connect({ socket: plain, servername }, () => { t.removeListener("error", reject); resolve(t); });
        t.once("error", reject);
      });
      listen(socket);
      ehlo = await command(`EHLO ${helo}`, "EHLO", is2xx);
    }
    await command(`MAIL FROM:<${from}>`, `the sender ${from}`, is2xx);
    for (const r of to) await command(`RCPT TO:<${r}>`, `the recipient ${r}`, is2xx);
    await command("DATA", "DATA", (c) => c === 354);
    // a line starting with "." is doubled, so it cannot end the message early
    socket.write(`${message.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..")}\r\n.\r\n`);
    const done = await expect("the message", is2xx);
    socket.write("QUIT\r\n");
    return { response: `${done.code} ${done.lines.join(" ")}`.trim() };
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err instanceof SmtpError) throw err;
    if (err.code === "ECONNREFUSED") throw new SmtpError(`Nothing answers on ${o.host}:${o.port}. Check the relay's address and port.`);
    if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") throw new SmtpError(`The name ${o.host} cannot be found. Check the relay's address.`);
    if (/certificate|self.signed|unable to verify/i.test(err.message)) {
      throw new SmtpError(`The relay's certificate is not trusted (${err.message}). Put the company CA in certs/ and rebuild, or choose “Plain”.`);
    }
    throw new SmtpError(err.message || String(err));
  } finally {
    unlisten(socket);
    socket.on("error", () => undefined);
    socket.end();
    setTimeout(() => socket.destroy(), 1000).unref();
  }
}
