"use client";
import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, ToggleField } from "@/components/info";
import { saveEmailSettings, sendTest } from "@/app/actions/email";
import type { EmailSettings } from "@/lib/mail/notify";

const SECURITY = [
  { value: "starttls", label: "STARTTLS when the relay offers it (port 25 or 587)" },
  { value: "none", label: "Plain, never encrypted (port 25)" },
  { value: "starttls-required", label: "STARTTLS required (port 587)" },
  { value: "tls", label: "TLS from the start (port 465)" },
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SENDS: { key: keyof EmailSettings["send"]; label: string; info: string }[] = [
  { key: "submitted", label: "To a manager, when someone sends ratings to confirm", info: "Each time, with the skills, the levels and the person's comments, and a button straight to confirming them." },
  { key: "digest", label: "To managers, weekly: what waits for them", info: "On the weekly day: how many ratings wait to be confirmed, from whom, and who in the team has not started. Only to managers with something waiting." },
  { key: "returned", label: "To a person, when their manager sends a rating back", info: "With the manager's note. Several sent back in one sitting go out as one e-mail." },
  { key: "validated", label: "To a person, when their ratings are confirmed", info: "Their level and the confirmed one side by side. One e-mail per sitting." },
  { key: "reminders", label: "To people, weekly: finish your skills", info: "On the weekly day, to everyone who has not started, has not finished, or has ratings sent back. Nobody with nothing to do gets one." },
  { key: "nudge", label: "Managers can remind their team", info: "A Remind button on My team › People for those who still have something to do. At most one per person per day." },
];

export function EmailForm({ initial, adminEmail, appUrl, readOnly }: { initial: EmailSettings; adminEmail: string; appUrl: string; readOnly?: boolean }) {
  const [s, setS] = useState(initial);
  const [to, setTo] = useState(adminEmail);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const set = (patch: Partial<EmailSettings>) => setS((x) => ({ ...x, ...patch }));
  return (
    <form className="grid max-w-3xl gap-6" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await saveEmailSettings(s);
        if (r.ok) toast.success(r.message ?? "Saved"); else toast.error(r.error);
      });
    }}>
      <fieldset disabled={readOnly} className="grid gap-6">
        <ToggleField label="Send e-mail" info="Off: nothing is sent or queued. Try the relay with a test first, then switch on and save.">
          <Switch id="on" checked={s.enabled} onCheckedChange={(c) => set({ enabled: c })} />
        </ToggleField>

        <fieldset className="grid gap-4">
          <legend className="mb-2 text-sm font-medium">Mail relay</legend>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Relay host" htmlFor="host" info="The company's mail relay (SMTP), by name or IP address. An open relay inside the network accepts mail from this server without a user name or password.">
              <Input id="host" placeholder="smtp-relay.company.com" value={s.host} onChange={(e) => set({ host: e.target.value })} />
            </Field>
            <Field label="Port" htmlFor="port" info="25 for a plain or STARTTLS relay, 587 for STARTTLS submission, 465 for TLS from the start.">
              <Input id="port" type="number" min={1} max={65535} value={s.port} onChange={(e) => set({ port: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Encryption" info="How the connection to the relay is protected. With encryption the relay's certificate must be trusted: put the company CA certificate in certs/ before building the image.">
            <Select value={s.security} onValueChange={(x) => set({ security: x as EmailSettings["security"] })}>
              <SelectTrigger className="w-full sm:w-[28rem]" aria-label="Encryption"><SelectValue /></SelectTrigger>
              <SelectContent>{SECURITY.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sender address" htmlFor="from" info="The From address on every e-mail, usually a no-reply address the relay accepts for this server.">
              <Input id="from" type="email" placeholder="skills-noreply@company.com" value={s.fromAddress} onChange={(e) => set({ fromAddress: e.target.value })} />
            </Field>
            <Field label="Sender name" htmlFor="fromName" info="The name people see next to the sender address.">
              <Input id="fromName" value={s.fromName} onChange={(e) => set({ fromName: e.target.value })} />
            </Field>
            <Field label="Reply-to (optional)" htmlFor="reply" info="Where a reply goes, if someone replies. Leave empty to say replies are not read.">
              <Input id="reply" type="email" placeholder="skills-team@company.com" value={s.replyTo} onChange={(e) => set({ replyTo: e.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
            <Field label="Send a test to" htmlFor="to" info="Sends one test e-mail now with the values above, saved or not, and shows the relay's answer.">
              <Input id="to" type="email" className="w-72 max-w-full" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Button type="button" variant="outline" disabled={testing || !to} onClick={() => startTest(async () => {
              const r = await sendTest(s, to);
              if (r.ok) toast.success(r.message ?? "Sent", { duration: 10000 }); else toast.error(r.error, { duration: 15000 });
            })}>{testing ? <Loader2 className="animate-spin" /> : <Send />}Send test</Button>
            <p className="basis-full text-xs text-muted-foreground">Links in e-mails go to {appUrl} (APP_URL) and through single sign-on to the right page.</p>
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">Which e-mails</legend>
          {SENDS.map((o) => (
            <ToggleField key={o.key} label={o.label} info={o.info}>
              <Switch id={`send-${o.key}`} checked={s.send[o.key]} onCheckedChange={(c) => set({ send: { ...s.send, [o.key]: c } })} />
            </ToggleField>
          ))}
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="mb-2 text-sm font-medium">When the weekly e-mails go out</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Weekly, on" info="The day the weekly reminders and manager digests go out.">
              <Select value={String(s.weeklyDay)} onValueChange={(x) => set({ weeklyDay: Number(x) })}>
                <SelectTrigger className="w-full" aria-label="Weekly, on"><SelectValue /></SelectTrigger>
                <SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="From" info="The hour, in the time zone on the right, from which they go out that day.">
              <Select value={String(s.sendHour)} onValueChange={(x) => set({ sendHour: Number(x) })}>
                <SelectTrigger className="w-full" aria-label="From"><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{`${String(h).padStart(2, "0")}:00`}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Time zone" htmlFor="tz" info="The organisation's clock, as an IANA name: America/New_York, Europe/London, Asia/Kolkata. It follows summer time by itself.">
              <Input id="tz" value={s.timeZone} onChange={(e) => set({ timeZone: e.target.value })} placeholder="America/New_York" />
            </Field>
          </div>
        </fieldset>

        <Button type="submit" className="justify-self-start" disabled={pending || readOnly}>{pending && <Loader2 className="animate-spin" />}Save</Button>
      </fieldset>
    </form>
  );
}
