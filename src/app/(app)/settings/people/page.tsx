// Settings › People & access: everyone in the app (grade, manager, team name; their roles are
// their manager's to give) and the accounts that can sign in (administrators, coordinators,
// leaders, local passwords).
import { asc, max } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { ACCESS_ROLES, getEngine, getViewer } from "@/lib/server";
import { isLocalAdmin } from "@/lib/local-admin";
import { UsersAdmin } from "./client";
import { PeopleAdmin } from "./people";

export const metadata = { title: "People & access · Settings" };

export default async function PeopleSettings() {
  const v = await getViewer();
  const db = await getDb();
  const engine = await getEngine();
  const [people, users, accounts, sessions] = await Promise.all([
    db.select().from(schema.employee).orderBy(asc(schema.employee.name)),
    db.select().from(schema.user).orderBy(asc(schema.user.name)),
    db.select({ userId: schema.account.userId, providerId: schema.account.providerId }).from(schema.account),
    db.select({ userId: schema.session.userId, last: max(schema.session.updatedAt) }).from(schema.session).groupBy(schema.session.userId),
  ]);
  const name = new Map(people.map((p) => [p.id, p.name]));
  const personRows = people.map((p) => ({
    id: p.id, name: p.name, email: p.email, title: p.title, location: p.location, gradeId: p.gradeId ?? "", managerId: p.managerId ?? "",
    teamName: p.teamName, active: p.active,
    role: (engine.empById.get(p.id)?.roleIds ?? []).map((id) => engine.roleById.get(id)?.name).filter(Boolean).join(", "),
    grade: engine.gradeById.get(p.gradeId ?? "")?.name ?? "",
    manager: p.managerId ? name.get(p.managerId) ?? "" : "", source: p.source === "directory" ? "ServiceNow" : "Manual",
    status: p.active ? "Active" : "Left",
  }));
  const userRows = users.map((u) => {
    const emp = people.find((e) => e.userId === u.id);
    const methods = accounts.filter((a) => a.userId === u.id).map((a) => (a.providerId === "credential" ? "Local" : "SSO"));
    const role = (u.role ?? "employee") as string;
    const manages = emp ? engine.directReportsOf(emp.id).length > 0 : false;
    const localAdmin = isLocalAdmin(u);
    const access = localAdmin ? "Administrator · local, kept for when SSO is down"
      : (role === "employee" || role === "manager") && manages ? "Manager (has people reporting)"
        : ACCESS_ROLES.find((r) => r.value === (role === "executive" || role === "operator" ? "leader" : role))?.label ?? role;
    return {
      id: u.id, name: u.name, username: u.username ?? "", email: u.email, role: role === "executive" || role === "operator" ? "leader" : role, access,
      employeeId: emp?.id ?? "none", person: emp?.name ?? "", method: [...new Set(methods)].join(", ") || "–",
      status: u.banned ? "Disabled" : u.mustChangePassword ? "Must change password" : "Active", banned: !!u.banned,
      lastSeen: sessions.find((s) => s.userId === u.id)?.last?.toISOString() ?? null,
      local: methods.includes("Local"), localAdmin,
    };
  });
  const opts = (xs: { id: string; name: string }[]) => xs.map((x) => ({ value: x.id, label: x.name })).sort((a, b) => a.label.localeCompare(b.label));
  return (
    <>
      <PageHeader title="People & access"
        description="Everyone in the app with their manager, and the accounts that sign in. Access follows who people are: having people reporting to you makes you a manager. Coordinators, who approve new skills and categories, are named under Accounts." />
      <div className="grid gap-5">
        <Section title={`People (${people.filter((p) => p.active).length} active)`}
          info="Usually from ServiceNow (Settings › ServiceNow), which keeps names, e-mails, designations and managers up to date. A person’s roles are not set here: their manager makes the team’s roles and puts people in them (My team › People and roles).">
          <PeopleAdmin rows={personRows} readOnly={!!v?.demo}
            grades={opts(engine.grades)}
            managers={people.filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.name}${p.title ? ` · ${p.title}` : ""}` }))} />
        </Section>
        <Section title="Accounts" info="Who can sign in, and what they are: an administrator (everything), a leader (reads the whole organisation), a coordinator (approves requests for new skills and categories) or an employee. People who sign in with single sign-on get an account by themselves on their first sign-in. The local admin account is kept for when single sign-on is down.">
          {v?.demo ? <p className="text-sm text-muted-foreground">Accounts are real, so they are not shown in demo mode.</p> : (
            <UsersAdmin rows={userRows}
              roles={ACCESS_ROLES.filter((r) => r.value !== "manager").map((r) => ({ value: r.value, label: `${r.label}: ${r.description}` }))}
              employees={people.filter((e) => e.active).map((e) => ({ value: e.id, label: `${e.name} (${e.email})`, taken: !!e.userId }))} />
          )}
        </Section>
      </div>
    </>
  );
}
