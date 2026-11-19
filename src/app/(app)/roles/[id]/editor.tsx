"use client";
// A role's name, and the skills it needs. Adding a skill searches the catalogue as you type;
// a skill that is not there can be added on the spot (its name must be new).
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Info } from "@/components/info";
import { NameSearch, SimilarNames, type NameItem } from "@/components/name-search";
import { removeRoleNeed, saveRoleNeed, updateRole } from "@/app/actions/roles";
import { suggestSkill } from "@/app/actions/team";

export interface RoleNeedRow { skillId: string; skill: string; category: string; target: number | null; mandatory: boolean; grades: string }

/** The role's name with a pencil (managers and administrators): rename it, describe it. */
export function RoleTitle({ id, name, description, canEdit, others }: { id: string; name: string; description: string; canEdit: boolean; others: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(name);
  const [d, setD] = useState(description);
  const [busy, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1.5">
      {name}
      {canEdit && <Button size="icon" variant="ghost" className="size-7" aria-label="Rename or describe the role" onClick={() => { setN(name); setD(description); setOpen(true); }}><Pencil className="size-3.5" /></Button>}
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>The role</DialogTitle>
              <DialogDescription>Its name and what it is for. Everyone sees both on Roles.</DialogDescription>
            </DialogHeader>
            <form className="grid gap-3" onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await updateRole({ id, name: n, description: d });
                if (!r.ok) { toast.error(r.error); return; }
                toast.success(r.message ?? "Saved.");
                setOpen(false);
                router.refresh();
              });
            }}>
              <Field label="Name" htmlFor="role-name" info="What the role is called everywhere. Unique: other roles with a name like it are listed as you type.">
                <Input id="role-name" value={n} onChange={(e) => setN(e.target.value)} maxLength={80} autoComplete="off" />
                {n.trim() !== name && <SimilarNames query={n} items={others.map((o) => ({ ...o, href: `/roles/${o.id}` }))} noun="role" />}
              </Field>
              <Field label="What it is for" htmlFor="role-desc" info="One or two lines, so people can tell it from roles with a similar name.">
                <Textarea id="role-desc" rows={3} value={d} onChange={(e) => setD(e.target.value)} maxLength={500} />
              </Field>
              <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </span>
  );
}

export function RoleEditor({ roleId, rows, canEdit, catalogue, levels, categories, isAdmin }: {
  roleId: string; rows: RoleNeedRow[]; canEdit: boolean; catalogue: NameItem[];
  levels: { level: number; name: string }[]; categories: { id: string; name: string }[]; isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("3");
  const [categoryId, setCategoryId] = useState("");
  const levelName = (n: number | null) => (n == null ? "–" : `${n} ${levels.find((l) => l.level === n)?.name ?? ""}`.trim());
  const inRole = new Set(rows.map((r) => r.skillId));

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast.error(r.error ?? "Not saved."); return; }
    after?.();
    router.refresh();
  });
  const addExisting = (item: NameItem) => {
    if (inRole.has(item.id)) { toast.info(`${item.name} is already in this role: change its level in the list.`); return; }
    run(() => saveRoleNeed({ roleId, skillId: item.id, target: Number(level), mandatory: true }), () => { toast.success(`${item.name} added.`); setQ(""); });
  };
  const addNew = (name: string) => {
    if (!categoryId) { toast.error("Choose the category of the new skill first."); return; }
    start(async () => {
      const s = await suggestSkill({ name, categoryId });
      if (!s.ok || !s.id) { toast.error(s.ok ? "Not added." : s.error); return; }
      const r = await saveRoleNeed({ roleId, skillId: s.id, target: Number(level), mandatory: true });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(`${name} added to the catalogue and to this role.`);
      setQ("");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-3">
      {rows.length ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Skill</th>
                <th className="px-2 py-2 text-left font-medium"><span className="inline-flex items-center gap-1">Level needed<Info label="About the level">The level the role needs in this skill, for every grade. Where a grade needs another level it is shown underneath (set in Settings › Roles &amp; targets).</Info></span></th>
                <th className="px-2 py-2 text-left font-medium"><span className="inline-flex items-center gap-1">Must have<Info label="About must-have">On: not reaching the level is a gap, and the skill counts in what a team needs. Off: nice to have, shown but never a gap.</Info></span></th>
                {canEdit && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.skillId} className="border-b last:border-0">
                  <td className="px-3 py-1.5">
                    <Link href={`/skills/${r.skillId}`} className="font-medium hover:underline">{r.skill}</Link>
                    <div className="text-xs text-muted-foreground">{r.category}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    {canEdit ? (
                      <Select value={r.target ? String(r.target) : undefined} onValueChange={(x) => run(() => saveRoleNeed({ roleId, skillId: r.skillId, target: Number(x), mandatory: r.mandatory }))}>
                        <SelectTrigger size="sm" className="h-8 w-40" aria-label={`Level needed in ${r.skill}`}><SelectValue placeholder="per grade" /></SelectTrigger>
                        <SelectContent>{levels.filter((l) => l.level > 0).map((l) => <SelectItem key={l.level} value={String(l.level)}>{l.level} {l.name}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <span>{levelName(r.target)}</span>}
                    {r.grades && <div className="mt-0.5 text-xs text-muted-foreground">{r.grades}</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    {canEdit && r.target ? <Switch checked={r.mandatory} aria-label={`${r.skill} is a must-have`} onCheckedChange={(m) => run(() => saveRoleNeed({ roleId, skillId: r.skillId, target: r.target!, mandatory: m }))} />
                      : <span className="text-muted-foreground">{r.mandatory ? "Yes" : "Nice to have"}</span>}
                  </td>
                  {canEdit && (
                    <td className="px-1 text-right">
                      <Button variant="ghost" size="icon" aria-label={`Remove ${r.skill} from the role`} disabled={busy} onClick={() => run(() => removeRoleNeed(roleId, r.skillId), () => toast.success(`${r.skill} removed from the role.`))}><X className="size-3.5" /></Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">This role needs no skills yet.{canEdit ? " Add the ones it needs below." : ""}</p>
      )}

      {canEdit && (adding ? (
        <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium">Add a skill to this role
              <Info label="About adding a skill">Type any part of the skill&apos;s name: the catalogue is searched as you type (words in any order, other names it goes by too). Press Add next to the one you mean. If it is not there, add it as a new skill: skill names are unique, so first look at what is listed.</Info></span>
            <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setQ(""); }}><Check />Done</Button>
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-[1fr_11rem]">
            <NameSearch value={q} onValueChange={setQ} noun="skill" autoFocus busy={busy} limit={8}
              items={catalogue.map((c) => (inRole.has(c.id) ? { ...c, hint: `${c.hint} · already in this role` } : c))}
              onPick={addExisting} pickLabel="Add" onAdd={addNew} placeholder="Type a skill, e.g. Kubernetes or incident…">
              <Field label="Category of the new skill" info="Where the new skill belongs in the catalogue. An administrator can move it later.">
                <Select value={categoryId || undefined} onValueChange={setCategoryId}>
                  <SelectTrigger className="w-full" aria-label="Category of the new skill"><SelectValue placeholder="Choose a category…" /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </NameSearch>
            <Field label="Level needed" info="The level the role needs in the skill you add. Change it in the list at any time.">
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="w-full" aria-label="Level needed"><SelectValue /></SelectTrigger>
                <SelectContent>{levels.filter((l) => l.level > 0).map((l) => <SelectItem key={l.level} value={String(l.level)}>{l.level} {l.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setAdding(true)}><Plus />Add a skill to this role</Button>
          {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {isAdmin && <Link href="/settings/roles" className="text-xs text-muted-foreground hover:underline">Levels per grade: Settings › Roles &amp; targets</Link>}
        </div>
      ))}
    </div>
  );
}
