"use client";
import { useState, useTransition } from "react";
import { KeyRound, ShieldCheck, Ban, CircleCheck, Plus, Network, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { substringFilter } from "@/lib/search";
import { setOperatorScopes } from "@/app/actions/admin";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable } from "@/components/data-table";
import { RecordDialog } from "@/components/admin-crud";
import { ViewAsButton } from "@/components/view-as";
import { setUserAccess, resetPassword, setBanned, createLocalUser } from "@/app/actions/admin";

type Row = Record<string, unknown>;
type Opt = { value: string; label: string };

export interface ScopeOpt { kind: "leader" | "unit"; id: string; label: string; detail: string }

export function UsersAdmin({ rows, roles, employees, scopeOptions, scopes }: {
  rows: Row[]; roles: Opt[]; employees: (Opt & { taken: boolean })[];
  /** leaders (people with someone below them) and units an operator can be given */
  scopeOptions: ScopeOpt[];
  /** each operator account's hierarchies */
  scopes: Record<string, { kind: "leader" | "unit"; id: string }[]>;
}) {
  const [hier, setHier] = useState<Row | null>(null);
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
            {/* the local admin keeps its role and is never disabled (src/lib/local-admin.ts) */}
            {!row.localAdmin && icon("Change access", () => setAccess(row), ShieldCheck)}
            {row.role === "operator" && icon("Hierarchies this operator works on", () => setHier(row), Network)}
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
      {hier && (
        <ScopeDialog userId={String(hier.id)} name={String(hier.name)} options={scopeOptions}
          initial={scopes[String(hier.id)] ?? []} onClose={() => setHier(null)} />
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

/** The leaders and units an operator works on, besides their own reports. Read-only for them. */
function ScopeDialog({ userId, name, options, initial, onClose }: {
  userId: string; name: string; options: ScopeOpt[]; initial: { kind: "leader" | "unit"; id: string }[]; onClose: () => void;
}) {
  const key = (s: { kind: string; id: string }) => `${s.kind}:${s.id}`;
  const [chosen, setChosen] = useState(initial.map(key));
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const byKey = new Map(options.map((o) => [key(o), o]));
  const save = () => start(async () => {
    const r = await setOperatorScopes(userId, chosen.map((k) => { const [kind, ...rest] = k.split(":"); return { kind: kind as "leader" | "unit", id: rest.join(":") }; }));
    if (r.ok) { toast.success(r.message ?? "Saved"); onClose(); } else toast.error(r.error);
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Hierarchies for {name}</DialogTitle>
          <DialogDescription>
            Besides their own reports, the operator reads these and builds charts over them: a leader brings that person and everyone below them; a unit brings it and the units under it. They cannot validate, set targets or edit team needs there.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {chosen.length ? (
            <ul className="grid gap-1.5">
              {chosen.map((k) => {
                const o = byKey.get(k);
                return (
                  <li key={k} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate">{o ? o.label : "(no longer exists)"}<span className="text-muted-foreground"> · {o?.detail ?? k.split(":")[0]}</span></span>
                    <Button size="icon" variant="ghost" aria-label={`Remove ${o?.label ?? k}`} onClick={() => setChosen(chosen.filter((x) => x !== k))}><X /></Button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted-foreground">None yet: only their own reports, if they have any.</p>}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild><Button variant="outline" size="sm" className="justify-self-start"><Plus />Add a leader or unit</Button></PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="start">
              <Command filter={substringFilter}>
                <CommandInput placeholder="Find a leader or unit…" />
                <CommandList>
                  <CommandEmpty>Nothing matches.</CommandEmpty>
                  {(["leader", "unit"] as const).map((kind) => (
                    <CommandGroup key={kind} heading={kind === "leader" ? "Leaders (and everyone below them)" : "Units (and the units under them)"}>
                      {options.filter((o) => o.kind === kind && !chosen.includes(key(o))).map((o) => (
                        <CommandItem key={key(o)} value={`${o.label} ${o.detail} ${kind}`} onSelect={() => { setChosen([...chosen, key(o)]); setOpen(false); }}>
                          <span className="flex-1 truncate">{o.label}</span><span className="text-xs text-muted-foreground">{o.detail}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
