"use client";
import { AdminCrud } from "@/components/admin-crud";
import { saveEmployee } from "@/app/actions/admin";

type Opt = { value: string; label: string };

/** Everyone in the app: grade, manager and team name, editable one by one. */
export function PeopleAdmin({ rows, grades, managers, readOnly }: { rows: Record<string, unknown>[]; grades: Opt[]; managers: Opt[]; readOnly?: boolean }) {
  return (
    <AdminCrud rows={rows} noun="person" csvName="people" pageSize={25} canAdd={!readOnly}
      searchKeys={["name", "email", "title", "manager", "role"]}
      defaults={{ active: true }}
      columns={[
        { key: "name", header: "Name", kind: "person" },
        { key: "title", header: "Designation", kind: "muted" },
        { key: "role", header: "Roles", facet: true, info: "The roles of their manager’s team they are in: what those roles ask for is what they are asked to rate. Their manager gives them (My team › People and roles). Empty: in no role yet, so nothing is asked of them." },
        { key: "grade", header: "Grade", kind: "muted", facet: true, info: "A label on the person, such as Associate or Senior. It changes no target." },
        { key: "manager", header: "Manager", kind: "person", facet: true },
        { key: "teamName", header: "Team name", kind: "muted", info: "For a manager: what their team is called. Empty: called after them." },
        { key: "source", header: "From", kind: "muted", facet: true, info: "ServiceNow: kept up to date by the sync (name, e-mail, designation, manager). Manual: added here or by CSV." },
        { key: "status", header: "Status", kind: "badge", facet: true },
      ]}
      fields={[
        { name: "name", label: "Name", half: true, info: "From ServiceNow for synced people: a change here is overwritten at the next sync." },
        { name: "email", label: "E-mail", type: "email", half: true, info: "How single sign-on and CSV files find the person. Must be unique." },
        { name: "title", label: "Designation", half: true, info: "The job title, as ServiceNow has it." },
        { name: "location", label: "Location", half: true, info: "Where they work, shown on their page and in lists." },
        { name: "gradeId", label: "Grade", type: "select", optional: true, options: grades, info: "A label on the person, such as Associate or Senior (the list comes from a grades CSV in Data & backups). It changes no target." },
        { name: "managerId", label: "Manager", type: "select", optional: true, options: managers, info: "Who they report to: that person’s team includes them, and that person confirms their ratings. Synced people get it from ServiceNow." },
        { name: "teamName", label: "Team name (if they manage people)", info: "What their team is called everywhere. Leave empty to call it after them." },
        { name: "active", label: "Active", type: "switch", info: "Off: they have left. They cannot sign in, and count nowhere; their history stays." },
      ]}
      save={saveEmployee} />
  );
}
