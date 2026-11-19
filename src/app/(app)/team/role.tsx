"use client";
// The team's role, under the team's name: the manager chooses a role, their people follow
// it. A manager with managers below is asked whether it reaches everyone below; a manager
// lower down can choose another for their own team, and a person's own role always wins.
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Info } from "@/components/info";
import { NameSearch, type NameItem } from "@/components/name-search";
import { createRole, setTeamRole } from "@/app/actions/roles";

export interface TeamRoleState {
  managerId: string;
  managerName: string;
  /** the viewer is this manager */
  mine: boolean;
  /** the role this manager chose for the team */
  current: { id: string; name: string; cascade: boolean } | null;
  /** with no choice of their own: the role the team follows from above */
  inherited: { id: string; name: string; from: string } | null;
  hasManagersBelow: boolean;
  /** how many people the role would reach, and how many of them have a role of their own */
  direct: { follow: number; own: number };
  everyone: { follow: number; own: number };
  /** the manager has a role of their own that the team role would not change */
  managerOwnRole: string | null;
}

export function TeamRole({ state, roles, canEdit }: { state: TeamRoleState; roles: NameItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(state.current);
  const [cascade, setCascade] = useState(state.current?.cascade ?? false);
  const [replaceOwn, setReplaceOwn] = useState(false);
  const [busy, start] = useTransition();
  const whose = state.mine ? "you" : state.managerName;
  const reach = cascade && state.hasManagersBelow ? state.everyone : state.direct;
  const own = reach.own + (state.managerOwnRole ? 1 : 0);

  const show = () => { setPicked(state.current); setCascade(state.current?.cascade ?? false); setReplaceOwn(false); setQ(""); setOpen(true); };
  const save = (roleId: string | null) => start(async () => {
    const r = await setTeamRole({ managerId: state.managerId, roleId, cascade: cascade && state.hasManagersBelow, replaceOwn });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Saved.");
    setOpen(false);
    router.refresh();
  });
  const addRole = (name: string) => start(async () => {
    const r = await createRole({ name });
    if (!r.ok || !r.id) { toast.error(r.ok ? "Not added." : r.error); return; }
    setPicked({ id: r.id, name });
    setQ("");
    toast.success(`Role “${name}” added. Say which skills it needs on Roles.`);
  });

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <BriefcaseBusiness className="size-3.5" />
      {state.current ? (
        <span>Role <Link href={`/roles/${state.current.id}`} className="font-medium text-foreground hover:underline">{state.current.name}</Link>{state.hasManagersBelow ? (state.current.cascade ? " · everyone below" : " · direct reports") : ""}</span>
      ) : state.inherited ? (
        <span>Role <Link href={`/roles/${state.inherited.id}`} className="font-medium text-foreground hover:underline">{state.inherited.name}</Link> · follows {state.inherited.from}</span>
      ) : <span>No team role yet</span>}
      {canEdit && <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={show}>{state.current ? "Change" : "Choose a role"}</Button>}
      <Info label="About the team's role">The role a manager chooses for their team. The people reporting to them follow it, and so do they, unless they have a role of their own; the role decides which skills they are asked to rate (Roles). A manager further down can choose another role for their own team.</Info>

      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>The role of {state.mine ? "your team" : `${state.managerName}'s team`}</DialogTitle>
              <DialogDescription>
                The people in the team follow this role, and so {state.mine ? "do you" : `does ${state.managerName}`}. Nobody is forced: a person with a role of their own keeps it.
                {state.inherited && !state.current ? ` For now the team follows ${state.inherited.name}, from ${state.inherited.from}.` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <Field label="Role" info="Type any part of a role's name: the roles that exist are listed as you type. Press Choose next to one, or add the name as a new role if it is not there. Role names are unique.">
                {picked ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2">
                    <span className="min-w-0 truncate font-medium">{picked.name}</span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(null)}>Another role</Button>
                  </div>
                ) : (
                  <NameSearch value={q} onValueChange={setQ} items={roles} noun="role" autoFocus busy={busy}
                    onPick={(r) => { setPicked({ id: r.id, name: r.name }); setQ(""); }} pickLabel="Choose" onAdd={addRole}
                    placeholder="Type a role, e.g. SRE or IT Operations…" />
                )}
                {!picked && !q.trim() && roles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {roles.slice(0, 12).map((r) => <Button key={r.id} type="button" size="sm" variant="outline" className="h-7" onClick={() => setPicked({ id: r.id, name: r.name })}>{r.name}</Button>)}
                  </div>
                )}
              </Field>

              {state.hasManagersBelow && (
                <Field label="Who gets it" info="Managers report to this manager too. Choose whether the role is only for the people reporting directly, or for everyone below. Either way, a manager below can choose another role for their own team, and their choice wins there.">
                  <RadioGroup value={cascade ? "all" : "direct"} onValueChange={(x) => setCascade(x === "all")} className="grid gap-2">
                    <Label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal has-[:checked]:border-primary">
                      <RadioGroupItem value="direct" className="mt-0.5" />
                      <span><span className="font-medium">Only the people reporting to {whose}</span>
                        <span className="block text-xs text-muted-foreground">{state.direct.follow + state.direct.own} people. The teams below choose their own.</span></span>
                    </Label>
                    <Label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal has-[:checked]:border-primary">
                      <RadioGroupItem value="all" className="mt-0.5" />
                      <span><span className="font-medium">Everyone below {whose}</span>
                        <span className="block text-xs text-muted-foreground">{state.everyone.follow + state.everyone.own} people. A manager below can still choose another role for their team.</span></span>
                    </Label>
                  </RadioGroup>
                </Field>
              )}

              {own > 0 && (
                <Label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal">
                  <Checkbox checked={replaceOwn} onCheckedChange={(c) => setReplaceOwn(c === true)} className="mt-0.5" />
                  <span><span className="font-medium">Also the {own} {own === 1 ? "person who has" : "people who have"} a role of their own</span>
                    <span className="block text-xs text-muted-foreground">Off: they keep their own role{state.managerOwnRole ? ` (${state.mine ? "you are" : `${state.managerName} is`} ${state.managerOwnRole})` : ""}. On: they follow the team&apos;s role from now on.</span></span>
                </Label>
              )}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              {state.current ? <Button type="button" variant="ghost" disabled={busy} onClick={() => save(null)}>Remove the team&apos;s role</Button> : <span />}
              <Button type="button" disabled={busy || !picked} onClick={() => picked && save(picked.id)}>{busy && <Loader2 className="animate-spin" />}Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </span>
  );
}
