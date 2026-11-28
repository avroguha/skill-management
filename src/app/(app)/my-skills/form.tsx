"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Search, Send, Save, Star, X, MessageSquarePlus, Undo2, CircleCheck, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Info } from "@/components/info";
import { cn } from "@/lib/utils";
import { LevelPicker, type Level } from "@/components/level-picker";
import { saveMySkills } from "@/app/actions/assessment";
import { matchScore, sameName } from "@/lib/similar";
import { AskDialog, type AskCatalogue } from "@/components/ask-dialog";
import { ActionMenu } from "@/components/action-menu";
import { skillActions } from "@/components/menus";

export interface Row {
  skillId: string; skill: string; category: string; categorySort: number; required: boolean; target: number | null;
  level: number | null; comment: string; interest: boolean; status: string | null; confirmed: number | null;
  managerComment: string; teamNeed: string | null;
  /** what the manager asks of this person alone, and why */
  asked?: string | null;
}
export interface CatalogueItem { id: string; name: string; category: string; categoryId: string; aliases?: string[] }
type Entry = { level: number | null; comment: string; interest: boolean };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const PAGE = 40;

export function MySkillsForm({ rows: initial, catalogue, levels, categories, required, managerName, ask, openRequests }: {
  rows: Row[]; catalogue: CatalogueItem[]; levels: Level[]; categories: { id: string; name: string }[];
  required: number; managerName: string | null; ask: AskCatalogue; openRequests: number;
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
  // what Send would send: a level not sent yet, saved as a draft, sent back, or changed since
  const toSend = rows.filter((r) => {
    const e = entries[r.skillId];
    if (e?.level == null) return false;
    return e.level !== r.level || e.comment !== r.comment || r.status == null || r.status === "draft" || r.status === "returned";
  }).length;
  const waiting = rows.filter((r) => r.status === "submitted").length;
  const first = managerName?.split(" ")[0];

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
      <div className="sticky top-[var(--app-top,3rem)] z-10 -mx-4 flex flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-2.5 backdrop-blur md:-mx-6 md:px-6">
        {required > 0 && (
          <div className="flex min-w-48 flex-1 items-center gap-2 text-sm">
            <Progress value={(ratedRequired / required) * 100} className="h-2 max-w-60 flex-1" aria-label="Skills rated" />
            <span className="tabular whitespace-nowrap">{ratedRequired} of {required} rated</span>
            <Info label="About the count">The skills your role asks for that have a level. Skills you add yourself do not change this count, but they do show your manager and leaders what you can do.</Info>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span aria-live="polite">{dirty ? <span className="text-xs text-muted-foreground">Not saved yet</span>
            : !toSend && <span className="flex items-center gap-1 text-xs text-muted-foreground">{waiting ? <><Hourglass className="size-3.5" />Sent: {waiting} waiting for {first ?? "your manager"}</> : <><CircleCheck className="size-3.5" />Nothing new to send</>}</span>}</span>
          <Button variant="outline" disabled={busy || !dirty} onClick={() => submit(false)}><Save />Save</Button>
          {/* the main button only while there is something to send; otherwise it stays for a stale rating to be sent again */}
          <Button variant={toSend ? "default" : "outline"} disabled={busy} onClick={() => submit(true)}><Send />{managerName ? (toSend ? `Send ${toSend} to ${first}` : `Send again to ${first}`) : "Save and finish"}</Button>
          <Info label="About sending" side="bottom">
            <b>Save</b> keeps your levels as a draft only you see. <b>Send</b> gives every changed level to your manager, who agrees,
            changes it, or sends it back with a note. You get an e-mail either way. The confirmed level is the one that counts.
          </Info>
        </div>
      </div>

      <LevelGuide levels={levels} />

      <Group title={rows.some((r) => r.asked) ? "Your roles and your manager ask for" : "Your roles ask for"} count={asked.length}
        info="The skills the roles you are in ask for, with the level they ask for: the target. Your manager made those roles and put you in them, and may ask some skills of you alone (marked, with why). Skills your team needs are listed here too. Rate every one; 0 is fine if you have never used it."
        empty="Your roles ask for no particular skills yet. Add the skills you have below.">
        {asked.map((r) => <RowItem key={r.skillId} row={r} entry={entries[r.skillId]} levels={levels} onChange={(p) => set(r.skillId, p)} />)}
      </Group>

      <Group title="Other skills you have" count={other.length}
        info="Skills you added yourself. They are not part of your role’s targets, but they show what you can do: leaders use them to find people for other teams. Clear the level to remove one."
        empty="None yet. Search below to add skills you have.">
        {other.map((r) => <RowItem key={r.skillId} row={r} entry={entries[r.skillId]} levels={levels} onChange={(p) => set(r.skillId, p)} onRemove={() => remove(r.skillId)} />)}
      </Group>

      <AddSkills catalogue={catalogue} have={new Set(rows.filter((r) => entries[r.skillId]?.level != null).map((r) => r.skillId))}
        categories={categories} levels={levels} onAdd={add} ask={ask} openRequests={openRequests} />
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
  // the note: one line under the skill, a box only while it is being written
  const [note, setNote] = useState(false);
  // only ever opens: clicking away closes it. From the right-click menu the menu takes focus
  // back as it closes, so the cursor is put in the box once it has
  const box = useRef<HTMLTextAreaElement>(null);
  const openNote = () => { setNote(true); setTimeout(() => box.current?.focus(), 50); };
  const e = entry ?? { level: null, comment: "", interest: false };
  return (
    <ActionMenu title={row.skill} actions={[
      { key: "note", label: entry?.comment ? "Change the note for your manager" : "Add a note for your manager", icon: MessageSquarePlus, onSelect: openNote },
      { key: "star", label: e.interest ? "I no longer want to grow in this" : "I want to grow in this", icon: Star, onSelect: () => onChange({ interest: !e.interest }) },
      ...(onRemove ? [{ key: "remove", label: "Remove this skill from my list", icon: X, destructive: true, onSelect: onRemove }] : []),
      ...skillActions({ id: row.skillId, name: row.skill }).map((a, i) => (i === 0 ? { ...a, separator: true } : a)),
    ]}>
    <li className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="text-sm font-medium leading-snug break-words">{row.skill}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{row.category}</span>
          {row.target != null && <span className="rounded bg-primary/10 px-1.5 py-px font-medium text-foreground">Target {row.target}</span>}
          {row.asked && <span className="rounded bg-amber-500/10 px-1.5 py-px font-medium text-foreground">{row.asked}</span>}
          {row.teamNeed && <span>{row.teamNeed}</span>}
          <StatusLine row={row} entry={entry} />
        </div>
        {note ? (
          <Textarea ref={box} autoFocus className="mt-2 min-h-14 text-sm" placeholder="A line for your manager: where you used it, a certificate…" maxLength={1000}
            value={e.comment} onChange={(x) => onChange({ comment: x.target.value })} onBlur={() => setNote(false)} aria-label={`Note for ${row.skill}`} />
        ) : e.comment ? (
          <button type="button" onClick={() => setNote(true)} title="Change the note"
            className="mt-1 block max-w-full truncate text-left text-xs text-muted-foreground hover:text-foreground">Your note: “{e.comment}”</button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        <LevelPicker value={e.level} onChange={(n) => onChange({ level: n })} levels={levels} label={`Your level in ${row.skill}`} target={row.target} />
        <Button type="button" size="icon" variant="ghost" className="size-9" aria-pressed={e.interest}
          title={e.interest ? "You want to grow in this (click to undo)" : "I want to grow in this"} aria-label={`I want to grow in ${row.skill}`} onClick={() => onChange({ interest: !e.interest })}>
          <Star className={cn("size-4", e.interest && "fill-amber-400 text-amber-500")} />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-9" title={e.comment ? "Change the note for your manager" : "Add a note for your manager"} aria-label={e.comment ? `Change the note for ${row.skill}` : `Add a note for ${row.skill}`} aria-expanded={note}
          // pressing it keeps the cursor in an open note, so the click can close it (instead of the blur closing and the click reopening)
          onMouseDown={(x) => { if (note) x.preventDefault(); }} onClick={() => (note ? setNote(false) : openNote())}>
          <MessageSquarePlus className="size-4" />
        </Button>
        {onRemove && (
          <Button type="button" size="icon" variant="ghost" className="size-9" title="Remove this skill" aria-label={`Remove ${row.skill}`} onClick={onRemove}><X className="size-4" /></Button>
        )}
      </div>
    </li>
    </ActionMenu>
  );
}

function AddSkills({ catalogue, have, categories, levels, onAdd, ask, openRequests }: {
  catalogue: CatalogueItem[]; have: Set<string>; categories: { id: string; name: string }[]; levels: Level[];
  onAdd: (item: CatalogueItem, level: number) => void; ask: AskCatalogue; openRequests: number;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [asking, setAsking] = useState(false);
  // every word typed is looked for anywhere in the name, its category and its other names, in
  // any order; the skills that hold more of what was typed come first
  const results = useMemo(() => {
    const pool = catalogue.filter((c) => !have.has(c.id) && (!cat || c.categoryId === cat));
    if (!q.trim()) return pool;
    return pool.map((c) => ({ c, score: Math.max(matchScore(q, c.name, c.aliases ?? []), matchScore(q, `${c.name} ${c.category}`) - 0.01) }))
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name)).map((x) => x.c);
  }, [catalogue, have, q, cat]);
  const exists = useMemo(() => catalogue.some((c) => sameName(c.name, q) || sameName(c.name.split(" › ").pop() ?? "", q) || (c.aliases ?? []).some((a) => sameName(a, q))), [catalogue, q]);
  useEffect(() => setShown(PAGE), [q, cat]);
  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <h2 className="flex items-center gap-1.5 border-b px-4 py-3 text-sm font-semibold">Add skills you have
        <Info label="About adding skills">The whole catalogue. Type any part of a name (or a category, or another name it goes by): words are found anywhere, in any order, and the list follows as you type. Press a level to add a skill. It moves up to “Other skills you have”.</Info>
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
          {(!results.length || (q.trim().length >= 2 && !exists && shown >= results.length)) && (
            <li className="grid gap-2 px-3 py-3 text-sm">
              <span>{results.length ? "Not one of these?" : "Not in the catalogue."}</span>
              {q.trim().length >= 2 && !exists && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setAsking(true)}><Send />Ask for “{q.trim()}” as a new skill</Button>
                  <Info label="About asking for a new skill">Skills are the same for everyone, so a new one is approved first by a coordinator. Look at what the search lists before asking: the skill may be there under another name. Once it is approved you can rate it.</Info>
                </div>
              )}
            </li>
          )}
        </ul>
        {results.length > shown && <Button variant="outline" onClick={() => setShown((n) => n + PAGE * 2)}>Show more ({results.length - shown} left)</Button>}
        {openRequests > 0 && <p className="text-xs text-muted-foreground">You asked for {openRequests} new skill{openRequests === 1 ? "" : "s"} that {openRequests === 1 ? "is" : "are"} not decided yet. <Link href="/requests" className="font-medium text-foreground underline-offset-2 hover:underline">See where {openRequests === 1 ? "it is" : "they are"}</Link>.</p>}
      </div>
      {asking && <AskDialog catalogue={ask} initial={{ kind: "skill", name: q.trim(), categoryId: cat || undefined }} onClose={() => setAsking(false)} />}
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
