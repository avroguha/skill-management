"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { saveTeamNeed, removeTeamNeed } from "@/app/actions/team";
import { cn } from "@/lib/utils";
import { substringFilter } from "@/lib/search";

export interface NeedRow { skillId: string; skill: string; minLevel: number; levelName: string; headcount: number; note: string; have: number; state: string }
type Opt = { id: string; name: string };

const STATE_CLS: Record<string, string> = {
  Covered: "bg-status-meets text-status-meets-fg",
  "One holder": "bg-status-minor text-status-minor-fg",
  Nobody: "bg-status-critical text-status-critical-fg",
};

export function TeamNeeds({ unitId, needs, skills, categories, parents, levels }: {
  unitId: string; needs: NeedRow[]; skills: (Opt & { category: string })[]; categories: Opt[];
  parents: (Opt & { categoryId: string })[]; levels: { level: number; name: string }[];
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
              <th className="px-3 py-2 text-left font-medium">Level</th>
              <th className="px-3 py-2 text-right font-medium">Have / need</th>
              <th className="px-3 py-2 text-left font-medium">State</th>
              <th className="px-3 py-2 text-left font-medium">Why</th>
              <th />
            </tr></thead>
            <tbody>
              {needs.map((n) => (
                <tr key={n.skillId} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{n.skill}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{n.minLevel} {n.levelName}+</td>
                  <td className="px-3 py-2 text-right tabular">{n.have} / {n.headcount}</td>
                  <td className="px-3 py-2"><span className={cn("rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", STATE_CLS[n.state] ?? "bg-status-significant text-status-significant-fg")}>{n.state}</span></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{n.note}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${n.skill}`} onClick={() => setEditing(n)}><Pencil className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${n.skill}`} disabled={pending} onClick={() => start(async () => {
                      const r = await removeTeamNeed(unitId, n.skillId);
                      if (r.ok) toast.success(r.message ?? "Removed"); else toast.error(r.error);
                    })}><Trash2 className="size-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">No needs of its own yet. Add the skills this team depends on, with how many people and at what level.</p>}
      <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setEditing("new")}><Plus />Add a need</Button>
      {editing && (
        <NeedDialog unitId={unitId} row={editing === "new" ? null : editing} skills={skills} categories={categories}
          parents={parents} levels={levels} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function NeedDialog({ unitId, row, skills, categories, parents, levels, onClose }: {
  unitId: string; row: NeedRow | null; skills: (Opt & { category: string })[]; categories: Opt[];
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
      unitId, minLevel: Number(level), headcount: Number(headcount), note,
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
          <DialogDescription>How many people this team needs at a level. Coverage counts manager-validated ratings.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {!row && (newName == null ? (
            <div className="grid gap-1.5">
              <Label>Skill</Label>
              <Popover open={pickOpen} onOpenChange={setPickOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-between font-normal">{chosen ? `${chosen.name} · ${chosen.category}` : "Choose a skill…"}</Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command filter={substringFilter}>
                    <CommandInput placeholder="Find a skill…" value={query} onValueChange={setQuery} />
                    <CommandList>
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
                            <span className="flex-1 truncate">{s.name}</span><span className="text-xs text-muted-foreground">{s.category}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="grid gap-3 rounded-md border border-dashed p-3">
              <div className="grid gap-1.5"><Label htmlFor="nn">New skill</Label><Input id="nn" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Category</Label>
                  <Select value={categoryId} onValueChange={(c) => { setCategoryId(c); setParentId("none"); }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Under (optional)</Label>
                  <Select value={parentId} onValueChange={setParentId}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Top level</SelectItem>
                      {parents.filter((p) => p.categoryId === categoryId).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setNewName(null)}>Pick an existing skill instead</Button>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>At least</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{levels.filter((l) => l.level > 0).map((l) => <SelectItem key={l.level} value={String(l.level)}>{l.level} {l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="hc">People</Label><Input id="hc" type="number" min={1} max={500} value={headcount} onChange={(e) => setHeadcount(e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="why">Why (optional)</Label><Input id="why" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. on-call rota needs two people who can do this" /></div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || (!row && !skillId && !newName?.trim())}>{pending && <Loader2 className="animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
