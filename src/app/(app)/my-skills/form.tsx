"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Send, Save, Star, X, MessageSquarePlus, Plus, Undo2, CircleCheck, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Info } from "@/components/info";
import { cn } from "@/lib/utils";
import { LevelPicker, type Level } from "@/components/level-picker";
import { saveMySkills } from "@/app/actions/assessment";
import { suggestSkill } from "@/app/actions/team";

export interface Row {
  skillId: string; skill: string; category: string; categorySort: number; required: boolean; target: number | null;
  level: number | null; comment: string; interest: boolean; status: string | null; confirmed: number | null;
  managerComment: string; teamNeed: string | null;
}
export interface CatalogueItem { id: string; name: string; category: string; categoryId: string; aliases?: string[] }
type Entry = { level: number | null; comment: string; interest: boolean };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const PAGE = 40;

export function MySkillsForm({ rows: initial, catalogue, levels, categories, required, managerName }: {
  rows: Row[]; catalogue: CatalogueItem[]; levels: Level[]; categories: { id: string; name: string }[];
  required: number; managerName: string | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [rows, setRows] = useState(initial);
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(initial.map((r) => [r.skillId, { level: r.level, comment: r.comment, interest: r.interest }])));
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setRows(initial); setEntries(Object.fromEntries(initial.map((r) => [r.skillId, { level: r.level, comment: r.comment, interest: r.interest }]))); setDirty(false); }, [initial]);
  // a reminder before leaving with unsaved levels
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (skillId: string, patch: Partial<Entry>) => {
    setEntries((x) => ({ ...x, [skillId]: { ...(x[skillId] ?? { level: null, comment: "", interest: false }), ...patch } }));
    setDirty(true);
  };
  const add = (item: CatalogueItem, level: number) => {
    if (!rows.some((r) => r.skillId === item.id)) {
      setRows((x) => [...x, { skillId: item.id, skill: item.name, category: item.category, categorySort: 0, required: false, target: null, level: null, comment: "", interest: false, status: null, confirmed: null, managerComment: "", teamNeed: null }]);
    }
    set(item.id, { level });
    toast.success(`${item.name}: level ${level} added. Save or send when you are done.`);
  };
  const remove = (skillId: string) => set(skillId, { level: null });

  const asked = rows.filter((r) => r.required || r.teamNeed).sort((a, b) => a.categorySort - b.categorySort || a.skill.localeCompare(b.skill));
  const other = rows.filter((r) => !r.required && !r.teamNeed && (entries[r.skillId]?.level != null || r.confirmed != null));
  const ratedRequired = rows.filter((r) => r.required && entries[r.skillId]?.level != null).length;

  const submit = (send: boolean) => start(async () => {
    const list = rows.map((r) => ({ skillId: r.skillId, ...(entries[r.skillId] ?? { level: null, comment: "", interest: false }) }));
    const res = await saveMySkills(list, send);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Saved.");
    setDirty(false);
    router.refresh();
  });

  return (
    <div className="grid gap-5">
      {/* the bar that stays in view: how far, save, send */}
      <div className="sticky top-12 z-10 -mx-4 flex flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-2.5 backdrop-blur md:-mx-6 md:px-6">
        {required > 0 && (
          <div className="flex min-w-48 flex-1 items-center gap-2 text-sm">
            <Progress value={(ratedRequired / required) * 100} className="h-2 max-w-60 flex-1" aria-label="Skills rated" />
            <span className="tabular whitespace-nowrap">{ratedRequired} of {required} rated</span>
            <Info label="About the count">The skills your role asks for that have a level. Skills you add yourself do not change this count, but they do show your manager and leaders what you can do.</Info>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirty && <span className="text-xs text-muted-foreground">Not saved yet</span>}
          <Button variant="outline" disabled={busy || !dirty} onClick={() => submit(false)}><Save />Save</Button>
          <Button disabled={busy} onClick={() => submit(true)}><Send />{managerName ? `Send to ${managerName.split(" ")[0]}` : "Save and finish"}</Button>
          <Info label="About sending" side="bottom">
            <b>Save</b> keeps your levels as a draft only you see. <b>Send</b> gives every changed level to your manager, who agrees,
            changes it, or sends it back with a note. You get an e-mail either way. The confirmed level is the one that counts.
          </Info>
        </div>
      </div>

      <LevelGuide levels={levels} />

      <Group title="Your role asks for" count={asked.length}
        info="The skills your job role (and grade) expects, with the level it expects: the target. Skills your team needs are listed here too. Rate every one; 0 is fine if you have never used it."
        empty="Your role asks for no particular skills yet. Add the skills you have below.">
        {asked.map((r) => <RowItem key={r.skillId} row={r} entry={entries[r.skillId]} levels={levels} onChange={(p) => set(r.skillId, p)} />)}
      </Group>

      <Group title="Other skills you have" count={other.length}
        info="Skills you added yourself. They are not part of your role's targets, but they show what you can do: leaders use them to find people for other teams. Clear the level to remove one."
        empty="None yet. Search below to add skills you have.">
        {other.map((r) => <RowItem key={r.skillId} row={r} entry={entries[r.skillId]} levels={levels} onChange={(p) => set(r.skillId, p)} onRemove={() => remove(r.skillId)} />)}
      </Group>

      <AddSkills catalogue={catalogue} have={new Set(rows.filter((r) => entries[r.skillId]?.level != null).map((r) => r.skillId))}
        categories={categories} levels={levels} onAdd={add} />
    </div>
  );
}

function LevelGuide({ levels }: { levels: Level[] }) {
  return (
    <details className="rounded-lg border bg-card px-4 py-2.5 text-sm">
      <summary className="cursor-pointer select-none font-medium">What the levels mean</summary>
      <dl className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {levels.map((l) => (
          <div key={l.level} className="flex gap-2">
            <dt className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-semibold">{l.level}</dt>
            <dd><b>{l.name}</b> <span className="text-muted-foreground">{l.description}</span></dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Group({ title, count, info, empty, children }: { title: string; count: number; info: string; empty: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <h2 className="flex items-center gap-1.5 border-b px-4 py-3 text-sm font-semibold">{title}<span className="font-normal text-muted-foreground">({count})</span><Info label={`About ${title}`}>{info}</Info></h2>
      {count ? <ul className="divide-y">{children}</ul> : <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

function StatusLine({ row, entry }: { row: Row; entry: Entry | undefined }) {
  const changed = (entry?.level ?? null) !== row.level;
  if (changed) return <span className="text-xs text-muted-foreground">Changed, not saved</span>;
  if (row.status === "returned") return <span className="flex items-center gap-1 text-xs font-medium text-status-critical dark:text-[color:oklch(0.75_0.15_27)]"><Undo2 className="size-3" />Sent back: {row.managerComment}</span>;
  if (row.status === "submitted") return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Hourglass className="size-3" />Waiting for your manager</span>;
  if (row.status === "validated" && row.confirmed != null) {
    return <span className="flex items-center gap-1 text-xs text-muted-foreground"><CircleCheck className="size-3" />Confirmed at {row.confirmed}{row.confirmed !== row.level ? ` (you said ${row.level})` : ""}{row.managerComment ? ` · “${row.managerComment}”` : ""}</span>;
  }
  if (row.status === "draft") return <span className="text-xs text-muted-foreground">Saved, not sent</span>;
  return null;
}

function RowItem({ row, entry, levels, onChange, onRemove }: { row: Row; entry: Entry | undefined; levels: Level[]; onChange: (p: Partial<Entry>) => void; onRemove?: () => void }) {
  const [note, setNote] = useState(!!entry?.comment);
  const e = entry ?? { level: null, comment: "", interest: false };
  return (
    <li className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="text-sm font-medium leading-snug break-words">{row.skill}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{row.category}</span>
          {row.target != null && <span className="rounded bg-primary/10 px-1.5 py-px font-medium text-foreground">Target {row.target}</span>}
          {row.teamNeed && <span>{row.teamNeed}</span>}
          <StatusLine row={row} entry={entry} />
        </div>
        {note && (
          <Textarea className="mt-2 min-h-14 text-sm" placeholder="A line for your manager: where you used it, a certificate…" maxLength={1000}
            value={e.comment} onChange={(x) => onChange({ comment: x.target.value })} aria-label={`Note for ${row.skill}`} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        <LevelPicker value={e.level} onChange={(n) => onChange({ level: n })} levels={levels} label={`Your level in ${row.skill}`} target={row.target} />
        <Button type="button" size="icon" variant="ghost" className="size-9" aria-pressed={e.interest}
          title={e.interest ? "You want to grow in this (click to undo)" : "I want to grow in this"} onClick={() => onChange({ interest: !e.interest })}>
          <Star className={cn("size-4", e.interest && "fill-amber-400 text-amber-500")} />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-9" title="Add a note for your manager" onClick={() => setNote((x) => !x)}>
          <MessageSquarePlus className="size-4" />
        </Button>
        {onRemove && (
          <Button type="button" size="icon" variant="ghost" className="size-9" title="Remove this skill" onClick={onRemove}><X className="size-4" /></Button>
        )}
      </div>
    </li>
  );
}

function AddSkills({ catalogue, have, categories, levels, onAdd }: {
  catalogue: CatalogueItem[]; have: Set<string>; categories: { id: string; name: string }[]; levels: Level[];
  onAdd: (item: CatalogueItem, level: number) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [busy, start] = useTransition();
  const [newCat, setNewCat] = useState(categories[0]?.id ?? "");
  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return catalogue.filter((c) => !have.has(c.id) && (!cat || c.categoryId === cat)
      && words.every((w) => norm(`${c.name} ${c.category} ${(c.aliases ?? []).join(" ")}`).includes(w)));
  }, [catalogue, have, q, cat]);
  useEffect(() => setShown(PAGE), [q, cat]);
  const suggest = () => start(async () => {
    const r = await suggestSkill({ name: q.trim(), categoryId: newCat });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Added.");
    router.refresh();
  });
  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <h2 className="flex items-center gap-1.5 border-b px-4 py-3 text-sm font-semibold">Add skills you have
        <Info label="About adding skills">The whole catalogue. Type any part of a name (or a category, or another name it goes by), then press a level to add it. It moves up to “Other skills you have”.</Info>
      </h2>
      <div className="grid gap-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all skills, e.g. Kubernetes, incident, Python…"
            className="h-12 pl-10 text-base" aria-label="Search the skills catalogue" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
          <Chip on={!cat} onClick={() => setCat("")}>All categories</Chip>
          {categories.map((c) => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(cat === c.id ? "" : c.id)}>{c.name}</Chip>)}
        </div>
        <p className="text-xs text-muted-foreground">{results.length} skill{results.length === 1 ? "" : "s"}{q || cat ? " match" : " in the catalogue"}. Press a level to add one.</p>
        <ul className="divide-y rounded-md border">
          {results.slice(0, shown).map((c) => (
            <li key={c.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="text-sm leading-snug break-words">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.category}</div>
              </div>
              <LevelPicker value={null} onChange={(n) => n != null && onAdd(c, n)} levels={levels} label={`Add ${c.name} at level`} />
            </li>
          ))}
          {!results.length && (
            <li className="grid gap-2 px-3 py-3 text-sm">
              <span>Not in the catalogue.</span>
              {q.trim().length >= 2 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Add “{q.trim()}” to</span>
                  <Select value={newCat} onValueChange={setNewCat}>
                    <SelectTrigger className="w-56" aria-label="Category for the new skill"><SelectValue /></SelectTrigger>
                    <SelectContent>{categories.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={busy || !newCat} onClick={suggest}><Plus />Add it</Button>
                  <Info label="About adding a new skill">A manager&apos;s new skill joins the catalogue at once. Anyone else&apos;s waits for an administrator to approve it, then you can rate it.</Info>
                </div>
              )}
            </li>
          )}
        </ul>
        {results.length > shown && <Button variant="outline" onClick={() => setShown((n) => n + PAGE * 2)}>Show more ({results.length - shown} left)</Button>}
      </div>
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-xs transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>
      {children}
    </button>
  );
}
