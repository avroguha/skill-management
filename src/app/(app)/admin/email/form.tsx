"use client";
import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveEmailSettings, sendTest } from "@/app/actions/email";
import type { EmailSettings } from "@/lib/mail/notify";

const SECURITY = [
  { value: "starttls", label: "STARTTLS when the relay offers it (port 25 or 587)" },
  { value: "none", label: "Plain, never encrypted (port 25)" },
  { value: "starttls-required", label: "STARTTLS required (port 587)" },
  { value: "tls", label: "TLS from the start (port 465)" },
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SENDS: { key: keyof EmailSettings["send"]; label: string; help: string }[] = [
  { key: "submitted", label: "To the manager, when someone sends ratings for validation", help: "Each submission, with the skills, levels and comments, and a button to the validation page for that person." },
  { key: "returned", label: "To the person, when their manager sends a rating back", help: "With the manager's note. Several sent back in one sitting go out as one e-mail." },
  { key: "validated", label: "To the person, when their ratings are validated", help: "Their level and the validated one side by side. One e-mail per sitting." },
  { key: "reminders", label: "Reminders while an assessment round is open", help: "To everyone who has not sent their self-assessment: weekly, and a few days before it is due (Admin › Cycles)." },
  { key: "nudge", label: "Managers can remind their team", help: "A Remind button on My team for people who have not updated their skills. One per person per day." },
];

export function EmailForm({ initial, adminEmail, appUrl }: { initial: EmailSettings; adminEmail: string; appUrl: string }) {
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
      <div className="flex items-start gap-3">
        <Switch id="on" checked={s.enabled} onCheckedChange={(c) => set({ enabled: c })} />
        <div className="grid gap-1">
          <Label htmlFor="on">Send e-mail</Label>
          <p className="text-xs text-muted-foreground">Off: nothing is sent or queued. Try the relay with a test first, then switch on and save.</p>
        </div>
      </div>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-medium">Mail relay</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div className="grid gap-1.5">
            <Label htmlFor="host">Relay host</Label>
            <Input id="host" placeholder="smtp-relay.company.com" value={s.host} onChange={(e) => set({ host: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="port">Port</Label>
            <Input id="port" type="number" min={1} max={65535} value={s.port} onChange={(e) => set({ port: Number(e.target.value) })} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Encryption</Label>
          <Select value={s.security} onValueChange={(x) => set({ security: x as EmailSettings["security"] })}>
            <SelectTrigger className="w-full sm:w-[28rem]"><SelectValue /></SelectTrigger>
            <SelectContent>{SECURITY.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">An open relay needs no user name or password: it accepts mail from this server. With encryption the relay&apos;s certificate must be trusted (company CA certificates go in certs/ before the build).</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="from">Sender address</Label>
            <Input id="from" type="email" placeholder="skills-noreply@company.com" value={s.fromAddress} onChange={(e) => set({ fromAddress: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fromName">Sender name</Label>
            <Input id="fromName" value={s.fromName} onChange={(e) => set({ fromName: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reply">Reply-to (optional)</Label>
            <Input id="reply" type="email" placeholder="skills-team@company.com" value={s.replyTo} onChange={(e) => set({ replyTo: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
          <div className="grid gap-1.5">
            <Label htmlFor="to">Send a test to</Label>
            <Input id="to" type="email" className="w-72" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button type="button" variant="outline" disabled={testing || !to} onClick={() => startTest(async () => {
            const r = await sendTest(s, to);
            if (r.ok) toast.success(r.message ?? "Sent", { duration: 10000 }); else toast.error(r.error, { duration: 15000 });
          })}>{testing ? <Loader2 className="animate-spin" /> : <Send />}Send test</Button>
          <p className="basis-full text-xs text-muted-foreground">Uses the values above, saved or not. Links in e-mails go to {appUrl} (APP_URL) and through single sign-on to the right page.</p>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Which e-mails</legend>
        {SENDS.map((o) => (
          <div key={o.key} className="flex items-start gap-3">
            <Switch id={`send-${o.key}`} checked={s.send[o.key]} onCheckedChange={(c) => set({ send: { ...s.send, [o.key]: c } })} />
            <div className="grid gap-0.5">
              <Label htmlFor={`send-${o.key}`}>{o.label}</Label>
              <p className="text-xs text-muted-foreground">{o.help}</p>
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-medium">When reminders go out</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="tz">Time zone</Label>
            <Input id="tz" value={s.timeZone} onChange={(e) => set({ timeZone: e.target.value })} placeholder="America/New_York" />
            <p className="text-xs text-muted-foreground">America/New_York follows Eastern time, summer and winter.</p>
          </div>
          <div className="grid gap-1.5">
            <Label>At</Label>
            <Select value={String(s.sendHour)} onValueChange={(x) => set({ sendHour: Number(x) })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{`${String(h).padStart(2, "0")}:00`}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Weekly, on</Label>
            <Select value={String(s.weeklyDay)} onValueChange={(x) => set({ weeklyDay: Number(x) })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="before">And this many days before it is due</Label>
            <Input id="before" type="number" min={0} max={30} value={s.daysBeforeDue} onChange={(e) => set({ daysBeforeDue: Number(e.target.value) })} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Only while an assessment round is open (Admin › Cycles), and only to people whose self-assessment is not started, unfinished, or sent back.</p>
      </fieldset>

      <Button type="submit" className="justify-self-start" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save</Button>
    </form>
  );
}
