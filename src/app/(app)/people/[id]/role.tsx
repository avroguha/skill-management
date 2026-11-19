"use client";
// One person's role, for their manager: follow the team's role, or a role of their own.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "@/components/info";
import { setPersonRole } from "@/app/actions/roles";

export function PersonRole({ employeeId, name, ownRoleId, teamRole, roles }: {
  employeeId: string; name: string; ownRoleId: string | null; teamRole: string | null; roles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <BriefcaseBusiness className="size-3.5" />
      <span>{name}&apos;s role</span>
      <Select value={ownRoleId ?? "team"} disabled={busy} onValueChange={(x) => start(async () => {
        const r = await setPersonRole({ employeeId, roleId: x === "team" ? null : x });
        if (!r.ok) { toast.error(r.error); return; }
        toast.success(r.message ?? "Saved.");
        router.refresh();
      })}>
        <SelectTrigger size="sm" className="h-8 w-72 max-w-full text-foreground" aria-label={`${name}'s role`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="team">{teamRole ? `Follows the team: ${teamRole}` : "Follows the team (no team role yet)"}</SelectItem>
          {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} (their own)</SelectItem>)}
        </SelectContent>
      </Select>
      {busy && <Loader2 className="size-4 animate-spin" />}
      <Info label="About a person's role">By default a person follows the role their manager chose for the team. Give them a role of their own when they do something else: it wins over the team&apos;s, and decides which skills they are asked to rate. New roles are added on Roles.</Info>
    </div>
  );
}
