"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section } from "@/components/kpi";
import { Field } from "@/components/info";
import { saveHelp } from "@/app/actions/help";
import type { Faq, Help } from "@/lib/help";

function useSaveHelp() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (h: Help) => start(async () => {
    const r = await saveHelp(h);
    if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error);
  });
  return { pending, save };
}

export function FaqEditor({ help }: { help: Help }) {
  const [faq, setFaq] = useState<Faq[]>(help.faq);
  const { pending, save } = useSaveHelp();
  const set = (i: number, patch: Partial<Faq>) => setFaq((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setFaq((f) => { const x = [...f]; const [it] = x.splice(i, 1); x.splice(i + d, 0, it); return x; });
  return (
    <Section title="Frequently asked questions" info="Shown on the Help page in this order, with a search box. Managers' and administrators' questions are shown only to them."
      actions={<Button size="sm" onClick={() => save({ ...help, faq })} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />}Save questions</Button>}>
      <div className="grid gap-3">
        {faq.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={f.q} onChange={(e) => set(i, { q: e.target.value })} placeholder="The question…" className="min-w-0 flex-1" aria-label={`Question ${i + 1}`} />
              <Select value={f.audience} onValueChange={(a) => set(i, { audience: a as Faq["audience"] })}>
                <SelectTrigger className="w-36" aria-label="Who sees it"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="manager">Managers</SelectItem>
                  <SelectItem value="admin">Administrators</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp /></Button>
              <Button size="icon" variant="ghost" disabled={i === faq.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown /></Button>
              <Button size="icon" variant="ghost" onClick={() => setFaq((x) => x.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
            </div>
            <Textarea value={f.a} onChange={(e) => set(i, { a: e.target.value })} rows={3} placeholder="The answer…" aria-label={`Answer ${i + 1}`} />
          </div>
        ))}
        <Button variant="outline" className="w-fit" onClick={() => setFaq((f) => [...f, { q: "", a: "", audience: "everyone" }])}><Plus />Add a question</Button>
      </div>
    </Section>
  );
}

const CONTACT: { k: keyof Help["contact"]; label: string; placeholder: string; info: string }[] = [
  { k: "team", label: "Who", placeholder: "The skills team", info: "The name of the team or person who runs the app, shown as the heading." },
  { k: "email", label: "E-mail", placeholder: "skills-team@avro.com", info: "Shown as a link that opens a new e-mail." },
  { k: "channel", label: "Chat channel", placeholder: "#skills", info: "A chat channel people can ask in." },
  { k: "channelUrl", label: "Chat link (https://)", placeholder: "https://…", info: "Where the channel name links to. Must start with https://." },
  { k: "phone", label: "Phone", placeholder: "", info: "A phone number, if there is one." },
  { k: "hours", label: "Hours", placeholder: "Working days, 09:00-18:00", info: "When someone answers." },
];

export function ContactEditor({ help }: { help: Help }) {
  const [c, setC] = useState(help.contact);
  const { pending, save } = useSaveHelp();
  return (
    <Section title="Contact us" info="How people reach whoever runs the app, on the Help page. Leave a line empty to hide it."
      actions={<Button size="sm" onClick={() => save({ ...help, contact: c })} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />}Save contact</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {CONTACT.map((f) => (
          <Field key={f.k} label={f.label} htmlFor={`c-${f.k}`} info={f.info}>
            <Input id={`c-${f.k}`} value={c[f.k]} onChange={(e) => setC({ ...c, [f.k]: e.target.value })} placeholder={f.placeholder} />
          </Field>
        ))}
        <Field label="Note" htmlFor="c-note" info="A line or two under the contact details." className="sm:col-span-2">
          <Textarea id="c-note" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} rows={2} />
        </Field>
      </div>
    </Section>
  );
}
