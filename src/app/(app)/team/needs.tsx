"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Info } from "@/components/info";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { saveTeamNeed, removeTeamNeed } from "@/app/actions/team";
import { cn } from "@/lib/utils";
import { substringFilter } from "@/lib/search";
import { SkillOption, SKILL_PICKER_CLASS, SKILL_LIST_CLASS } from "@/components/skill-option";

export interface NeedRow { skillId: string; skill: string; minLevel: number; levelName: string; headcount: number; note: string; have: number; state: string; explicit: boolean; holders: string[]; elsewhere: number }
type Opt = { id: string; name: string };

const STATE_CLS: Record<string, string> = {
  Covered: "bg-status-meets text-status-meets-fg",
  "One holder": "bg-status-minor text-status-minor-fg",
  Nobody: "bg-status-critical text-status-critical-fg",
};

export function TeamNeeds({ managerId, needs, skills, categories, parents, levels, canEdit }: {
  managerId: string; needs: NeedRow[]; skills: (Opt & { category: string })[]; categories: Opt[];
  parents: (Opt & { categoryId: string })[]; levels: { level: number; name: string }[]; canEdit: boolean;
}) {
  const [editing, setEditing] = useState<NeedRow | "new" | null>(null);
  const [pending, start] = useTransition();
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
              <th className="px-3 py-2 text-left font-medium"><span className="inline-flex items-center gap-1">Why<Info label="About why">The manager&apos;s note, or “implied by roles” when two or more of the manager&apos;s people have a role that asks for this skill and nobody set a need.</Info></span></th>
              <th />
            </tr></thead>
            <tbody>
              {needs.map((n) => (
                <tr key={n.skillId} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{n.skill}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{n.minLevel} {n.levelName}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap"><span className={cn("rounded px-1.5 py-0.5 text-xs font-medium tabular", STATE_CLS[n.state] ?? "bg-status-significant text-status-significant-fg")} title={n.state}>{n.have} / {n.headcount}</span></td>
                  <td className="px-3 py-2 text-xs">{n.holders.length ? n.holders.slice(0, 4).join(", ") + (n.holders.length > 4 ? ` +${n.holders.length - 4}` : "") : <span className="text-muted-foreground">nobody yet</span>}
                    {n.elsewhere > 0 && n.have < n.headcount && <div className="text-muted-foreground">{n.elsewhere} elsewhere in the organisation have it</div>}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{n.explicit ? n.note : "implied by roles"}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {canEdit && <>
                      <Button variant="ghost" size="icon" aria-label={`Edit ${n.skill}`} onClick={() => setEditing(n)}><Pencil className="size-3.5" /></Button>
                      {n.explicit && <Button variant="ghost" size="icon" aria-label={`Remove ${n.skill}`} disabled={pending} onClick={() => start(async () => {
                        const r = await removeTeamNeed(managerId, n.skillId);
                        if (r.ok) toast.success(r.message ?? "Removed"); else toast.error(r.error);
                      })}><Trash2 className="size-3.5" /></Button>}
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">No needs yet. Add the skills this team depends on, with how many people and at what level.</p>}
      {canEdit && <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setEditing("new")}><Plus />Add a need</Button>}
      {editing && (
        <NeedDialog managerId={managerId} row={editing === "new" ? null : editing} skills={skills} categories={categories}
          parents={parents} levels={levels} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function NeedDialog({ managerId, row, skills, categories, parents, levels, onClose }: {
  managerId: string; row: NeedRow | null; skills: (Opt & { category: string })[]; categories: Opt[];
  parents: (Opt & { categoryId: string })[]; levels: { level: number; name: string }[]; onClose: () => void;
}) {
  const [skillId, setSkillId] = useState(row?.skillId ?? "");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [parentId, setParentId] = useState("none");
  const [level, setLevel] = useState(String(row?.minLevel ?? 3));
  const [headcount, setHeadcount] = useState(String(row?.headcount ?? 2));
  const [note, setNote] = useState(row?.note ?? "");
  const [pickOpen, setPickOpen] = useState(false);
  const [pending, start] = useTransition();
  const chosen = skills.find((s) => s.id === skillId);

  const save = () => start(async () => {
    const r = await saveTeamNeed({
      managerId, minLevel: Number(level), headcount: Number(headcount), note,
      ...(newName != null
        ? { newSkill: { name: newName, categoryId, parentId: parentId === "none" ? null : parentId } }
        : { skillId }),
    });
    if (r.ok) { toast.success(r.message ?? "Saved"); onClose(); } else toast.error(r.error);
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? `Need: ${row.skill}` : "Add a team need"}</DialogTitle>
          <DialogDescription>How many people this team needs at a level. Only confirmed ratings count towards it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {!row && (newName == null ? (
            <Field label="Skill" info="The skill the team depends on. Type to search the catalogue; if it is not there, add it as a new skill.">
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
                          <CommandItem forceMount value={`__new__ ${query}`} onSelect={() => { setNewName(query.trim()); setPickOpen(false); }}>
                            <Plus />Add “{query.trim()}” as a new skill
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
          ) : (
            <div className="grid gap-3 rounded-md border border-dashed p-3">
              <Field label="New skill" htmlFor="nn" info="A manager's new skill joins the catalogue at once; an administrator can tidy it up in Settings › Skills."><Input id="nn" value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category" info="Where the new skill sits in the catalogue.">
                  <Select value={categoryId} onValueChange={(c) => { setCategoryId(c); setParentId("none"); }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Under (optional)" info="Makes it a sub-skill of an existing skill, e.g. EC2 under AWS. Leave at top level otherwise.">
                  <Select value={parentId} onValueChange={setParentId}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Top level</SelectItem>
                      {parents.filter((p) => p.categoryId === categoryId).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setNewName(null)}>Pick an existing skill instead</Button>
            </div>
          ))}
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
          <Button onClick={save} disabled={pending || (!row && !skillId && !newName?.trim())}>{pending && <Loader2 className="animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
