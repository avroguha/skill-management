"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Info } from "@/components/info";
import { setTeamName } from "@/app/actions/team";

/** The team's name, with a pencil to change it (the manager, a manager above, an administrator). */
export function TeamTitle({ managerId, name, custom, canEdit }: { managerId: string; name: string; custom: string; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(custom);
  const [busy, start] = useTransition();
  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {name}
        {canEdit && <Button size="icon" variant="ghost" className="size-7" aria-label="Rename the team" onClick={() => setEditing(true)}><Pencil className="size-3.5" /></Button>}
      </span>
    );
  }
  return (
    <form className="inline-flex flex-wrap items-center gap-1.5" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await setTeamName(managerId, value);
        if (!r.ok) { toast.error(r.error); return; }
        toast.success(r.message ?? "Saved.");
        setEditing(false);
        router.refresh();
      });
    }}>
      <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Cloud Platform…" className="h-8 w-56 text-base font-normal" aria-label="Team name" maxLength={80} />
      <Button size="icon" className="size-8" type="submit" disabled={busy} aria-label="Save the name"><Check className="size-4" /></Button>
      <Button size="icon" variant="ghost" className="size-8" type="button" onClick={() => setEditing(false)} aria-label="Cancel"><X className="size-4" /></Button>
      <Info label="About the team name">What everyone sees for this team: in pickers, insights and e-mails. Leave it empty to call it after its manager.</Info>
    </form>
  );
}
