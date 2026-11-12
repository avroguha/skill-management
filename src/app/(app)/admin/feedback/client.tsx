"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Section } from "@/components/kpi";
import { Empty } from "@/components/heatmap";
import { handleFeedback, saveHelp } from "@/app/actions/help";
import type { Faq, Help } from "@/lib/help";
import { cn } from "@/lib/utils";

interface Item {
  id: string; at: string; name: string; email: string; kind: string; message: string; page: string;
  status: string; note: string; handledBy: string; handledAt: string | null;
}
const STATUS: Record<string, string> = { new: "New", in_progress: "In progress", done: "Done" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function FeedbackAdmin({ items, help }: { items: Item[]; help: Help }) {
  const open = items.filter((i) => i.status !== "done").length;
  return (
    <Tabs defaultValue="inbox">
      <TabsList className="mb-4">
        <TabsTrigger value="inbox">Feedback{open ? ` (${open} open)` : ""}</TabsTrigger>
        <TabsTrigger value="faq">FAQ</TabsTrigger>
        <TabsTrigger value="contact">Contact</TabsTrigger>
      </TabsList>
      <TabsContent value="inbox"><Inbox items={items} /></TabsContent>
      <TabsContent value="faq"><FaqEditor help={help} /></TabsContent>
      <TabsContent value="contact"><ContactEditor help={help} /></TabsContent>
    </Tabs>
  );
}

function Inbox({ items }: { items: Item[] }) {
  const [filter, setFilter] = useState<"open" | "all" | "done">("open");
  const shown = items.filter((i) => (filter === "all" ? true : filter === "done" ? i.status === "done" : i.status !== "done"));
  return (
    <div className="grid gap-3">
      <div className="inline-flex w-fit rounded-md border p-0.5 text-xs" role="group" aria-label="Which feedback">
        {(["open", "done", "all"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={cn("rounded px-2.5 py-1", filter === f ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
            {f === "open" ? "Open" : f === "done" ? "Done" : "All"}
          </button>
        ))}
      </div>
      {shown.length ? shown.map((i) => <FeedbackCard key={i.id} item={i} />) : <Empty>{filter === "open" ? "Nothing open. Well done." : "Nothing here yet."}</Empty>}
    </div>
  );
}

function FeedbackCard({ item }: { item: Item }) {
  const router = useRouter();
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.note);
  const [pending, start] = useTransition();
  const dirty = status !== item.status || note !== item.note;
  const save = () => start(async () => {
    const r = await handleFeedback({ id: item.id, status, note });
    if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error);
  });
  return (
    <div className={cn("rounded-lg border bg-card p-4", item.status === "new" && "border-primary/50")}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span><span className="font-medium text-foreground">{item.name || "(no name)"}</span>{item.email && <> · <a href={`mailto:${item.email}`} className="hover:underline">{item.email}</a></>} · {when(item.at)}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{item.kind}</span>
      </div>
      <p className="mt-2 text-sm whitespace-pre-line">{item.message}</p>
      {item.page && <p className="mt-1 text-xs text-muted-foreground">On <Link href={item.page} className="underline">{item.page}</Link></p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-start">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(STATUS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Reply: the person sees it on their Help page" aria-label="Reply" />
        <Button onClick={save} disabled={pending || !dirty}>{pending ? <Loader2 className="animate-spin" /> : <Save />}Save</Button>
      </div>
      {item.handledBy && <p className="mt-2 text-xs text-muted-foreground">Last handled by {item.handledBy}{item.handledAt ? `, ${when(item.handledAt)}` : ""}</p>}
    </div>
  );
}

function useSaveHelp() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (h: Help) => start(async () => {
    const r = await saveHelp(h);
    if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error);
  });
  return { pending, save };
}

function FaqEditor({ help }: { help: Help }) {
  const [faq, setFaq] = useState<Faq[]>(help.faq);
  const { pending, save } = useSaveHelp();
  const set = (i: number, patch: Partial<Faq>) => setFaq((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setFaq((f) => { const x = [...f]; const [it] = x.splice(i, 1); x.splice(i + d, 0, it); return x; });
  return (
    <Section title="Frequently asked questions" description="Shown on the Help page in this order. Managers' and administrators' questions are shown only to them."
      actions={<Button size="sm" onClick={() => save({ ...help, faq })} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />}Save FAQ</Button>}>
      <div className="grid gap-3">
        {faq.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={f.q} onChange={(e) => set(i, { q: e.target.value })} placeholder="The question" className="min-w-0 flex-1" aria-label={`Question ${i + 1}`} />
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
            <Textarea value={f.a} onChange={(e) => set(i, { a: e.target.value })} rows={3} placeholder="The answer" aria-label={`Answer ${i + 1}`} />
          </div>
        ))}
        <Button variant="outline" className="w-fit" onClick={() => setFaq((f) => [...f, { q: "", a: "", audience: "everyone" }])}><Plus />Add a question</Button>
      </div>
    </Section>
  );
}

function ContactEditor({ help }: { help: Help }) {
  const [c, setC] = useState(help.contact);
  const { pending, save } = useSaveHelp();
  const field = (k: keyof Help["contact"], label: string, placeholder: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`c-${k}`}>{label}</Label>
      <Input id={`c-${k}`} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} placeholder={placeholder} />
    </div>
  );
  return (
    <Section title="Contact us" description="How people reach whoever runs the portal. Leave a line empty to hide it."
      actions={<Button size="sm" onClick={() => save({ ...help, contact: c })} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />}Save contact</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("team", "Who", "The skills portal team")}
        {field("email", "E-mail", "skills-portal@avro.com")}
        {field("channel", "Chat channel", "#skills-portal")}
        {field("channelUrl", "Chat link (https://)", "https://…")}
        {field("phone", "Phone", "")}
        {field("hours", "Hours", "Working days, 09:00-18:00")}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="c-note">Note</Label>
          <Textarea id="c-note" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} rows={2} />
        </div>
      </div>
    </Section>
  );
}
