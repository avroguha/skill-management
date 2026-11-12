"use client";
import { useState, useTransition } from "react";
import { KeyRound, ShieldCheck, Ban, CircleCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable } from "@/components/data-table";
import { RecordDialog } from "@/components/admin-crud";
import { ViewAsButton } from "@/components/view-as";
import { setUserAccess, resetPassword, setBanned, createLocalUser } from "@/app/actions/admin";

type Row = Record<string, unknown>;
type Opt = { value: string; label: string };

export function UsersAdmin({ rows, roles, employees }: { rows: Row[]; roles: Opt[]; employees: (Opt & { taken: boolean })[] }) {
  const [access, setAccess] = useState<Row | null>(null);
  const [reset, setReset] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const icon = (label: string, onClick: () => void, Icon: typeof KeyRound, disabled = false) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} disabled={disabled || pending} onClick={onClick}><Icon className="size-3.5" /></Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
  return (
    <>
      <DataTable rows={rows} csvName="users" searchKeys={["name", "username", "email", "person"]}
        toolbar={<Button size="sm" className="h-8" onClick={() => setAdding(true)}><Plus />Add local account</Button>}
        columns={[
          { key: "name", header: "Name" },
          { key: "username", header: "Username", kind: "muted" },
          { key: "email", header: "E-mail", kind: "muted" },
          { key: "access", header: "Access", facet: true },
          { key: "person", header: "Is", kind: "muted" },
          { key: "method", header: "Signs in with", kind: "muted", facet: true },
          { key: "status", header: "Status", kind: "badge", facet: true },
          { key: "lastSeen", header: "Last seen", kind: "date" },
        ]}
        actions={(row) => (
          <>
            {icon("Change access", () => setAccess(row), ShieldCheck)}
            {row.employeeId !== "none" && row.role !== "admin" && !row.banned
              && <ViewAsButton employeeId={String(row.employeeId)} name={String(row.person || row.name)} variant="ghost" size="icon" iconOnly />}
            {icon("Reset password", () => setReset(row), KeyRound, !row.local)}
            {row.banned
              ? icon("Enable", () => start(async () => { const r = await setBanned(String(row.id), false); if (r.ok) toast.success(r.message ?? "Enabled"); else toast.error(r.error); }), CircleCheck)
              : icon("Disable", () => start(async () => { const r = await setBanned(String(row.id), true); if (r.ok) toast.success(r.message ?? "Disabled"); else toast.error(r.error); }), Ban)}
          </>
        )} />
      {access && (
        <RecordDialog title={`Access for ${String(access.name)}`}
          description="Managers do not need the Manager role: managing a unit or having reports is enough. The person link decides whose profile and team they see."
          initial={{ id: access.id, role: access.role, employeeId: access.employeeId }}
          fields={[
            { name: "role", label: "Access", type: "select", options: roles },
            { name: "employeeId", label: "This account is", type: "select", optional: true,
              options: employees.filter((e) => !e.taken || e.value === access.employeeId).map((e) => ({ value: e.value, label: e.label })) },
          ]}
          save={(d) => setUserAccess({ userId: String(access.id), role: String(d.role), employeeId: d.employeeId ? String(d.employeeId) : null })}
          onClose={() => setAccess(null)} />
      )}
      {reset && (
        <RecordDialog title={`New password for ${String(reset.name)}`}
          description="A temporary password. They must change it at their next sign-in, and their open sessions end now."
          initial={{ id: reset.id, password: "" }}
          fields={[{ name: "password", label: "Temporary password (10+ characters)", type: "password" }]}
          save={(d) => resetPassword(String(reset.id), String(d.password ?? ""))}
          onClose={() => setReset(null)} />
      )}
      {adding && (
        <RecordDialog title="Add a local account"
          description="For people who cannot use single sign-on. They choose their own password at first sign-in."
          initial={{ role: "employee", employeeId: "none" }}
          fields={[
            { name: "username", label: "Username", half: true },
            { name: "name", label: "Name", half: true },
            { name: "email", label: "E-mail", type: "email" },
            { name: "password", label: "First password (10+ characters)", type: "password" },
            { name: "role", label: "Access", type: "select", options: roles },
            { name: "employeeId", label: "This account is", type: "select", optional: true,
              options: employees.filter((e) => !e.taken).map((e) => ({ value: e.value, label: e.label })) },
          ]}
          save={createLocalUser}
          onClose={() => setAdding(false)} />
      )}
    </>
  );
}
