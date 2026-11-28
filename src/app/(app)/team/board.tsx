"use client";
// A team's roles, one section each: the people in the role and the skills it asks for.
//  - Drag a person onto a role to move them there; hold Ctrl while dropping to add them to
//    that role as well (a person can be in several).
//  - Tick several people and add them to a role in one go.
//  - Right-click a person, a role or a skill (or press its "⋯") for everything else, among it
//    asking one person for extra skills beyond their roles (shown on their card as "plus").
//  - Each role has its own soft colour, here and wherever the role shows; the manager can
//    choose another from the same list of tints (the dot beside its name).
// Every change goes into the team's draft: nothing is in force until it is confirmed under
// Review changes.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown, ArrowUp, BriefcaseBusiness, Check, Copy, Loader2, PencilLine, Plus, Search, Send, Shapes, Trash2,
  UserMinus, UserPlus, Users, ArrowRightLeft, CircleDot, Circle, GripVertical, Palette,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field, Info, ToggleField } from "@/components/info";
import { PersonAvatar } from "@/components/person-avatar";
import { ActionButton, ActionMenu, type MenuAction } from "@/components/action-menu";
import { personActions, skillActions } from "@/components/menus";
import { AskDialog, type AskCatalogue } from "@/components/ask-dialog";
import { editTeam } from "@/app/actions/team";
import { RoleChip } from "@/components/role-chip";
import { matchScore, sameName } from "@/lib/similar";
import { ROLE_TINTS, nextTint, tintColor, tintStyle } from "@/lib/role-colors";
import { cn } from "@/lib/utils";
import type { Level } from "@/components/level-picker";

export interface BoardSkill { skillId: string; name: string; category: string; target: number; mandatory: boolean; draft: boolean }
/** A skill asked of one person beyond their roles, with why. */
export interface BoardExtra extends BoardSkill { note: string }
export interface BoardPerson { id: string; name: string; title: string; photo: string | null; href: string; status: string; tone: "done" | "wait" | "todo" | "none"; rated: string; extras?: BoardExtra[] }
export interface BoardRole { id: string; name: string; description: string; /** its soft colour: a key of role-colors.ts */ tint: string; draft: boolean; members: { id: string; draft: boolean }[]; skills: BoardSkill[] }
export interface CatalogueSkill { id: string; name: string; category: string; categoryId: string; aliases?: string[] }
type Op = Parameters<typeof editTeam>[1];

const TONE: Record<BoardPerson["tone"], string> = {
  done: "bg-status-meets text-status-meets-fg",
  wait: "bg-status-minor text-status-minor-fg",
  todo: "bg-status-significant text-status-significant-fg",
  none: "bg-muted text-muted-foreground",
};
const DRAG = "application/x-skill-person";

export function TeamBoard({ managerId, canEdit, roles, people, catalogue, categories, levels, ask }: {
  managerId: string; canEdit: boolean; roles: BoardRole[]; people: BoardPerson[];
  catalogue: CatalogueSkill[]; categories: { id: string; name: string }[]; levels: Level[]; ask: AskCatalogue;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<string | null>(null);
  const [roleDialog, setRoleDialog] = useState<{ role?: BoardRole; copyOf?: BoardRole } | null>(null);
  const [skillsFor, setSkillsFor] = useState<BoardRole | null>(null);
  // asking one person for extra skills; with k, changing that one (its level, its reason)
  const [extrasFor, setExtrasFor] = useState<{ p: BoardPerson; k?: BoardExtra } | null>(null);
  const [peopleFor, setPeopleFor] = useState<BoardRole | null>(null);
  const [removing, setRemoving] = useState<BoardRole | null>(null);
  const [asking, setAsking] = useState<string | null>(null);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const rolesOf = useMemo(() => {
    const m = new Map<string, BoardRole[]>();
    for (const r of roles) for (const x of r.members) m.set(x.id, [...(m.get(x.id) ?? []), r]);
    return m;
  }, [roles]);
  const unassigned = people.filter((p) => !rolesOf.has(p.id));
  const levelName = (n: number) => levels.find((l) => l.level === n)?.name ?? "";

  const act = (op: Op, then?: () => void) => start(async () => {
    const r = await editTeam(managerId, op);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Saved.");
    then?.();
    router.refresh();
  });
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addSelected = (role: BoardRole) => act({ op: "addMembers", roleId: role.id, employeeIds: [...selected] }, () => setSelected(new Set()));

  // ---- what a right-click offers
  const personMenu = (p: BoardPerson, role: BoardRole | null): MenuAction[] => {
    if (!canEdit) return personActions(p);
    const mine = rolesOf.get(p.id) ?? [];
    const others = roles.filter((r) => !mine.some((m) => m.id === r.id));
    const none = roles.length <= (role ? 1 : 0) ? "Make another role first." : "They are in every role already.";
    const out: MenuAction[] = [];
    out.push({
      key: "add", label: role ? "Also add to another role" : "Add to a role", icon: UserPlus, disabled: others.length ? false : none,
      children: others.map((r) => ({ key: r.id, label: r.name, icon: BriefcaseBusiness, onSelect: () => act({ op: "addMembers", roleId: r.id, employeeIds: [p.id] }) })),
    });
    if (role) {
      out.push({
        key: "move", label: "Move to another role", hint: `Out of ${role.name}, into the one you choose`, icon: ArrowRightLeft, disabled: others.length ? false : none,
        children: others.map((r) => ({ key: r.id, label: r.name, icon: BriefcaseBusiness, onSelect: () => act({ op: "moveMember", from: role.id, to: r.id, employeeId: p.id }) })),
      });
      out.push({
        key: "remove", label: `Take out of ${role.name}`, icon: UserMinus, destructive: true,
        disabled: mine.length <= 1 ? "This is the only role they are in. Move them to another role instead." : false,
        onSelect: () => act({ op: "removeMember", roleId: role.id, employeeId: p.id }),
      });
    }
    out.push({ key: "extras", label: "Ask for extra skills…", hint: "Beyond their roles, for them alone", icon: Shapes, onSelect: () => setExtrasFor({ p }) });
    out.push({ key: "select", label: selected.has(p.id) ? "Untick" : "Tick, to add several at once", icon: Check, onSelect: () => toggle(p.id) });
    return [...out, ...personActions(p).map((a, i) => (i === 0 ? { ...a, separator: true } : a))];
  };
  const colourMenu = (r: BoardRole): MenuAction[] => ROLE_TINTS.map((t) => ({
    key: t.key, label: t.name, swatch: tintColor(t.key), hint: t.key === r.tint ? "Its colour now" : undefined,
    onSelect: t.key === r.tint ? undefined : () => act({ op: "updateRole", roleId: r.id, name: r.name, color: t.key }),
  }));
  const roleMenu = (r: BoardRole, i: number): MenuAction[] => [
    { key: "people", label: "Add people…", icon: UserPlus, onSelect: () => setPeopleFor(r) },
    { key: "skills", label: "Add skills…", icon: Shapes, onSelect: () => setSkillsFor(r) },
    { key: "edit", label: "Rename or describe…", icon: PencilLine, separator: true, onSelect: () => setRoleDialog({ role: r }) },
    { key: "colour", label: "Colour", hint: "A soft tint, to tell this role from the others", icon: Palette, children: colourMenu(r) },
    { key: "copy", label: "Make a copy…", hint: "A new role with the same skills", icon: Copy, onSelect: () => setRoleDialog({ copyOf: r }) },
    { key: "up", label: "Move up", icon: ArrowUp, disabled: i === 0, onSelect: () => act({ op: "moveRole", roleId: r.id, by: -1 }) },
    { key: "down", label: "Move down", icon: ArrowDown, disabled: i === roles.length - 1, onSelect: () => act({ op: "moveRole", roleId: r.id, by: 1 }) },
    { key: "delete", label: "Delete this role…", icon: Trash2, destructive: true, separator: true, onSelect: () => setRemoving(r) },
  ];
  const skillMenu = (r: BoardRole, k: BoardSkill): MenuAction[] => {
    const base = skillActions({ id: k.skillId, name: k.name });
    if (!canEdit) return base;
    return [
      { key: "level", label: `Level asked: ${k.target} ${levelName(k.target)}`, icon: CircleDot,
        children: levels.filter((l) => l.level > 0).map((l) => ({ key: String(l.level), label: `${l.level} ${l.name}`, icon: l.level === k.target ? Check : Circle,
          onSelect: () => act({ op: "setSkills", roleId: r.id, skills: [{ skillId: k.skillId, target: l.level, mandatory: k.mandatory }] }) })) },
      { key: "must", label: k.mandatory ? "Make it a nice-to-have" : "Make it a must-have", hint: k.mandatory ? "Now a must-have: it counts as a gap when missing" : "Now a nice-to-have",
        icon: k.mandatory ? Circle : CircleDot, onSelect: () => act({ op: "setSkills", roleId: r.id, skills: [{ skillId: k.skillId, target: k.target, mandatory: !k.mandatory }] }) },
      { key: "remove", label: `Remove from ${r.name}`, icon: Trash2, destructive: true, onSelect: () => act({ op: "removeSkill", roleId: r.id, skillId: k.skillId }) },
      ...base.map((a, i) => (i === 0 ? { ...a, separator: true } : a)),
    ];
  };

  const extraMenu = (p: BoardPerson, k: BoardExtra): MenuAction[] => {
    const base = skillActions({ id: k.skillId, name: k.name });
    if (!canEdit) return base;
    const set = (target: number, mandatory: boolean) => act({ op: "setExtras", employeeId: p.id, skills: [{ skillId: k.skillId, target, mandatory }] });
    return [
      { key: "level", label: `Level asked: ${k.target} ${levelName(k.target)}`, icon: CircleDot,
        children: levels.filter((l) => l.level > 0).map((l) => ({ key: String(l.level), label: `${l.level} ${l.name}`, icon: l.level === k.target ? Check : Circle, onSelect: () => set(l.level, k.mandatory) })) },
      { key: "must", label: k.mandatory ? "Make it a nice-to-have" : "Make it a must-have", icon: k.mandatory ? Circle : CircleDot, onSelect: () => set(k.target, !k.mandatory) },
      { key: "why", label: k.note ? "Change why…" : "Say why…", hint: k.note || "Shown to them", icon: PencilLine, onSelect: () => setExtrasFor({ p, k }) },
      { key: "remove", label: `No longer ask it of ${p.name.split(" ")[0]}`, icon: Trash2, destructive: true, onSelect: () => act({ op: "removeExtra", employeeId: p.id, skillId: k.skillId }) },
      ...base.map((a, i) => (i === 0 ? { ...a, separator: true } : a)),
    ];
  };

  // ---- drag and drop
  const onDrop = (e: React.DragEvent, role: BoardRole) => {
    e.preventDefault();
    setOver(null);
    let d: { id: string; from: string } | null = null;
    try { d = JSON.parse(e.dataTransfer.getData(DRAG)); } catch { /* not one of ours */ }
    if (!d || d.from === role.id) return;
    const also = e.ctrlKey || e.metaKey || e.altKey;
    if (role.members.some((m) => m.id === d!.id)) {
      if (d.from && !also) act({ op: "moveMember", from: d.from, to: role.id, employeeId: d.id });
      else toast.message(`${byId.get(d.id)?.name ?? "They"} is in ${role.name} already.`);
      return;
    }
    act(d.from && !also ? { op: "moveMember", from: d.from, to: role.id, employeeId: d.id } : { op: "addMembers", roleId: role.id, employeeIds: [d.id] });
  };

  const card = (p: BoardPerson, role: BoardRole | null, draft: boolean) => {
    const mine = rolesOf.get(p.id) ?? [];
    const also = mine.filter((r) => r.id !== role?.id);
    const menu = personMenu(p, role);
    return (
      <ActionMenu key={p.id} title={p.name} actions={menu}>
        <li draggable={canEdit}
          onDragStart={(e) => { e.dataTransfer.setData(DRAG, JSON.stringify({ id: p.id, from: role?.id ?? "" })); e.dataTransfer.effectAllowed = "copyMove"; }}
          className={cn("group/card flex min-w-0 items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm",
            canEdit && "cursor-grab active:cursor-grabbing", selected.has(p.id) && "border-primary bg-accent/40", draft && "border-dashed border-amber-500/70")}>
          {canEdit && <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} aria-label={`Tick ${p.name}`} />}
          <PersonAvatar name={p.name} src={p.photo} size="sm" />
          <span className="min-w-0 flex-1">
            <Link href={p.href} draggable={false} className="block truncate font-medium hover:underline">{p.name}</Link>
            <span className="block truncate text-xs text-muted-foreground">{p.title || "–"}</span>
            {also.length > 0 && (
              <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">also
                {also.map((r) => <RoleChip key={r.id} name={r.name} tint={r.tint} className="px-1.5 py-0 text-[11px]" />)}
              </span>
            )}
            {/* what their manager asks of them alone, beyond their roles */}
            {p.extras?.length ? (
              <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">plus
                {p.extras.map((k) => (
                  <ActionButton key={k.skillId} actions={extraMenu(p, k)} title={k.name}
                    label={`${k.name}: asked of ${p.name} alone, level ${k.target} ${levelName(k.target)}, ${k.mandatory ? "must-have" : "nice-to-have"}${k.note ? `. Why: ${k.note}` : ""}${k.draft ? ". Not confirmed yet" : ""}. Press to change.`}
                    className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-0 text-[11px] text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                      !k.mandatory && "border-dashed text-muted-foreground", k.draft && "border-amber-500/70 bg-amber-500/10")}>
                    <span className="font-semibold tabular">{k.target}</span><span className="min-w-0 truncate">{k.name}</span>
                  </ActionButton>
                ))}
              </span>
            ) : null}
          </span>
          {draft && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300" title="Added in your changes: not in force until you confirm">Draft</span>}
          <span className={cn("hidden shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap sm:inline", TONE[p.tone])} title={p.rated ? `${p.status} · ${p.rated} rated` : p.status}>{p.status}</span>
          {canEdit && <GripVertical className="hidden size-3.5 shrink-0 text-muted-foreground/50 group-hover/card:block" aria-hidden />}
          <ActionButton actions={menu} title={p.name} label={`What you can do with ${p.name}`} />
        </li>
      </ActionMenu>
    );
  };

  return (
    <div className="grid gap-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setRoleDialog({})} data-tour="new-role"><Plus />New role</Button>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-accent/40 px-2 py-1 text-sm">
              <span className="font-medium tabular">{selected.size} ticked</span>
              <Select value="" onValueChange={(id) => { const r = roles.find((x) => x.id === id); if (r) addSelected(r); }} disabled={!roles.length || busy}>
                <SelectTrigger className="h-8 w-52" aria-label="Add the ticked people to a role"><SelectValue placeholder={roles.length ? "Add them to a role…" : "Make a role first"} /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}><span className="tint-dot size-2.5 shrink-0 rounded-full" style={tintStyle(r.tint)} aria-hidden />{r.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())}>Untick all</Button>
            </div>
          )}
          {busy && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Saving…</span>}
          <p className="basis-full text-xs text-muted-foreground">
            Drag a person onto a role to move them there (hold Ctrl while dropping to add them to that role as well). Tick several people to add them in one go.
            Right-click a person, a role or a skill, or press its ⋯, for everything you can do with it: on a person, <b>Ask for extra skills</b> asks them alone for skills beyond their roles. Each role has its own soft colour; press the dot beside its name to choose another.
          </p>
        </div>
      )}

      {unassigned.length > 0 && (
        <section aria-label="No role yet" className="min-w-0 rounded-lg border border-dashed bg-card">
          <h3 className="flex flex-wrap items-center gap-1.5 border-b border-dashed px-4 py-2.5 text-sm font-semibold">
            No role yet <span className="font-normal text-muted-foreground">({unassigned.length})</span>
            <Info label="About No role yet">People who report to this manager and are in no role. Nobody gets a role by themselves: the manager puts each person in one. Until then nothing is asked of them, and they can only add skills of their own.</Info>
            {canEdit && roles.length > 0 && <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setSelected(new Set(unassigned.map((p) => p.id)))}>Tick all {unassigned.length}</Button>}
          </h3>
          <ul className="grid gap-1.5 p-3 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">{unassigned.map((p) => card(p, null, false))}</ul>
        </section>
      )}

      {roles.length === 0 && (
        <div className="rounded-lg border bg-card px-4 py-8 text-center">
          <BriefcaseBusiness className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h3 className="mt-2 font-semibold">This team has no roles yet</h3>
          <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
            A role is a group inside the team, with the skills it asks for: Service desk, SRE, Team lead. Make as many as the team needs, add the skills each one asks for, and put people in them. A person can be in more than one.
          </p>
          {canEdit && <Button className="mt-3" onClick={() => setRoleDialog({})}><Plus />Make the first role</Button>}
        </div>
      )}

      {roles.map((r, i) => {
        const menu = canEdit ? roleMenu(r, i) : [];
        return (
          <ActionMenu key={r.id} title={r.name} actions={menu}>
            <section aria-label={`Role ${r.name}`} style={tintStyle(r.tint)}
              onDragOver={canEdit ? (e) => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey || e.altKey ? "copy" : "move"; setOver(r.id); } } : undefined}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((x) => (x === r.id ? null : x)); }}
              onDrop={canEdit ? (e) => onDrop(e, r) : undefined}
              className={cn("tint-edge min-w-0 overflow-hidden rounded-lg border bg-card transition-shadow", r.draft ? "border-dashed border-amber-500/70" : "tint-border", over === r.id && "ring-2 ring-primary")}>
              <header className="tint-band tint-border flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2.5">
                {canEdit ? (
                  <ActionButton actions={colourMenu(r)} title={`Colour of ${r.name}`} label={`Colour of the role ${r.name}. Press to choose another.`} align="start"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-background/70 focus-visible:outline-2 focus-visible:outline-ring">
                    <span className="tint-dot size-3.5 rounded-full border border-foreground/20" aria-hidden />
                  </ActionButton>
                ) : <span className="tint-dot size-3.5 shrink-0 rounded-full border border-foreground/20" aria-hidden />}
                <h3 className="min-w-0 truncate text-sm font-semibold">{r.name}</h3>
                {r.draft && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">New, not confirmed</span>}
                <span className="text-xs text-muted-foreground tabular">{r.members.length} {r.members.length === 1 ? "person" : "people"} · {r.skills.length} {r.skills.length === 1 ? "skill" : "skills"}</span>
                {canEdit && (
                  <span className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPeopleFor(r)}><UserPlus />Add people</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSkillsFor(r)}><Shapes />Add skills</Button>
                    <ActionButton actions={menu} title={r.name} label={`What you can do with the role ${r.name}`} />
                  </span>
                )}
                {r.description && <p className="basis-full text-xs text-muted-foreground">{r.description}</p>}
              </header>
              <div className="grid gap-4 p-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="min-w-0">
                  <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Users className="size-3.5" />People in this role</h4>
                  {r.members.length ? (
                    <ul className="grid gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
                      {r.members.map((m) => (byId.get(m.id) ? card(byId.get(m.id)!, r, m.draft) : null))}
                    </ul>
                  ) : <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">Nobody yet.{canEdit ? " Drag people here, or press Add people." : ""}</p>}
                </div>
                <div className="min-w-0">
                  <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Shapes className="size-3.5" />Skills this role asks for
                    <Info label="About a role’s skills">The skills people in this role are asked to rate, with the level the role asks for. A solid chip is a must-have; a dashed one is a nice-to-have. {canEdit ? "Press a chip to change its level or remove it." : ""}</Info>
                  </h4>
                  {r.skills.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {r.skills.map((k) => {
                        const km = skillMenu(r, k);
                        return (
                          <li key={k.skillId}>
                            <ActionMenu title={k.name} actions={km}>
                              <span className="inline-flex">
                                <ActionButton actions={km} title={k.name} label={`${k.name}: level ${k.target} ${levelName(k.target)}, ${k.mandatory ? "must-have" : "nice-to-have"}. Press to change.`}
                                  className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                                    !k.mandatory && "border-dashed text-muted-foreground", k.draft && "border-amber-500/70 bg-amber-500/10")}>
                                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular", k.mandatory ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{k.target}</span>
                                  <span className="min-w-0 break-words">{k.name}</span>
                                </ActionButton>
                              </span>
                            </ActionMenu>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No skills yet.{canEdit ? " Press Add skills." : ""}</p>}
                </div>
              </div>
            </section>
          </ActionMenu>
        );
      })}

      {roleDialog && (
        <RoleDialog roles={roles} role={roleDialog.role} copyOf={roleDialog.copyOf} busy={busy} onClose={() => setRoleDialog(null)}
          onSave={(name, description, color) => act(roleDialog.role
            ? { op: "updateRole", roleId: roleDialog.role.id, name, description, color }
            : { op: "addRole", id: crypto.randomUUID(), name, description, color, copyOf: roleDialog.copyOf?.id ?? null }, () => setRoleDialog(null))} />
      )}
      {peopleFor && (
        <PeopleDialog role={peopleFor} people={people} rolesOf={rolesOf} busy={busy} onClose={() => setPeopleFor(null)}
          onAdd={(ids) => act({ op: "addMembers", roleId: peopleFor.id, employeeIds: ids }, () => setPeopleFor(null))} />
      )}
      {skillsFor && (
        <SkillsDialog title={`Add skills to ${skillsFor.name}`} have={skillsFor.skills.map((k) => k.skillId)}
          description="From the catalogue, which is the same for every team. Tick the skills this role asks for; change a skill’s level afterwards by pressing its chip."
          levelLabel="Level the role asks for" levelInfo="The level a person in this role should reach in these skills. You can set a different level per skill afterwards."
          catalogue={catalogue} categories={categories} levels={levels} busy={busy} onClose={() => setSkillsFor(null)}
          onAsk={(q) => { setSkillsFor(null); setAsking(q); }}
          onAdd={(skills) => act({ op: "setSkills", roleId: skillsFor.id, skills }, () => setSkillsFor(null))} />
      )}
      {extrasFor && (
        <SkillsDialog title={extrasFor.k ? `${extrasFor.k.name}, asked of ${extrasFor.p.name}` : `Ask ${extrasFor.p.name} for extra skills`}
          have={(extrasFor.p.extras ?? []).map((k) => k.skillId).filter((id) => id !== extrasFor.k?.skillId)}
          description="For this person alone, beyond what their roles ask: they are asked to rate these too, and they count in their numbers like a role’s skills. A skill they are already asked for gets the new level and reason."
          levelLabel="Level asked of them" levelInfo="The level this person should reach in these skills. You can change it per skill afterwards: press its chip on their card."
          note={extrasFor.k?.note ?? ""} preselect={extrasFor.k ? [extrasFor.k.skillId] : []}
          startTarget={extrasFor.k?.target} startMandatory={extrasFor.k?.mandatory}
          catalogue={catalogue} categories={categories} levels={levels} busy={busy} onClose={() => setExtrasFor(null)}
          onAsk={(q) => { setExtrasFor(null); setAsking(q); }}
          onAdd={(skills, note) => act({ op: "setExtras", employeeId: extrasFor.p.id, skills, note }, () => setExtrasFor(null))} />
      )}
      {asking != null && <AskDialog catalogue={ask} initial={{ kind: "skill", name: asking }} onClose={() => setAsking(null)} />}
      {removing && (
        <AlertDialog open onOpenChange={(o) => !o && setRemoving(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete the role “{removing.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                {(() => {
                  const only = removing.members.filter((m) => (rolesOf.get(m.id)?.length ?? 0) <= 1).length;
                  return `${removing.members.length} ${removing.members.length === 1 ? "person is" : "people are"} in it and it asks for ${removing.skills.length} ${removing.skills.length === 1 ? "skill" : "skills"}.${only ? ` ${only} of them ${only === 1 ? "is" : "are"} in no other role and ${only === 1 ? "goes" : "go"} back to “No role yet”.` : ""} Their ratings stay. It goes into your changes: nothing is deleted until you confirm.`;
                })()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction onClick={() => { const r = removing; setRemoving(null); act({ op: "removeRole", roleId: r.id }); }}>Delete the role</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function RoleDialog({ roles, role, copyOf, busy, onClose, onSave }: { roles: BoardRole[]; role?: BoardRole; copyOf?: BoardRole; busy: boolean; onClose: () => void; onSave: (name: string, description: string, color: string) => void }) {
  const [name, setName] = useState(role?.name ?? (copyOf ? `${copyOf.name} (copy)` : ""));
  const [description, setDescription] = useState(role?.description ?? copyOf?.description ?? "");
  // a new role starts with a colour this team does not use yet
  const [color, setColor] = useState<string>(role?.tint ?? nextTint(roles.map((r) => r.tint)));
  const taken = roles.find((r) => r.id !== role?.id && sameName(r.name, name));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{role ? `Role: ${role.name}` : copyOf ? `A copy of ${copyOf.name}` : "A new role in this team"}</DialogTitle>
          <DialogDescription>
            {copyOf ? "The copy starts with the same skills and nobody in it." : "A role is a group inside this team. It belongs to this team only: another team can have a role with the same name, and it is a different role."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2 && !taken) onSave(name, description, color); }}>
          <Field label="Name" htmlFor="role-name" info="What the team calls it: SRE, Service desk, Team lead. Unique within this team.">
            <Input id="role-name" value={name} autoFocus maxLength={80} autoComplete="off" onChange={(e) => setName(e.target.value)} placeholder="e.g. Service desk…" />
            {taken && <p className="text-xs text-destructive">This team already has a role called “{taken.name}”.</p>}
          </Field>
          <Field label="What it is for (optional)" htmlFor="role-desc" info="One line the people in the role and other managers see.">
            <Textarea id="role-desc" className="min-h-16" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Colour" info="A soft tint that shows wherever this role does: its section here, its name beside a person, the Roles page. It only helps to tell the roles apart; it says nothing about the role. Every colour offered is a tint, none is bright.">
            <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-1.5">
              {ROLE_TINTS.map((t) => {
                const on = color === t.key;
                const used = roles.find((r) => r.id !== role?.id && r.tint === t.key);
                return (
                  <button key={t.key} type="button" role="radio" aria-checked={on} onClick={() => setColor(t.key)} style={tintStyle(t.key)}
                    title={used ? `${t.name} (used by ${used.name})` : t.name}
                    className={cn("tint-chip inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-shadow focus-visible:outline-2 focus-visible:outline-ring", on && "font-medium ring-2 ring-foreground/60")}>
                    <span className="tint-dot size-2.5 rounded-full" aria-hidden />{t.name}{on && <Check className="size-3" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || name.trim().length < 2 || !!taken}>{busy && <Loader2 className="animate-spin" />}{role ? "Save" : "Add the role"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PeopleDialog({ role, people, rolesOf, busy, onClose, onAdd }: { role: BoardRole; people: BoardPerson[]; rolesOf: Map<string, BoardRole[]>; busy: boolean; onClose: () => void; onAdd: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const inRole = new Set(role.members.map((m) => m.id));
  const list = people.filter((p) => !inRole.has(p.id) && (!q.trim() || `${p.name} ${p.title}`.toLowerCase().includes(q.trim().toLowerCase())));
  const flip = (id: string) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add people to {role.name}</DialogTitle>
          <DialogDescription>The people who report to this manager. Someone already in another role stays in it and is in this one too.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person…" className="pl-8" aria-label="Find a person" />
        </div>
        <ul className="max-h-[min(22rem,50vh)] divide-y overflow-y-auto rounded-md border">
          {list.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50">
                <Checkbox checked={chosen.has(p.id)} onCheckedChange={() => flip(p.id)} />
                <PersonAvatar name={p.name} src={p.photo} size="sm" />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.title || "–"}{rolesOf.get(p.id)?.length ? ` · in ${rolesOf.get(p.id)!.map((r) => r.name).join(", ")}` : " · no role yet"}</span></span>
              </label>
            </li>
          ))}
          {!list.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{people.length === inRole.size ? "Everyone in the team is in this role already." : "Nobody matches."}</li>}
        </ul>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => setChosen(new Set(list.map((p) => p.id)))} disabled={!list.length}>Tick all {list.length}</Button>
          <Button disabled={busy || !chosen.size} onClick={() => onAdd([...chosen])}>{busy && <Loader2 className="animate-spin" />}Add {chosen.size || ""} to {role.name}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Choosing skills from the catalogue: for a role, or (with `note`) for one person. */
function SkillsDialog({ title, description, have: haveIds, levelLabel, levelInfo, note: startNote, preselect, startTarget, startMandatory, catalogue, categories, levels, busy, onClose, onAdd, onAsk }: {
  title: string; description: string; have: string[]; levelLabel: string; levelInfo: string;
  /** asking one person: a reason they will see (the dialog then shows a box for it) */
  note?: string;
  /** ticked from the start, with its level: one skill asked of them already, to change */
  preselect?: string[]; startTarget?: number; startMandatory?: boolean;
  catalogue: CatalogueSkill[]; categories: { id: string; name: string }[]; levels: Level[]; busy: boolean;
  onClose: () => void; onAdd: (skills: { skillId: string; target: number; mandatory: boolean }[], note?: string) => void; onAsk: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(preselect ?? []));
  const [target, setTarget] = useState(String(startTarget ?? 3));
  const [mandatory, setMandatory] = useState(startMandatory ?? true);
  const [why, setWhy] = useState(startNote ?? "");
  const forPerson = startNote != null;
  const have = new Set(haveIds);
  const results = useMemo(() => {
    const pool = catalogue.filter((c) => !have.has(c.id) && (!cat || c.categoryId === cat));
    if (!q.trim()) return pool;
    return pool.map((c) => ({ c, score: Math.max(matchScore(q, c.name, c.aliases ?? []), matchScore(q, `${c.name} ${c.category}`) - 0.01) }))
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name)).map((x) => x.c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogue, q, cat, haveIds]);
  const flip = (id: string) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exists = catalogue.some((c) => sameName(c.name, q) || sameName(c.name.split(" › ").pop() ?? "", q));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a skill: Kubernetes, incident, leadership…" className="pl-8" aria-label="Find a skill" autoFocus />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
            <Chip on={!cat} onClick={() => setCat("")}>All categories</Chip>
            {categories.map((c) => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(cat === c.id ? "" : c.id)}>{c.name}</Chip>)}
          </div>
          <ul className="max-h-[min(20rem,40vh)] divide-y overflow-y-auto rounded-md border">
            {results.slice(0, 200).map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-accent/50">
                  <Checkbox className="mt-0.5" checked={chosen.has(c.id)} onCheckedChange={() => flip(c.id)} />
                  <span className="min-w-0"><span className="block leading-snug break-words">{c.name}</span><span className="block text-xs text-muted-foreground">{c.category}</span></span>
                </label>
              </li>
            ))}
            {(!results.length || (q.trim().length >= 2 && !exists)) && (
              <li className="grid gap-2 px-3 py-3 text-sm">
                <span className="text-muted-foreground">{results.length ? "Not one of these?" : "Nothing in the catalogue matches."} A skill that is missing is asked for: a coordinator approves it, then every team can use it.</span>
                <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => onAsk(q.trim())}><Send />Ask for {q.trim().length >= 2 ? `“${q.trim()}”` : "a new skill"}</Button>
              </li>
            )}
          </ul>
          {results.length > 200 && <p className="text-xs text-muted-foreground">The first 200 of {results.length}. Type to narrow it down.</p>}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Field label={levelLabel} info={levelInfo} className="w-56">
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{levels.filter((l) => l.level > 0).map((l) => <SelectItem key={l.level} value={String(l.level)}>{l.level} {l.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <ToggleField label="Must-have" info="On: the role needs it, and being below the level counts as a gap. Off: a nice-to-have. A must-have can be removed like any other skill.">
              <Switch checked={mandatory} onCheckedChange={setMandatory} />
            </ToggleField>
          </div>
          {forPerson && (
            <Field label="Why (optional)" info="A line on why you ask it of them: they see it next to the skill in My skills.">
              <Input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} placeholder="e.g. You join the on-call rota in March…" />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !chosen.size} onClick={() => onAdd([...chosen].map((skillId) => ({ skillId, target: Number(target), mandatory })), forPerson ? why : undefined)}>
            {busy && <Loader2 className="animate-spin" />}
            {/* not "Ask for …": the list above has "Ask for “x”", which asks for a new skill in the catalogue */}
            {forPerson ? (chosen.size > 1 ? `Ask these ${chosen.size} of them` : "Ask it of them") : `Add ${chosen.size || ""} ${chosen.size === 1 ? "skill" : "skills"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
