import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { AdminCrud } from "@/components/admin-crud";
import { saveUnit, deleteUnit, saveEmployee } from "@/app/actions/admin";
import { getEngine } from "@/lib/server";

export const metadata = { title: "Organisation · Admin" };

export default async function OrgAdmin() {
  const db = await getDb();
  const engine = await getEngine();
  const [units, people, roles, grades] = await Promise.all([
    db.select().from(schema.orgUnit),
    db.select().from(schema.employee).orderBy(asc(schema.employee.name)),
    db.select().from(schema.jobRole).orderBy(asc(schema.jobRole.name)),
    db.select().from(schema.grade).orderBy(asc(schema.grade.rank)),
  ]);
  const path = (id: string | null) => {
    if (!id || !engine.unitById.has(id)) return "";
    return [...engine.ancestors(id), engine.unitById.get(id)!].map((u) => u.name).join(" › ");
  };
  const unitOpts = units.map((u) => ({ value: u.id, label: path(u.id) })).sort((a, b) => a.label.localeCompare(b.label));
  const personOpts = people.filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.name} (${p.email})` }));
  const name = new Map(people.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader title="Organisation" description="Units form a tree. A unit's manager sees and validates everyone in it, and sets what it needs." />
      <div className="grid gap-5">
        <Section title="Units">
          <AdminCrud noun="unit" csvName="units"
            rows={units.map((u) => ({
              id: u.id, name: u.name, kind: u.kind, parentId: u.parentId ?? "none", managerId: u.managerId ?? "none", sort: u.sort,
              path: path(u.id), manager: u.managerId ? name.get(u.managerId) ?? "" : "", people: engine.directMembers(u.id).length,
              needsHref: `/team?unit=${u.id}`,
            })).sort((a, b) => a.path.localeCompare(b.path))}
            columns={[
              { key: "path", header: "Unit", kind: "link", hrefKey: "needsHref" },
              { key: "kind", header: "Kind", kind: "muted", facet: true },
              { key: "manager", header: "Manager" },
              { key: "people", header: "People", kind: "number", align: "right" },
            ]}
            searchKeys={["path", "manager"]}
            defaults={{ kind: "team", parentId: units[0]?.id ?? "none", sort: 0 }}
            fields={[
              { name: "name", label: "Name" },
              { name: "kind", label: "Kind", type: "select", half: true, options: ["company", "division", "department", "team"].map((k) => ({ value: k, label: k })) },
              { name: "sort", label: "Order among siblings", type: "number", half: true },
              { name: "parentId", label: "Part of", type: "select", optional: true, options: unitOpts },
              { name: "managerId", label: "Manager", type: "select", optional: true, options: personOpts, help: "Sees and validates everyone in this unit and below, and sets its team needs." },
            ]}
            save={saveUnit} remove={deleteUnit} />
          <p className="mt-2 text-xs text-muted-foreground">Click a unit to set what that team needs.</p>
        </Section>
        <Section title="People" description="Matched to a sign-in by e-mail address. Deactivate leavers rather than deleting them: their history stays.">
          <AdminCrud noun="person" csvName="people"
            rows={people.map((p) => ({
              id: p.id, name: p.name, email: p.email, title: p.title, unitId: p.unitId ?? "none", roleId: p.roleId ?? "none",
              gradeId: p.gradeId ?? "none", managerId: p.managerId ?? "none", location: p.location, active: p.active,
              unit: path(p.unitId), role: roles.find((r) => r.id === p.roleId)?.name ?? "", grade: grades.find((g) => g.id === p.gradeId)?.name ?? "",
              manager: p.managerId ? name.get(p.managerId) ?? "" : "", status: p.active ? "Active" : "Inactive", linked: p.userId ? "Yes" : "",
              href: `/people/${p.id}`,
            }))}
            columns={[
              { key: "name", header: "Name", kind: "link", hrefKey: "href" },
              { key: "email", header: "E-mail", kind: "muted" },
              { key: "unit", header: "Unit", kind: "muted" },
              { key: "role", header: "Role", facet: true },
              { key: "grade", header: "Grade", kind: "muted", facet: true },
              { key: "manager", header: "Manager", kind: "muted" },
              { key: "linked", header: "Signs in", kind: "muted", facet: true },
              { key: "status", header: "Status", kind: "badge", facet: true },
            ]}
            searchKeys={["name", "email", "unit", "manager"]}
            defaults={{ active: true, unitId: "none", roleId: "none", gradeId: "none", managerId: "none" }}
            fields={[
              { name: "name", label: "Name", half: true },
              { name: "email", label: "E-mail", type: "email", half: true },
              { name: "title", label: "Job title", half: true },
              { name: "location", label: "Location", half: true },
              { name: "unitId", label: "Unit", type: "select", optional: true, options: unitOpts },
              { name: "roleId", label: "Role", type: "select", optional: true, half: true, options: roles.map((r) => ({ value: r.id, label: r.name })) },
              { name: "gradeId", label: "Grade", type: "select", optional: true, half: true, options: grades.map((g) => ({ value: g.id, label: g.name })) },
              { name: "managerId", label: "Manager", type: "select", optional: true, options: personOpts },
              { name: "active", label: "Active", type: "switch" },
            ]}
            save={saveEmployee} />
        </Section>
      </div>
    </>
  );
}
