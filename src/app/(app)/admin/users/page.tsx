import { asc, max } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { ACCESS_ROLES, getEngine } from "@/lib/server";
import { UsersAdmin } from "./client";

export const metadata = { title: "Users & access · Admin" };

export default async function UsersPage() {
  const db = await getDb();
  const engine = await getEngine();
  const [users, accounts, employees, sessions] = await Promise.all([
    db.select().from(schema.user).orderBy(asc(schema.user.name)),
    db.select({ userId: schema.account.userId, providerId: schema.account.providerId }).from(schema.account),
    db.select({ id: schema.employee.id, name: schema.employee.name, email: schema.employee.email, userId: schema.employee.userId, active: schema.employee.active }).from(schema.employee).orderBy(asc(schema.employee.name)),
    db.select({ userId: schema.session.userId, last: max(schema.session.updatedAt) }).from(schema.session).groupBy(schema.session.userId),
  ]);
  const rows = users.map((u) => {
    const emp = employees.find((e) => e.userId === u.id);
    const methods = accounts.filter((a) => a.userId === u.id).map((a) => (a.providerId === "credential" ? "Local" : "SSO"));
    const derivedManager = emp && (engine.managedUnitIds(emp.id).length > 0 || engine.reportsOf(emp.id).length > 0);
    const role = (u.role ?? "employee") as string;
    const effective = role === "employee" && derivedManager ? "Manager (manages people)" : ACCESS_ROLES.find((r) => r.value === role)?.label ?? role;
    return {
      id: u.id, name: u.name, username: u.username ?? "", email: u.email, role, access: effective,
      employeeId: emp?.id ?? "none", person: emp?.name ?? "", method: [...new Set(methods)].join(", ") || "–",
      status: u.banned ? "Disabled" : u.mustChangePassword ? "Must change password" : "Active", banned: !!u.banned,
      lastSeen: sessions.find((s) => s.userId === u.id)?.last?.toISOString() ?? null,
      local: methods.includes("Local"),
    };
  });
  return (
    <>
      <PageHeader title="Users & access"
        description="Access follows who people are. Anyone who manages a unit or has reports is a manager automatically; everyone else sees their own profile. Administrator and Executive are given here." />
      <Section title="Accounts">
        <UsersAdmin rows={rows}
          roles={ACCESS_ROLES.map((r) => ({ value: r.value, label: `${r.label}: ${r.description}` }))}
          employees={employees.filter((e) => e.active).map((e) => ({ value: e.id, label: `${e.name} (${e.email})`, taken: !!e.userId }))} />
      </Section>
    </>
  );
}
