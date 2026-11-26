"use client";
// What the team needs: N people at a level in a skill. The manager adds, changes and removes
// needs - every one of them, also the must-haves the team's roles imply. A change goes into
// the team's draft and is in force once confirmed under Review changes.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Pencil, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Info } from "@/components/info";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { editTeam } from "@/app/actions/team";
import { cn } from "@/lib/utils";
import { PersonChip } from "@/components/person-avatar";
import { substringFilter } from "@/lib/search";
import { SkillOption, SKILL_PICKER_CLASS, SKILL_LIST_CLASS } from "@/components/skill-option";
import { ActionButton, ActionMenu, type MenuAction } from "@/components/action-menu";
import { skillActions } from "@/components/menus";
import { AskDialog, type AskCatalogue } from "@/components/ask-dialog";

export interface NeedRow {
  skillId: string; skill: string; minLevel: number; levelName: string; headcount: number; note: string; have: number; state: string;
  /** set by the manager (true) or implied by the team's roles (false) */
  explicit: boolean;
  /** changed in the draft: not in force yet */
  draft: boolean;
  holders: string[]; elsewhere: number;
}
type Opt = { id: string; name: string };

const STATE_CLS: Record<string, string> = {
  Covered: "bg-status-meets text-status-meets-fg",
  "One holder": "bg-status-minor text-status-minor-fg",
  Nobody: "bg-status-critical text-status-critical-fg",
};

export function TeamNeeds({ managerId, needs, dismissed, skills, levels, canEdit, ask }: {
  managerId: string; needs: NeedRow[]; dismissed: Opt[]; skills: (Opt & { category: string })[];
  levels: { level: number; name: string }[]; canEdit: boolean; ask: AskCatalogue;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<NeedRow | "new" | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (op: Parameters<typeof editTeam>[1], then?: () => void) => start(async () => {
    const r = await editTeam(managerId, op);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Saved.");
    then?.();
    router.refresh();
  });
  const remove = (n: NeedRow) => act({ op: "removeNeed", skillId: n.skillId, implied: !n.explicit });
  const menu = (n: NeedRow): MenuAction[] => [
    ...(canEdit ? [
      { key: "edit", label: "Change the level or the number of people…", icon: Pencil, onSelect: () => setEditing(n) },
      { key: "remove", label: "Remove this need", hint: n.explicit ? undefined : "It stays off the list until you put it back", icon: Trash2, destructive: true, onSelect: () => remove(n) },
    ] : []),
    ...skillActions({ id: n.skillId, name: n.skill }).map((a, i) => (i === 0 && canEdit ? { ...a, separator: true } : a)),
  ];
  return (
    <div className="grid gap-3">
      {needs.length ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Skill</th>
              <th className="px-3 py-2 text-left font-medium"><span className="inline-flex items-center gap-1">At least<Info label="About the level">The lowest level that counts for this need. Only confirmed ratings count.</Info></span></th>
              <th className="px-3 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Have / need<Info label="About have and need">How many people in the team (the manager and everyone below) are at that level or above, against how many the team needs.</Info></span></th>
              <th className="px-3 py-2 text-left font-medium">Who has it</th>
              <th className="px-3 py-2 text-left font-medium"><span className="inline-flex items-center gap-1">Why<Info label="About why">The manager&apos;s note, or “from the roles” when two or more of the manager&apos;s people are in a role that asks for this skill as a must-have and nobody set a need. Either kind can be removed.</Info></span></th>
              <th />
            </tr></thead>
            <tbody>
              {needs.map((n) => (
                <ActionMenu key={n.skillId} title={n.skill} actions={menu(n)}>
                  <tr className={cn("border-b last:border-0", n.draft && "bg-amber-500/5")}>
                    <td className="px-3 py-2 font-medium">{n.skill}{n.draft && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300" title="Changed: not in force until you confirm">Draft</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{n.minLevel} {n.levelName}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap"><span className={cn("rounded px-1.5 py-0.5 text-xs font-medium tabular", STATE_CLS[n.state] ?? "bg-status-significant text-status-significant-fg")} title={n.state}>{n.have} / {n.headcount}</span></td>
                    <td className="px-3 py-2 text-xs">{n.holders.length ? <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">{n.holders.slice(0, 4).map((h) => <PersonChip key={h} name={h} />)}{n.holders.length > 4 ? <span className="text-muted-foreground">+{n.holders.length - 4}</span> : null}</span> : <span className="text-muted-foreground">nobody yet</span>}
                      {n.elsewhere > 0 && n.have < n.headcount && <div className="text-muted-foreground">{n.elsewhere} elsewhere in the organisation have it</div>}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{n.explicit ? n.note : "from the roles"}</td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      {canEdit && <>
                        <Button variant="ghost" size="icon" aria-label={`Change ${n.skill}`} title="Change" onClick={() => setEditing(n)}><Pencil className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Remove ${n.skill}`} title="Remove" disabled={pending} onClick={() => remove(n)}><Trash2 className="size-3.5" /></Button>
                      </>}
                      <ActionButton actions={menu(n)} title={n.skill} label={`What you can do with ${n.skill}`} className="align-middle" />
                    </td>
                  </tr>
                </ActionMenu>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">No needs yet. Add the skills this team depends on, with how many people and at what level.</p>}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}><Plus />Add a need</Button>
          {pending && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Saving…</span>}
        </div>
      )}
      {dismissed.length > 0 && (
        <div className="rounded-md border border-dashed px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">Taken off the list
            <Info label="About needs taken off the list">Needs the team&apos;s roles imply that the manager removed. They stay off the list until someone puts them back.</Info></span>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {dismissed.map((d) => (
              <li key={d.id} className="inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs">
                {d.name}
                {canEdit && <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" disabled={pending} onClick={() => act({ op: "restoreNeed", skillId: d.id })}><Undo2 />Put back</Button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {editing && (
        <NeedDialog row={editing === "new" ? null : editing} skills={skills} levels={levels} busy={pending} onClose={() => setEditing(null)}
          onAsk={(q) => { setEditing(null); setAsking(q); }}
          onSave={(need) => act({ op: "setNeed", need }, () => setEditing(null))} />
      )}
      {asking != null && <AskDialog catalogue={ask} initial={{ kind: "skill", name: asking }} onClose={() => setAsking(null)} />}
    </div>
  );
}

function NeedDialog({ row, skills, levels, busy, onClose, onSave, onAsk }: {
  row: NeedRow | null; skills: (Opt & { category: string })[]; levels: { level: number; name: string }[]; busy: boolean;
  onClose: () => void; onSave: (need: { skillId: string; minLevel: number; headcount: number; note: string }) => void; onAsk: (name: string) => void;
}) {
  const [skillId, setSkillId] = useState(row?.skillId ?? "");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState(String(row?.minLevel ?? 3));
  const [headcount, setHeadcount] = useState(String(row?.headcount ?? 2));
  const [note, setNote] = useState(row?.note ?? "");
  const [pickOpen, setPickOpen] = useState(false);
  const chosen = skills.find((s) => s.id === skillId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? `Need: ${row.skill}` : "Add a team need"}</DialogTitle>
          <DialogDescription>How many people this team needs at a level. Only confirmed ratings count towards it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {!row && (
            <Field label="Skill" info="The skill the team depends on, from the catalogue (the same for every team). Type to search. If it is not there, ask for it: a coordinator approves new skills.">
              <Popover open={pickOpen} onOpenChange={setPickOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-auto min-h-9 justify-start py-1.5 text-left font-normal whitespace-normal">{chosen ? <SkillOption name={chosen.name} category={chosen.category} /> : "Choose a skill…"}</Button>
                </PopoverTrigger>
                <PopoverContent className={SKILL_PICKER_CLASS} align="start">
                  <Command filter={substringFilter}>
                    <CommandInput placeholder="Find a skill…" value={query} onValueChange={setQuery} />
                    <CommandList className={SKILL_LIST_CLASS}>
                      <CommandEmpty>Not in the catalogue.</CommandEmpty>
                      {query.trim().length >= 2 && !skills.some((s) => s.name.toLowerCase() === query.trim().toLowerCase()) && (
                        <CommandGroup forceMount>
                          <CommandItem forceMount value={`__ask__ ${query}`} onSelect={() => onAsk(query.trim())}>
                            <Send />Ask for “{query.trim()}” as a new skill
                          </CommandItem>
                        </CommandGroup>
                      )}
                      <CommandGroup>
                        {skills.map((s) => (
                          <CommandItem key={s.id} value={`${s.name} ${s.category}`} onSelect={() => { setSkillId(s.id); setPickOpen(false); }}>
                            <SkillOption name={s.name} category={s.category} />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="At least" info="The lowest level that counts. Someone at this level or above counts towards the need.">
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{levels.filter((l) => l.level > 0).map((l) => <SelectItem key={l.level} value={String(l.level)}>{l.level} {l.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="People" htmlFor="hc" info="How many people the team needs at that level. With one, the need is met by one person but flagged as resting on them."><Input id="hc" type="number" min={1} max={500} value={headcount} onChange={(e) => setHeadcount(e.target.value)} /></Field>
          </div>
          <Field label="Why (optional)" htmlFor="why" info="A short reason others see next to the need, e.g. the on-call rota."><Input id="why" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. on-call rota needs two people who can do this" /></Field>
        </div>
        <DialogFooter>
          <Button onClick={() => onSave({ skillId, minLevel: Number(level), headcount: Number(headcount), note })} disabled={busy || !skillId}>{busy && <Loader2 className="animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
