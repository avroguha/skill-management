// One role, for everyone: the skills it needs and at what level, which teams chose it and
// who has it. Managers and administrators change it here.
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { KpiTiles, Section } from "@/components/kpi";
import { requireViewer, getEngine, canSeeEmployee } from "@/lib/server";
import { Person, PersonChip } from "@/components/person-avatar";
import { photoUrls } from "@/lib/photos";
import { getLevels } from "@/lib/levels";
import { withParams } from "@/lib/views";
import { RoleEditor, RoleTitle, type RoleNeedRow } from "./editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await (await getDb()).select({ name: schema.jobRole.name }).from(schema.jobRole).where(eq(schema.jobRole.id, id));
  return { title: r ? `${r.name} · Roles` : "Role" };
}

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await requireViewer();
  const engine = await getEngine();
  const photos = await photoUrls();
  const db = await getDb();
  const [role] = await db.select().from(schema.jobRole).where(eq(schema.jobRole.id, id));
  if (!role) notFound();
  const [roleSkills, grades, levels, allRoles, allSkills] = await Promise.all([
    db.select().from(schema.roleSkill).where(eq(schema.roleSkill.roleId, id)),
    db.select().from(schema.grade).orderBy(asc(schema.grade.rank)),
    getLevels(),
    db.select({ id: schema.jobRole.id, name: schema.jobRole.name }).from(schema.jobRole),
    db.select().from(schema.skill),
  ]);
  const canEdit = v.isAdmin || v.manageIds.size > 0;
  const gradeName = new Map(grades.map((g) => [g.id, g.name]));
  const byId = new Map(allSkills.map((s) => [s.id, s]));
  const hasChildren = new Set(allSkills.filter((s) => s.parentId && s.status === "active").map((s) => s.parentId!));
  const label = (sid: string) => {
    const s = byId.get(sid);
    if (!s) return "(deleted skill)";
    const p = s.parentId ? byId.get(s.parentId) : undefined;
    return p ? `${p.name} › ${s.name}` : s.name;
  };
  const catName = (sid: string) => engine.categoryById.get(byId.get(sid)?.categoryId ?? "")?.name ?? "";

  const rows: RoleNeedRow[] = [...new Set(roleSkills.map((r) => r.skillId))].map((sid) => {
    const mine = roleSkills.filter((r) => r.skillId === sid);
    const all = mine.find((r) => r.gradeId == null);
    const perGrade = mine.filter((r) => r.gradeId != null).sort((a, b) => (grades.findIndex((g) => g.id === a.gradeId)) - (grades.findIndex((g) => g.id === b.gradeId)));
    return {
      skillId: sid, skill: label(sid), category: catName(sid), target: all?.target ?? null, mandatory: mine[0]?.mandatory ?? true,
      grades: perGrade.map((r) => `${gradeName.get(r.gradeId!) ?? "?"} ${r.target}`).join(" · "),
    };
  }).sort((a, b) => Number(b.mandatory) - Number(a.mandatory) || a.category.localeCompare(b.category) || a.skill.localeCompare(b.skill));

  const holders = engine.activeEmployees.filter((e) => e.roleId === id);
  const teams = engine.activeEmployees.filter((e) => e.teamRoleId === id && engine.isManager(e));
  const visible = holders.filter((e) => canSeeEmployee(v, e.id)).sort((a, b) => a.name.localeCompare(b.name));
  const catalogue = allSkills.filter((s) => s.status === "active" && !hasChildren.has(s.id))
    .map((s) => ({ id: s.id, name: label(s.id), aliases: s.aliases, hint: catName(s.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Roles", href: "/roles" }, { label: role.name }]}
        title={<RoleTitle id={role.id} name={role.name} description={role.description} canEdit={canEdit} others={allRoles.filter((r) => r.id !== id)} />}
        description={role.description || (canEdit ? "No description yet: the pencil adds one." : undefined)} />
      <KpiTiles className="mb-5" items={[
        { label: "Skills it needs", value: String(rows.length), hint: `${rows.filter((r) => r.mandatory).length} must-have`,
          info: "The skills someone in this role is asked to rate, each with the level the role needs. Must-have skills count as a gap when the level is not reached; nice-to-have ones never do." },
        { label: "People", value: String(holders.length), hint: "have this role",
          info: "People whose role this is: their own, or the one their team follows." },
        { label: "Teams", value: String(teams.length), hint: teams.length ? teams.slice(0, 2).map((m) => engine.teamLabel(m.id)).join(", ") + (teams.length > 2 ? ` +${teams.length - 2}` : "") : "no team chose it",
          info: "Teams whose manager chose this as the team's role (My team › the role under the title)." },
      ]} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Skills this role needs"
          info="Each skill with the level the role needs (0-5, Settings › Levels & rules has the wording). The same skill can be in any number of roles. People in the role are asked to rate these, and their manager confirms.">
          <RoleEditor roleId={role.id} rows={rows} canEdit={canEdit} catalogue={catalogue} levels={levels.map((l) => ({ level: l.level, name: l.name }))}
            categories={[...engine.categoryById.values()].sort((a, b) => a.sort - b.sort).map((c) => ({ id: c.id, name: c.name }))} isAdmin={v.isAdmin} />
        </Section>
        <Section title="Who has it" info="Teams that chose this role, and the people who have it that you may see (your own people; everyone, for leaders and administrators).">
          {teams.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Teams</div>
              <ul className="grid gap-1 text-sm">
                {teams.sort((a, b) => engine.teamLabel(a.id).localeCompare(engine.teamLabel(b.id))).map((m) => (
                  <li key={m.id} className="flex flex-wrap items-baseline gap-x-2">
                    {v.canSeeTeams && canSeeEmployee(v, m.id) ? <Link href={withParams("/team", { scope: m.id })} className="font-medium hover:underline">{engine.teamLabel(m.id)}</Link> : <span className="font-medium">{engine.teamLabel(m.id)}</span>}
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><PersonChip name={m.name} src={photos.get(m.id)} />{m.teamRoleCascade ? " · everyone below" : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {visible.length > 0 ? (
            <>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">People ({visible.length}{visible.length < holders.length ? ` of ${holders.length}` : ""})</div>
              <ul className="grid gap-1 text-sm">
                {visible.slice(0, 40).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-2">
                    <Person name={e.name} href={`/people/${e.id}`} src={photos.get(e.id)} strong={false} />
                    <span className="text-xs text-muted-foreground">{e.roleFrom ? `with ${engine.teamLabel(e.roleFrom)}` : "their own role"}</span>
                  </li>
                ))}
              </ul>
              {visible.length > 40 && <p className="mt-2 text-xs text-muted-foreground">and {visible.length - 40} more: People › Role lists them all.</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{holders.length ? `${holders.length} ${holders.length === 1 ? "person has" : "people have"} this role.` : "Nobody has this role yet."}{canEdit && !holders.length ? " Choose it for your team on My team." : ""}</p>
          )}
        </Section>
      </div>
    </>
  );
}
