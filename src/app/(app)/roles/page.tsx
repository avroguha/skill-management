// Roles: the roles of a team and the skills each asks for. A role belongs to one team (its
// manager made it); two teams can each have a role with the same name.
//  - Those who manage a team (its manager, the managers above, leaders, administrators) see
//    all its roles and who is in each, and choose the team.
//  - A member of a team sees the roles they are in themselves and what those ask for: not the
//    team's other roles, and not who else is in a role.
// Roles are changed on the team's page (My team › People and roles).
import Link from "next/link";
import { BriefcaseBusiness, PencilLine } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { Empty } from "@/components/heatmap";
import { Info } from "@/components/info";
import { Button } from "@/components/ui/button";
import { UnitPicker } from "@/components/filter-bar";
import { PersonChip } from "@/components/person-avatar";
import { maySeeTeamRoles } from "@/lib/access";
import { tintStyle } from "@/lib/role-colors";
import { SkillLink } from "@/components/menus";
import { requireViewer, getEngine, param, canSeeEmployee, type SearchParams } from "@/lib/server";
import { photoUrls } from "@/lib/photos";
import { scopeOptions, withParams } from "@/lib/views";
import { ALL } from "@/lib/engine/engine";
import { cn } from "@/lib/utils";

export const metadata = { title: "Roles" };

export default async function RolesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const engine = await getEngine();
  const photos = await photoUrls();
  const me = v.employee;
  const options = scopeOptions(engine, v).filter((o) => o.id !== ALL);
  // the team to show: the one asked for (when they may see it), else their own team (the one
  // they lead, else the one they are in)
  const requested = param(sp, "team");
  const own = me && engine.isManager(me) ? me.id : me?.managerId ?? null;
  const team = requested && (options.some((o) => o.id === requested) || requested === own || requested === me?.managerId) ? requested : own ?? options[0]?.id ?? null;
  const manager = team ? engine.empById.get(team) : undefined;
  if (!team || !manager) {
    return (<><PageHeader title="Roles" /><Empty>There are no teams yet. A team is a manager and the people who report to them; its manager makes its roles.</Empty></>);
  }
  const mine = new Set(me?.roleIds ?? []);
  // the whole team's roles, with who is in each, only for those who manage it
  const full = maySeeTeamRoles(v, team);
  const roles = engine.rolesOf(team).filter((r) => full || mine.has(r.id));
  const canEdit = v.isAdmin || v.manageIds.has(team);
  const levels = new Map((await (await import("@/lib/levels")).getLevels()).map((l) => [l.level, l.name]));
  const direct = engine.directReportsOf(team);
  const inNone = direct.filter((e) => !e.roleIds.length).length;

  return (
    <>
      <PageHeader title={full ? "Roles" : "My roles"}
        description={<span className="inline-flex flex-wrap items-center gap-1.5">{full ? `The roles of ${engine.teamLabel(team)}, made by its manager` : `The roles you are in, in ${engine.teamLabel(team)}. Your manager is`} <PersonChip name={manager.name} href={canSeeEmployee(v, manager.id) ? `/people/${manager.id}` : undefined} src={photos.get(manager.id)} />
          <Info label="About roles">A role is a group inside one team: who is in it, and the skills it asks for. It belongs to that team only, so two teams can each have a role called the same. A person can be in several roles; what their roles ask for is what they are asked to rate. Skills come from the catalogue, which is the same for everyone. Each role has its own soft colour, the same wherever the role shows.{full ? "" : " You see the roles you are in; who else is in a role is for the team’s managers."}</Info></span>}
        actions={(
          <>
            {full && options.length > 1 && <UnitPicker units={options.map((o) => ({ id: o.id, name: o.name, depth: o.depth, kind: `${o.people}` }))} value={team} paramName="team" />}
            {full && me?.managerId && me.roleIds.length > 0 && team !== me.managerId && <Button asChild size="sm" variant="outline"><Link href={withParams("/roles", { team: me.managerId })}><BriefcaseBusiness />My own roles</Link></Button>}
            {!full && own && own !== team && <Button asChild size="sm" variant="outline"><Link href="/roles"><BriefcaseBusiness />My team’s roles</Link></Button>}
            {canEdit && <Button asChild size="sm"><Link href={withParams("/team", { scope: team === (me && engine.isManager(me) ? me.id : null) ? null : team, tab: "people" })}><PencilLine />Change these roles</Link></Button>}
          </>
        )} />
      {roles.length ? (
        <div className="grid gap-4">
          {roles.map((r) => {
            const members = engine.roleMembers(r.id);
            const skills = engine.roleSkillsOf(r.id).filter((k) => engine.isRateable(k.skillId))
              .sort((a, b) => Number(b.mandatory) - Number(a.mandatory) || engine.skillLabel(a.skillId).localeCompare(engine.skillLabel(b.skillId)));
            return (
              <Section key={r.id} id={r.id} style={tintStyle(engine.roleTint(r.id))} className="tint-border tint-edge overflow-hidden" headClassName="tint-band tint-border"
                title={<span className="inline-flex flex-wrap items-center gap-2"><span className="tint-dot size-3.5 shrink-0 rounded-full border border-foreground/20" aria-hidden />{r.name}
                  {full && mine.has(r.id) && <span className="rounded bg-background/70 px-1.5 py-0.5 text-[11px] font-medium">You are in this role</span>}</span>}
                description={r.description || undefined}
                actions={<span className="text-xs text-muted-foreground tabular">{full ? `${members.length} ${members.length === 1 ? "person" : "people"} · ` : ""}{skills.length} {skills.length === 1 ? "skill" : "skills"}</span>}>
                <div className={cn("grid gap-4", full && "lg:grid-cols-2")}>
                  {full && <div className="min-w-0">
                    <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">People in this role</h3>
                    {members.length ? (
                      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                        {members.map((e) => <li key={e.id}><PersonChip name={e.name} href={canSeeEmployee(v, e.id) ? `/people/${e.id}` : undefined} src={photos.get(e.id)} /></li>)}
                      </ul>
                    ) : <p className="text-sm text-muted-foreground">Nobody yet.</p>}
                  </div>}
                  <div className="min-w-0">
                    <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Skills it asks for</h3>
                    {skills.length ? (
                      <ul className="grid gap-1 text-sm">
                        {skills.map((k) => (
                          <li key={k.skillId} className="flex items-center gap-2">
                            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular", k.mandatory ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}
                              title={`Level ${k.target} ${levels.get(k.target) ?? ""}`}>{k.target}</span>
                            <SkillLink id={k.skillId} name={engine.skillLabel(k.skillId)} className="min-w-0 truncate hover:underline" />
                            <span className="shrink-0 text-xs text-muted-foreground">{levels.get(k.target)}{k.mandatory ? "" : " · nice-to-have"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-muted-foreground">No skills yet.</p>}
                  </div>
                </div>
              </Section>
            );
          })}
          {full && inNone > 0 && <p className="text-sm text-muted-foreground">{inNone} {inNone === 1 ? "person who reports" : "people who report"} to {manager.name} {inNone === 1 ? "is" : "are"} in no role yet.</p>}
        </div>
      ) : (
        <Empty>
          {!full ? `You are in no role yet. Your manager, ${manager.name}, makes the team’s roles and puts people in them. Until then nothing in particular is asked of you; you can still add the skills you have, on My skills.`
            : <>{engine.teamLabel(team)} has no roles yet. {canEdit ? "Make them on the team’s page: press Change these roles." : `Its manager, ${manager.name}, makes them. Until then nothing in particular is asked of the team; everyone can still add the skills they have.`}</>}
        </Empty>
      )}
    </>
  );
}
