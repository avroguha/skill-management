// Roles, for everyone: every role, the skills it needs and who has it. The box at the top
// searches as you type and, for managers and administrators, adds a role that is not there.
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { requireViewer, getEngine } from "@/lib/server";
import { RolesBrowser, type RoleCard } from "./browser";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  const v = await requireViewer();
  const engine = await getEngine();
  const db = await getDb();
  const [roles, roleSkills] = await Promise.all([
    db.select().from(schema.jobRole).orderBy(asc(schema.jobRole.name)),
    db.select({ roleId: schema.roleSkill.roleId, skillId: schema.roleSkill.skillId }).from(schema.roleSkill),
  ]);
  const people = new Map<string, number>();
  const teams = new Map<string, string[]>();
  for (const e of engine.activeEmployees) {
    if (e.roleId) people.set(e.roleId, (people.get(e.roleId) ?? 0) + 1);
    if (e.teamRoleId && engine.isManager(e)) teams.set(e.teamRoleId, [...(teams.get(e.teamRoleId) ?? []), engine.teamLabel(e.id)]);
  }
  const cards: RoleCard[] = roles.map((r) => {
    const skillIds = [...new Set(roleSkills.filter((x) => x.roleId === r.id).map((x) => x.skillId))].filter((id) => engine.isRateable(id));
    return {
      id: r.id, name: r.name, description: r.description, people: people.get(r.id) ?? 0,
      skills: skillIds.length, topSkills: skillIds.map((id) => engine.skillLabel(id)).sort().slice(0, 4),
      teams: (teams.get(r.id) ?? []).sort(),
    };
  });
  const canEdit = v.isAdmin || v.manageIds.size > 0;
  return (
    <>
      <PageHeader title="Roles" description={canEdit
        ? "What people do, and the skills each role needs. Find a role, or type a new name to add it; choose your team's role on My team."
        : "What people do, and the skills each role needs. Your role decides which skills you are asked to rate."} />
      <RolesBrowser roles={cards} canEdit={canEdit} />
    </>
  );
}
