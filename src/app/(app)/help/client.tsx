"use client";
import { useMemo, useState } from "react";
import { Mail, MessageSquare, Phone, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/kpi";
import type { Contact, Faq } from "@/lib/help";

export function HelpPage({ faq, contact }: { faq: Faq[]; contact: Contact }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? faq.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(t)) : faq;
  }, [faq, q]);
  const hasContact = !!(contact.email || contact.channel || contact.phone);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="grid content-start gap-5 lg:col-span-2">
        <Section title="Frequently asked" info="What people ask most, for what you do here. Administrators change the questions and answers in Settings › Help page.">
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
          ) : <p className="text-sm text-muted-foreground">No question matches. Ask the people below.</p>}
        </Section>

        <Section title="How the numbers work" info="The rules every page uses, so the numbers agree everywhere.">
          <ul className="grid list-disc gap-1.5 pl-5 text-sm">
            <li><b>Only confirmed levels count.</b> A level counts once the person’s manager confirmed it. Self-ratings waiting for the manager show, but do not count yet.</li>
            <li><b>On target</b>: of every skill a person’s role asks for, the share where their confirmed level reaches the target. Levels are never averaged across people: one expert does not hide four beginners.</li>
            <li><b>A team</b> is a manager and everyone below them. Managers are not asked to rate themselves and count in no gap, but the skills they add count as the team’s capability.</li>
            <li><b>Team needs</b> (“N people at level L in skill S”) are set by the manager, or implied when two or more of their people have a role that asks for a skill. A need is <b>short</b> when fewer people than needed are at that level, and <b>rests on one person</b> when exactly one is.</li>
            <li><b>Elsewhere / could strengthen</b>: people outside a team who already have what it is short of, at the level. Capability only: whether anyone helps or moves is a conversation, not something the app decides.</li>
            <li>A rating older than the “stale” period (Settings › Levels &amp; rules) is flagged as stale.</li>
          </ul>
        </Section>
      </div>

      <div className="grid content-start gap-5">
        <Section title="Contact us" description={contact.team} info="The people who run this app. Administrators set these details in Settings › Help page.">
          <ul className="grid gap-2.5 text-sm">
            {contact.email && <li className="flex items-start gap-2"><Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><a href={`mailto:${contact.email}`} className="break-all hover:underline">{contact.email}</a></li>}
            {contact.channel && <li className="flex items-start gap-2"><MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {contact.channelUrl ? <a href={contact.channelUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{contact.channel}</a> : contact.channel}</li>}
            {contact.phone && <li className="flex items-start gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className="hover:underline">{contact.phone}</a></li>}
            {contact.hours && <li className="flex items-start gap-2"><Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{contact.hours}</li>}
            {!hasContact && <li className="text-muted-foreground">Ask your manager, or an administrator of this app.</li>}
          </ul>
          {contact.note && <p className="mt-3 text-xs whitespace-pre-line text-muted-foreground">{contact.note}</p>}
        </Section>
      </div>
    </div>
  );
}
