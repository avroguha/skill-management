"use client";
// My team › Open positions and Training: positions the manager chose to open, with the talent
// to look for in each, and the training that would help the team (computed on the server by
// src/lib/engine/advice.ts). The app never suggests that a team should hire (owner, 2026-11-15).
import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Loader2, X, MoreHorizontal, CheckCircle2, Undo2, Ban, Star, AlertTriangle, GraduationCap, Users, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { savePosition, setPositionStatus, bookTraining } from "@/app/actions/team";
import { LEVEL_CLASS } from "@/lib/status";
import { substringFilter } from "@/lib/search";
import { SkillOption, SKILL_PICKER_CLASS, SKILL_LIST_CLASS } from "@/components/skill-option";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };
type Level = { level: number; name: string };

export interface PositionView {
  id: string; title: string; status: string; headcount: number; note: string;
  createdBy: string; createdAt: string; closedAt: string | null;
  roleId: string | null; gradeId: string | null; roleName: string; gradeName: string;
  input: { skillId: string; level: number }[];
  headline: string;
  lines: string[];
  skills: { skillId: string; skill: string; category: string; level: number; group: "bring" | "coach" | "nice"; source: string; why: string }[];
  alsoCloses: { skillId: string; skill: string; team: string; level: number; short: number; nobody: boolean }[];
  candidates: { id: string; name: string; title: string; team: string; matched: number; of: number }[];
}

export interface TrainingView {
  skillId: string; skill: string; category: string; href: string;
  how: "course" | "coaching" | "external"; why: string; slow: boolean;
  learners: { id: string; name: string; level: number | null; target: number; interest: boolean; booked: boolean; canBook: boolean; reason: "target" | "team" }[];
  mentors: { id: string; name: string; level: number }[];
}

const GROUPS = [
  { key: "bring", title: "Must bring", hint: "The team is short of these: the hire closes the gap." },
  { key: "coach", title: "Can be coached", hint: "Expected for the role; people in the team have it and can bring the hire up to the level." },
  { key: "nice", title: "Nice to have", hint: "Optional for the role." },
] as const;

function LevelChip({ level, name }: { level: number; name?: string }) {
  return <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium tabular whitespace-nowrap", LEVEL_CLASS[Math.max(0, Math.min(5, level))])} title={name}>{level}{name ? ` ${name}` : ""}</span>;
}

// ---- positions ------------------------------------------------------------------------------

export function Positions({ unitId, positions, closed, canManage, roles, grades, skills, levels }: {
  unitId: string; positions: PositionView[]; closed: PositionView[]; canManage: boolean;
  roles: Opt[]; grades: Opt[]; skills: (Opt & { category: string })[]; levels: Level[];
}) {
  const [editing, setEditing] = useState<PositionView | "new" | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const levelName = (n: number) => levels.find((l) => l.level === n)?.name ?? "";
  return (
    <div className="grid gap-4">
      {canManage && (
        <Button size="sm" className="justify-self-start" onClick={() => setEditing("new")} data-tour="add-position"><Plus />Add an open position</Button>
      )}
      {positions.length === 0 && (
        <p className="text-sm text-muted-foreground">No open positions.{canManage ? " When you have one, add it here to see the skills to look for." : ""}</p>
      )}
      {positions.map((p) => <PositionCard key={p.id} p={p} canManage={canManage} levelName={levelName} onEdit={() => setEditing(p)} />)}
      {closed.length > 0 && (
        <div className="grid gap-2">
          <Button variant="ghost" size="sm" className="justify-self-start text-muted-foreground" onClick={() => setShowClosed((s) => !s)}>
            {showClosed ? "Hide" : "Show"} filled and cancelled ({closed.length})
          </Button>
          {showClosed && (
            <ul className="grid gap-1.5 text-sm">
              {closed.map((p) => <ClosedRow key={p.id} p={p} canManage={canManage} />)}
            </ul>
          )}
        </div>
      )}
      {editing && (
        <PositionDialog unitId={unitId} row={editing === "new" ? null : editing} roles={roles} grades={grades}
          skills={skills} levels={levels} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function useStatus() {
  const [pending, start] = useTransition();
  const set = (id: string, s: "open" | "filled" | "cancelled" | "delete") => start(async () => {
    const r = await setPositionStatus(id, s);
    if (r.ok) toast.success(r.message ?? "Saved"); else toast.error(r.error);
  });
  return { pending, set };
}

function PositionCard({ p, canManage, levelName, onEdit }: { p: PositionView; canManage: boolean; levelName: (n: number) => string; onEdit: () => void }) {
  const { pending, set } = useStatus();
  const [confirm, setConfirm] = useState(false);
  return (
    <article className="grid gap-3 rounded-lg border p-4" aria-label={p.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{p.title}{p.headcount > 1 && <span className="ml-2 text-sm font-normal text-muted-foreground">× {p.headcount}</span>}</h3>
          <p className="text-xs text-muted-foreground">
            {[p.roleName ? [p.roleName, p.gradeName].filter(Boolean).join(" · ") : "No role chosen", `added by ${p.createdBy || "someone"}`, new Date(p.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })].join(" · ")}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="outline" onClick={onEdit}><Pencil />Edit</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => set(p.id, "filled")}><CheckCircle2 />Filled</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`More for ${p.title}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => set(p.id, "cancelled")}><Ban />Cancel the position</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}><Trash2 />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {p.note && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{p.note}</p>}

      <div className="rounded-md bg-muted/50 p-3 text-sm">
        <p className="font-medium">{p.headline}</p>
        {p.lines.length > 0 && <ul className="mt-1 grid gap-0.5 text-muted-foreground">{p.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
      </div>

      {p.skills.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {GROUPS.map((g) => {
            const list = p.skills.filter((s) => s.group === g.key);
            return (
              <div key={g.key} className="grid content-start gap-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" title={g.hint}>{g.title} ({list.length})</h4>
                {list.length ? (
                  <ul className="grid gap-1.5">
                    {list.map((s) => (
                      <li key={s.skillId} className="grid gap-0.5 text-sm">
                        <span className="flex items-center justify-between gap-2">
                          <Link href={`/skills/${s.skillId}`} className="truncate hover:underline" title={s.category}>{s.skill}</Link>
                          <LevelChip level={s.level} name={levelName(s.level)} />
                        </span>
                        <span className="text-xs text-muted-foreground">{s.why}{s.source !== "role" ? " Added for this position." : ""}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">None.</p>}
              </div>
            );
          })}
        </div>
      )}

      {p.alsoCloses.length > 0 && (
        <div className="grid gap-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Also short in the team: a plus if they have it</h4>
          <div className="flex flex-wrap gap-1.5">
            {p.alsoCloses.map((a) => (
              <span key={a.skillId} className={cn("rounded-full border px-2 py-0.5 text-xs", a.nobody && "border-status-critical text-status-critical-fg bg-status-critical")}>
                {a.skill} · {a.level}+ · {a.nobody ? "nobody has it" : `${a.short} short`}{a.team ? ` in ${a.team}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {p.candidates.length > 0 && (
        <div className="grid gap-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Already in the organisation with most of these skills</h4>
          <ul className="grid gap-1 text-sm">
            {p.candidates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="min-w-0 truncate"><Link href={`/people/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                  <span className="text-muted-foreground">{[c.title, c.team].filter(Boolean).map((x) => ` · ${x}`).join("")}</span></span>
                <span className="text-xs text-muted-foreground tabular">has {c.matched} of {c.of} required</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{p.title}”?</DialogTitle>
            <DialogDescription>It is removed for good. To keep a record, mark it filled or cancel it instead.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Keep it</Button>
            <Button variant="destructive" disabled={pending} onClick={() => { set(p.id, "delete"); setConfirm(false); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function ClosedRow({ p, canManage }: { p: PositionView; canManage: boolean }) {
  const { pending, set } = useStatus();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
      <span className="min-w-0">
        <span className="font-medium">{p.title}</span>
        <span className="text-muted-foreground"> · {p.status === "filled" ? "Filled" : "Cancelled"}{p.closedAt ? ` ${new Date(p.closedAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}` : ""}</span>
      </span>
      {canManage && (
        <span className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => set(p.id, "open")}><Undo2 />Reopen</Button>
          <Button size="icon" variant="ghost" aria-label={`Delete ${p.title}`} disabled={pending} onClick={() => set(p.id, "delete")}><Trash2 /></Button>
        </span>
      )}
    </li>
  );
}

function SkillPicker({ skills, exclude, onPick }: { skills: (Opt & { category: string })[]; exclude: Set<string>; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" size="sm" className="justify-self-start"><Plus />Add a skill</Button></PopoverTrigger>
      <PopoverContent className={SKILL_PICKER_CLASS} align="start">
        <Command filter={substringFilter}>
          <CommandInput placeholder="Find a skill…" />
          <CommandList className={SKILL_LIST_CLASS}>
            <CommandEmpty>Not in the catalogue.</CommandEmpty>
            <CommandGroup>
              {skills.filter((s) => !exclude.has(s.id)).map((s) => (
                <CommandItem key={s.id} value={`${s.name} ${s.category}`} onSelect={() => { onPick(s.id); setOpen(false); }}>
                  <SkillOption name={s.name} category={s.category} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PositionDialog({ unitId, row, roles, grades, skills, levels, onClose }: {
  unitId: string; row: PositionView | null; roles: Opt[]; grades: Opt[]; skills: (Opt & { category: string })[]; levels: Level[]; onClose: () => void;
}) {
  const [title, setTitle] = useState(row?.title ?? "");
  const [roleId, setRoleId] = useState(row?.roleId ?? "none");
  const [gradeId, setGradeId] = useState(row?.gradeId ?? "none");
  const [headcount, setHeadcount] = useState(String(row?.headcount ?? 1));
  const [picked, setPicked] = useState(row?.input ?? []);
  const [note, setNote] = useState(row?.note ?? "");
  const [pending, start] = useTransition();
  const name = (id: string) => skills.find((s) => s.id === id)?.name ?? "(retired skill)";
  const save = () => start(async () => {
    const r = await savePosition({
      id: row?.id, unitId, title, roleId: roleId === "none" ? null : roleId, gradeId: gradeId === "none" ? null : gradeId,
      headcount: Number(headcount), skills: picked, note,
    });
    if (r.ok) { toast.success(r.message ?? "Saved"); onClose(); } else toast.error(r.error);
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? "Edit the position" : "Add an open position"}</DialogTitle>
          <DialogDescription>Choose a role, add the skills it must have, or both. With neither, the app suggests a role from what the team is short of.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="pt">Title</Label><Input id="pt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Cloud engineer for the platform team" /></div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_5rem]">
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not decided: suggest one</SelectItem>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Grade</Label>
              <Select value={gradeId} onValueChange={setGradeId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any: suggest one</SelectItem>
                  {grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="ph">People</Label><Input id="ph" type="number" min={1} max={100} value={headcount} onChange={(e) => setHeadcount(e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5">
            <Label>Skills it must have {roleId !== "none" && <span className="font-normal text-muted-foreground">(on top of the role's)</span>}</Label>
            {picked.length > 0 && (
              <ul className="grid gap-1.5">
                {picked.map((s, i) => (
                  <li key={s.skillId} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{name(s.skillId)}</span>
                    <Select value={String(s.level)} onValueChange={(lv) => setPicked(picked.map((x, j) => (j === i ? { ...x, level: Number(lv) } : x)))}>
                      <SelectTrigger className="h-8 w-40" aria-label={`Level for ${name(s.skillId)}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{levels.filter((l) => l.level > 0).map((l) => <SelectItem key={l.level} value={String(l.level)}>{l.level} {l.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" aria-label={`Remove ${name(s.skillId)}`} onClick={() => setPicked(picked.filter((_, j) => j !== i))}><X /></Button>
                  </li>
                ))}
              </ul>
            )}
            <SkillPicker skills={skills} exclude={new Set(picked.map((p) => p.skillId))} onPick={(id) => setPicked([...picked, { skillId: id, level: 3 }])} />
          </div>
          <div className="grid gap-1.5"><Label htmlFor="pn">Notes (optional)</Label><Textarea id="pn" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why the position is open, the project, the start date…" /></div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || title.trim().length < 2}>{pending && <Loader2 className="animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- training -------------------------------------------------------------------------------

const HOW: Record<TrainingView["how"], { label: (t: TrainingView) => string; icon: typeof Users }> = {
  course: { label: (t) => `A course for ${t.learners.filter((l) => !l.booked).length} people`, icon: Users },
  coaching: { label: (t) => `Coaching by ${t.mentors.slice(0, 2).map((m) => m.name).join(" or ")}`, icon: UserRound },
  external: { label: () => "External training: nobody in the team has it at that level", icon: GraduationCap },
};

const LEARNERS_SHOWN = 12;

export function TrainingIdeas({ ideas, total, levels }: { ideas: TrainingView[]; total: number; levels: Level[] }) {
  const [booking, setBooking] = useState<TrainingView | null>(null);
  if (!ideas.length) return <p className="text-sm text-muted-foreground">Nothing to suggest: everyone assessed is at their target, and no team need is short.</p>;
  return (
    <div className="grid gap-3">
      {ideas.map((t) => {
        const how = HOW[t.how];
        const open = t.learners.filter((l) => !l.booked);
        const bookable = open.filter((l) => l.canBook);
        return (
          <article key={t.skillId} className="grid gap-2 rounded-lg border p-3" aria-label={t.skill}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={t.href} className="font-medium hover:underline">{t.skill}</Link>
                <span className="text-xs text-muted-foreground"> · {t.category}</span>
                <p className="text-xs text-muted-foreground">{t.why}</p>
              </div>
              {bookable.length > 0 && <Button size="sm" variant="outline" onClick={() => setBooking(t)}><GraduationCap />Book</Button>}
            </div>
            {open.length > 0 && (
              <p className="flex items-center gap-1.5 text-sm"><how.icon className="size-4 shrink-0 text-muted-foreground" />{how.label(t)}</p>
            )}
            {t.slow && (
              <p className="flex items-start gap-1.5 text-sm text-status-critical-fg">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />Nobody in the team is within one level of what it needs yet, so this will take longer.
              </p>
            )}
            {t.learners.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Who">
                {t.learners.slice(0, LEARNERS_SHOWN).map((l) => (
                  <li key={l.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", l.booked && "opacity-60")}
                    title={l.reason === "team" ? "One level below what the team needs" : "Below their own target"}>
                    <Link href={`/people/${l.id}`} className="hover:underline">{l.name}</Link>
                    <span className="tabular text-muted-foreground">{l.level ?? "–"}→{l.target}</span>
                    {l.interest && <Star className="size-3 fill-current text-amber-500" aria-label="wants to learn it" />}
                    {l.booked && <span className="text-muted-foreground">booked</span>}
                  </li>
                ))}
                {t.learners.length > LEARNERS_SHOWN && <li className="px-1 text-xs text-muted-foreground">and {t.learners.length - LEARNERS_SHOWN} more</li>}
              </ul>
            )}
            {t.mentors.length > 0 && t.how !== "coaching" && (
              <p className="text-xs text-muted-foreground">Can help: {t.mentors.slice(0, 4).map((m) => m.name).join(", ")}{t.mentors.length > 4 ? ` and ${t.mentors.length - 4} more` : ""}</p>
            )}
          </article>
        );
      })}
      {total > ideas.length && <p className="text-xs text-muted-foreground">The {ideas.length} that would help most, of {total}.</p>}
      {booking && <BookDialog t={booking} levels={levels} onClose={() => setBooking(null)} />}
    </div>
  );
}

function BookDialog({ t, levels, onClose }: { t: TrainingView; levels: Level[]; onClose: () => void }) {
  const bookable = t.learners.filter((l) => !l.booked && l.canBook);
  const [chosen, setChosen] = useState(new Set(bookable.map((l) => l.id)));
  const [title, setTitle] = useState(t.how === "coaching" ? `${t.skill}: coaching by ${t.mentors[0]?.name ?? ""}` : `${t.skill} ${t.how === "course" ? "course" : "training"}`);
  const [link, setLink] = useState("");
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();
  const levelName = (n: number) => levels.find((l) => l.level === n)?.name ?? "";
  const book = () => start(async () => {
    const r = await bookTraining({
      skillId: t.skillId, title, link, dueOn: due,
      people: bookable.filter((l) => chosen.has(l.id)).map((l) => ({ employeeId: l.id, targetLevel: l.target })),
    });
    if (r.ok) { toast.success(r.message ?? "Booked"); onClose(); } else toast.error(r.error);
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Book {t.skill}</DialogTitle>
          <DialogDescription>A training plan for each person chosen, aiming at their target. They show on each person's profile and under Training.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="bt">Title</Label><Input id="bt" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="grid gap-1.5"><Label htmlFor="bl">Link (optional)</Label><Input id="bl" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></div>
            <div className="grid gap-1.5"><Label htmlFor="bd">Due (optional)</Label><Input id="bd" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-medium">Who</legend>
            {bookable.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={chosen.has(l.id)} onCheckedChange={(c) => {
                  const next = new Set(chosen);
                  if (c) next.add(l.id); else next.delete(l.id);
                  setChosen(next);
                }} />
                <span className="flex-1">{l.name}</span>
                <span className="text-xs text-muted-foreground tabular">{l.level ?? "–"} → {l.target} {levelName(l.target)}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <DialogFooter>
          <Button onClick={book} disabled={pending || !chosen.size || title.trim().length < 3}>{pending && <Loader2 className="animate-spin" />}Book for {chosen.size}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
