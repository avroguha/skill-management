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

export function UsersAdmin({ rows, roles, employees, readOnly }: {
  rows: Row[]; roles: Opt[]; employees: (Opt & { taken: boolean })[]; readOnly?: boolean;
}) {
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
        toolbar={readOnly ? undefined : <Button size="sm" className="h-8" onClick={() => setAdding(true)}><Plus />Add local account</Button>}
        columns={[
          { key: "name", header: "Name" },
          { key: "username", header: "Username", kind: "muted" },
          { key: "email", header: "E-mail", kind: "muted" },
          { key: "access", header: "Access", facet: true, info: "What the account may see and do. Manager comes by itself from having people reporting to you; Administrator and Leader are given here." },
          { key: "person", header: "Is", kind: "muted", info: "The person this account belongs to: whose skills and team it sees. Single sign-on links it by itself." },
          { key: "method", header: "Signs in with", kind: "muted", facet: true, info: "Local: a user name and password kept here. SSO: the company sign-in." },
          { key: "status", header: "Status", kind: "badge", facet: true },
          { key: "lastSeen", header: "Last seen", kind: "date" },
        ]}
        actions={readOnly ? undefined : (row) => (
          <>
            {/* the local admin keeps its role and is never disabled (src/lib/local-admin.ts) */}
            {!row.localAdmin && icon("Change access", () => setAccess(row), ShieldCheck)}
            {row.employeeId !== "none" && row.role !== "admin" && !row.banned
              && <ViewAsButton employeeId={String(row.employeeId)} name={String(row.person || row.name)} variant="ghost" size="icon" iconOnly />}
            {icon("Reset password", () => setReset(row), KeyRound, !row.local)}
            {row.localAdmin && !row.banned ? null : row.banned
              ? icon("Enable", () => start(async () => { const r = await setBanned(String(row.id), false); if (r.ok) toast.success(r.message ?? "Enabled"); else toast.error(r.error); }), CircleCheck)
              : icon("Disable", () => start(async () => { const r = await setBanned(String(row.id), true); if (r.ok) toast.success(r.message ?? "Disabled"); else toast.error(r.error); }), Ban)}
          </>
        )} />
      {access && (
        <RecordDialog title={`Access for ${String(access.name)}`}
          description="Managers need no role: having people reporting to them is enough. The person link decides whose skills and team the account sees."
          initial={{ id: access.id, role: access.role, employeeId: access.employeeId }}
          fields={[
            { name: "role", label: "Access", type: "select", options: roles, info: "Administrator: everything, including Settings. Leader: reads the whole organisation. Manager and Employee follow from the reporting lines by themselves." },
            { name: "employeeId", label: "This account is", type: "select", optional: true, info: "The person the account belongs to. Their own skills and their team come from this link.",
              options: employees.filter((e) => !e.taken || e.value === access.employeeId).map((e) => ({ value: e.value, label: e.label })) },
          ]}
          save={(d) => setUserAccess({ userId: String(access.id), role: String(d.role), employeeId: d.employeeId ? String(d.employeeId) : null })}
          onClose={() => setAccess(null)} />
      )}
      {reset && (
        <RecordDialog title={`New password for ${String(reset.name)}`}
          description="A temporary password. They must change it at their next sign-in, and their open sessions end now."
          initial={{ id: reset.id, password: "" }}
          fields={[{ name: "password", label: "Temporary password (10+ characters)", type: "password", info: "They must change it at their next sign-in. Give it to them in person or by phone, never by e-mail." }]}
          save={(d) => resetPassword(String(reset.id), String(d.password ?? ""))}
          onClose={() => setReset(null)} />
      )}
      {adding && (
        <RecordDialog title="Add a local account"
          description="For people who cannot use single sign-on. They choose their own password at first sign-in."
          initial={{ role: "employee", employeeId: "none" }}
          fields={[
            { name: "username", label: "Username", half: true, info: "What they type to sign in: 3-40 letters, digits, dots, dashes or underscores." },
            { name: "name", label: "Name", half: true, info: "Shown at the top of the menu and in the audit log." },
            { name: "email", label: "E-mail", type: "email", info: "Their e-mail address. It must not be the address of a person who signs in with single sign-on." },
            { name: "password", label: "First password (10+ characters)", type: "password", info: "They choose their own password at their first sign-in." },
            { name: "role", label: "Access", type: "select", options: roles, info: "Administrator: everything. Leader: reads the whole organisation. Manager and Employee follow from the reporting lines." },
            { name: "employeeId", label: "This account is", type: "select", optional: true, info: "The person the account belongs to, if any.",
              options: employees.filter((e) => !e.taken).map((e) => ({ value: e.value, label: e.label })) },
          ]}
          save={createLocalUser}
          onClose={() => setAdding(false)} />
      )}
    </>
  );
}
