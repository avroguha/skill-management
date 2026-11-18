"use client";
import { AdminCrud } from "@/components/admin-crud";
import { saveEmployee } from "@/app/actions/admin";

type Opt = { value: string; label: string };

/** Everyone in the app: role, grade, manager and team name, editable one by one. */
export function PeopleAdmin({ rows, roles, grades, managers, readOnly }: { rows: Record<string, unknown>[]; roles: Opt[]; grades: Opt[]; managers: Opt[]; readOnly?: boolean }) {
  return (
    <AdminCrud rows={rows} noun="person" csvName="people" pageSize={25} canAdd={!readOnly}
      searchKeys={["name", "email", "title", "manager", "role"]}
      defaults={{ active: true }}
      columns={[
        { key: "name", header: "Name" },
        { key: "title", header: "Designation", kind: "muted" },
        { key: "role", header: "Role", facet: true, info: "Decides which skills the person is expected to have, and at what level. Empty: no targets, so no gaps are shown for them." },
        { key: "grade", header: "Grade", kind: "muted", facet: true, info: "Within a role, a grade can expect higher levels (Roles & targets)." },
        { key: "manager", header: "Manager", kind: "muted", facet: true },
        { key: "teamName", header: "Team name", kind: "muted", info: "For a manager: what their team is called. Empty: called after them." },
        { key: "source", header: "From", kind: "muted", facet: true, info: "ServiceNow: kept up to date by the sync (name, e-mail, designation, manager). Manual: added here or by CSV." },
        { key: "status", header: "Status", kind: "badge", facet: true },
      ]}
      fields={[
        { name: "name", label: "Name", half: true, info: "From ServiceNow for synced people: a change here is overwritten at the next sync." },
        { name: "email", label: "E-mail", type: "email", half: true, info: "How single sign-on and CSV files find the person. Must be unique." },
        { name: "title", label: "Designation", half: true, info: "The job title. Rules in Settings › ServiceNow can give a role from it." },
        { name: "location", label: "Location", half: true, info: "Where they work, shown on their page and in lists." },
        { name: "roleId", label: "Role", type: "select", optional: true, options: roles, half: true, info: "Which skills they are expected to have, at what level (Settings › Roles & targets)." },
        { name: "gradeId", label: "Grade", type: "select", optional: true, options: grades, half: true, info: "Their grade within the role; a grade can expect higher levels." },
        { name: "managerId", label: "Manager", type: "select", optional: true, options: managers, info: "Who they report to: that person's team includes them, and that person confirms their ratings. Synced people get it from ServiceNow." },
        { name: "teamName", label: "Team name (if they manage people)", info: "What their team is called everywhere. Leave empty to call it after them." },
        { name: "active", label: "Active", type: "switch", info: "Off: they have left. They cannot sign in, and count nowhere; their history stays." },
      ]}
      save={saveEmployee} />
  );
}
