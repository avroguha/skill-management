"use client";
// One role's skill matrix: rows are skills, columns are "all grades" plus each grade.
// A grade-specific cell overrides the all-grades cell for people at that grade.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { setRoleSkill } from "@/app/actions/admin";
import { substringFilter } from "@/lib/search";
import { cn } from "@/lib/utils";

type RS = { roleId: string; gradeId: string | null; skillId: string; target: number; mandatory: boolean };

export function RoleMatrix({ roles, grades, skills, roleSkills, levels }: {
  roles: { id: string; name: string }[];
  grades: { id: string; name: string }[];
  skills: { id: string; label: string; category: string }[];
  roleSkills: RS[];
  levels: { level: number; name: string }[];
}) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [added, setAdded] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const mine = roleSkills.filter((r) => r.roleId === roleId);
  const skillIds = useMemo(() => [...new Set([...mine.map((r) => r.skillId), ...added])], [mine, added]);
  const label = (id: string) => skills.find((s) => s.id === id)?.label ?? "(not rateable)";
  const cat = (id: string) => skills.find((s) => s.id === id)?.category ?? "";
  const cell = (skillId: string, gradeId: string | null) => mine.find((r) => r.skillId === skillId && r.gradeId === gradeId);
  const mandatoryOf = (skillId: string) => mine.find((r) => r.skillId === skillId)?.mandatory ?? true;

  const save = (skillId: string, gradeId: string | null, target: number | null, mandatory = mandatoryOf(skillId)) => start(async () => {
    const r = await setRoleSkill({ roleId, gradeId, skillId, target, mandatory });
    if (!r.ok) toast.error(r.error); else router.refresh();
  });
  const setMandatory = (skillId: string, m: boolean) => start(async () => {
    for (const r of mine.filter((x) => x.skillId === skillId)) {
      const res = await setRoleSkill({ roleId, gradeId: r.gradeId, skillId, target: r.target, mandatory: m });
      if (!res.ok) { toast.error(res.error); return; }
    }
    router.refresh();
  });
  const removeRow = (skillId: string) => start(async () => {
    for (const r of mine.filter((x) => x.skillId === skillId)) await setRoleSkill({ roleId, gradeId: r.gradeId, skillId, target: null, mandatory: true });
    setAdded((a) => a.filter((x) => x !== skillId));
    router.refresh();
  });

  const Cell = ({ skillId, gradeId }: { skillId: string; gradeId: string | null }) => {
    const c = cell(skillId, gradeId);
    return (
      <Select value={c ? String(c.target) : "none"} onValueChange={(v) => save(skillId, gradeId, v === "none" ? null : Number(v))}>
        <SelectTrigger size="sm" aria-label={`${label(skillId)} ${gradeId ? grades.find((g) => g.id === gradeId)?.name : "all grades"}`}
          className={cn("h-7 w-32 text-xs", c ? (gradeId ? "border-primary/60 bg-accent" : "") : "text-muted-foreground")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{gradeId ? "as all grades" : "not required"}</SelectItem>
          {levels.filter((l) => l.level > 0).map((l) => <SelectItem key={l.level} value={String(l.level)}>{l.level} {l.name}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  };

  if (!roles.length) return <p className="text-sm text-muted-foreground">Add a role first.</p>;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={roleId} onValueChange={(v) => { setRoleId(v); setAdded([]); }}>
          <SelectTrigger className="h-8 w-64" aria-label="Role"><SelectValue /></SelectTrigger>
          <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
        </Select>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8"><Plus />Add a skill to this role</Button></PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command filter={substringFilter}>
              <CommandInput placeholder="Find a skill…" />
              <CommandList>
                <CommandEmpty>No such skill. Add it in Taxonomy.</CommandEmpty>
                <CommandGroup>
                  {skills.filter((s) => !skillIds.includes(s.id)).map((s) => (
                    <CommandItem key={s.id} value={`${s.label} ${s.category}`} onSelect={() => { setAdded((a) => [...a, s.id]); setOpen(false); save(s.id, null, 3, true); }}>
                      <span className="flex-1 truncate">{s.label}</span><span className="text-xs text-muted-foreground">{s.category}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
      {skillIds.length ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Skill</th>
                <th className="px-2 py-2 text-left font-medium">Mandatory</th>
                <th className="px-2 py-2 text-left font-medium">All grades</th>
                {grades.map((g) => <th key={g.id} className="px-2 py-2 text-left font-medium">{g.name}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {skillIds.sort((a, b) => cat(a).localeCompare(cat(b)) || label(a).localeCompare(label(b))).map((sid) => (
                <tr key={sid} className="border-b last:border-0">
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{label(sid)}</div>
                    <div className="text-xs text-muted-foreground">{cat(sid)}</div>
                  </td>
                  <td className="px-2"><Switch checked={mandatoryOf(sid)} onCheckedChange={(m) => setMandatory(sid, m)} aria-label={`${label(sid)} mandatory`} /></td>
                  <td className="px-2"><Cell skillId={sid} gradeId={null} /></td>
                  {grades.map((g) => <td key={g.id} className="px-2"><Cell skillId={sid} gradeId={g.id} /></td>)}
                  <td className="px-2 text-right">
                    <Button variant="ghost" size="icon" aria-label={`Remove ${label(sid)} from role`} onClick={() => removeRow(sid)}><X className="size-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">This role requires nothing yet. Add the skills it needs.</p>}
      <p className="text-xs text-muted-foreground">
        A grade column overrides “All grades” for people at that grade (highlighted). Optional skills count for the person but never create a team need.
      </p>
    </div>
  );
}
