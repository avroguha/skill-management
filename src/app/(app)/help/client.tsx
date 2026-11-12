"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MessageSquare, Phone, Clock, Search, Send, Compass } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section } from "@/components/kpi";
import { submitFeedback } from "@/app/actions/help";
import { startTour } from "@/components/tour";
import type { Contact, Faq } from "@/lib/help";
import { cn } from "@/lib/utils";

interface Mine { id: string; at: string; kind: string; message: string; status: string; done: boolean; note: string }

export function HelpPage({ faq, contact, kinds, mine }: { faq: Faq[]; contact: Contact; kinds: { id: string; label: string }[]; mine: Mine[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? faq.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(t)) : faq;
  }, [faq, q]);
  const hasContact = !!(contact.email || contact.channel || contact.phone);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="grid content-start gap-5 lg:col-span-2">
        <Section title="Frequently asked" description="What people ask most. Search, or open a question."
          actions={<Button size="sm" variant="outline" onClick={() => startTour()} data-tour="help-tour"><Compass />Take the tour</Button>}>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the questions…" className="h-8 pl-8" aria-label="Search the questions" />
          </div>
          {shown.length ? (
            <div className="divide-y rounded-md border">
              {shown.map((f, i) => (
                <details key={i} className="group px-3 py-2.5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-sm font-medium">
                    {f.q}<span className="mt-0.5 text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No question matches. Ask it below: the answer may become the next FAQ.</p>}
        </Section>

        <FeedbackForm kinds={kinds} />

        {mine.length > 0 && (
          <Section title="Your feedback" description="What you sent, and what came back.">
            <ul className="grid gap-3">
              {mine.map((m) => (
                <li key={m.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{m.kind} · {new Date(m.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                    <span className={cn("rounded px-1.5 py-0.5 font-medium", m.done ? "bg-status-meets text-status-meets-fg" : "bg-muted")}>{m.status}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-3 whitespace-pre-line">{m.message}</p>
                  {m.note && <p className="mt-2 rounded bg-muted/60 p-2 text-xs whitespace-pre-line"><span className="font-medium">Reply: </span>{m.note}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <div className="grid content-start gap-5">
        <Section title="Contact us" description={contact.team}>
          <ul className="grid gap-2.5 text-sm" data-tour="help-contact">
            {contact.email && <li className="flex items-start gap-2"><Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><a href={`mailto:${contact.email}`} className="break-all hover:underline">{contact.email}</a></li>}
            {contact.channel && <li className="flex items-start gap-2"><MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {contact.channelUrl ? <a href={contact.channelUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{contact.channel}</a> : contact.channel}</li>}
            {contact.phone && <li className="flex items-start gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className="hover:underline">{contact.phone}</a></li>}
            {contact.hours && <li className="flex items-start gap-2"><Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{contact.hours}</li>}
            {!hasContact && <li className="text-muted-foreground">Use the feedback form: it reaches the people who run the portal.</li>}
          </ul>
          {contact.note && <p className="mt-3 text-xs whitespace-pre-line text-muted-foreground">{contact.note}</p>}
        </Section>
      </div>
    </div>
  );
}

function FeedbackForm({ kinds }: { kinds: { id: string; label: string }[] }) {
  const router = useRouter();
  const [kind, setKind] = useState("question");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState("");
  const [pending, start] = useTransition();
  // the page they came from, so a report about a screen says which one
  useEffect(() => {
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.origin === location.origin && r.pathname !== "/help") setPage(r.pathname + r.search);
    } catch { /* no referrer */ }
  }, []);
  const send = () => start(async () => {
    const r = await submitFeedback({ kind, message, page });
    if (r.ok) { toast.success(r.message); setMessage(""); router.refresh(); } else toast.error(r.error);
  });
  return (
    <Section title="Feedback" description="Something broken, data that is wrong, a question or an idea: it goes straight to the people who run the portal.">
      <div className="grid gap-3" data-tour="help-feedback">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>What is it about?</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger aria-label="What is it about?"><SelectValue /></SelectTrigger>
              <SelectContent>{kinds.map((k) => <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fb-page">Page (optional)</Label>
            <Input id="fb-page" value={page} onChange={(e) => setPage(e.target.value)} placeholder="/assess" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fb-message">What happened, or what would help?</Label>
          <Textarea id="fb-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={5000}
            placeholder="What you did, what you expected, what you saw. For wrong data: whose, and what it should be." />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Your name and e-mail go with it, so we can reply.</span>
          <Button onClick={send} disabled={pending || message.trim().length < 10}>{pending ? <Loader2 className="animate-spin" /> : <Send />}Send</Button>
        </div>
      </div>
    </Section>
  );
}
