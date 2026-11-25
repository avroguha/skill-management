// My team: a manager's people. Four sections, each an entry of the sub menu under My team:
// ratings to confirm, the people and how far each has got (with Remind), what the team
// needs, and the skills grid. Leaders and
// administrators can open any team they may see.
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { Empty, PeopleHeatmap, HeatLegend } from "@/components/heatmap";
import { UnitPicker } from "@/components/filter-bar";
import { SubMenu } from "@/components/sub-menu";
import { TEAM_SECTIONS } from "@/lib/menu";
import { Info } from "@/components/info";
import { PersonChip } from "@/components/person-avatar";
import { requireTeamViewer, getEngine, param, canSeeEmployee, type SearchParams } from "@/lib/server";
import { photoUrls } from "@/lib/photos";
import { getLevels } from "@/lib/levels";
import { peopleHeatmapData, scopeOptions, withParams } from "@/lib/views";
import { readEmailSettings } from "@/lib/mail/notify";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ALL, type Employee } from "@/lib/engine/engine";
import { ConfirmQueue, type ConfirmPerson } from "./confirm";
import { RemindTeam, type RemindCandidate } from "./remind";
import { TeamNeeds, type NeedRow } from "./needs";
import { TeamTitle } from "./rename";
import { TeamRole, type TeamRoleState } from "./role";
import { teamRoleReach } from "@/lib/team-roles";

export const metadata = { title: "My team" };

const STATE_LABEL: Record<string, string> = {
  not_started: "Not started", in_progress: "In progress", sent_back: "Sent back", waiting: "Waiting for the manager", done: "Done", not_asked: "Not asked (manages people)",
};

export default async function TeamPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireTeamViewer();
  const engine = await getEngine();
  const photos = await photoUrls();
  const options = scopeOptions(engine, v).filter((o) => o.id !== ALL);
  const requested = param(sp, "scope");
  const own = v.employee && engine.isManager(v.employee) ? v.employee.id : null;
  const scope = requested && requested !== ALL && options.some((o) => o.id === requested) ? requested : own ?? options[0]?.id ?? null;
  if (!scope) {
    return (<><PageHeader title="My team" /><Empty>Nobody reports to anyone yet. People and their managers come from ServiceNow (Settings › ServiceNow) or a people CSV (Settings › Data).</Empty></>);
  }
  if (requested && requested !== scope) redirect(withParams("/team", { scope, tab: param(sp, "tab") }));
  const manager = engine.empById.get(scope)!;
  const levels = await getLevels();
  const direct = engine.directReportsOf(scope);
  const everyone = engine.reportsOf(scope);
  const mine = scope === v.employee?.id;
  const canConfirm = v.isAdmin || mine;
  const canEdit = v.isAdmin || v.manageIds.has(scope);

  // the team's role: what the manager chose, else what reaches the team from above
  const roleName = (id: string | null | undefined) => (id ? engine.roleById.get(id)?.name ?? null : null);
  const rolePeople = engine.activeEmployees.map((e) => ({ id: e.id, managerId: e.managerId, roleId: e.ownRoleId ?? null, teamRoleId: e.teamRoleId ?? null, teamRoleCascade: e.teamRoleCascade ?? false }));
  const reachDirect = teamRoleReach(rolePeople, scope, false);
  const reachAll = teamRoleReach(rolePeople, scope, true);
  let inherited: TeamRoleState["inherited"] = null;
  if (!roleName(manager.teamRoleId)) {
    const seen = new Set([scope]);
    for (let up = manager.managerId ? engine.empById.get(manager.managerId) : undefined; up && !seen.has(up.id); up = up.managerId ? engine.empById.get(up.managerId) : undefined) {
      seen.add(up.id);
      if (up.teamRoleId && up.teamRoleCascade && roleName(up.teamRoleId)) { inherited = { id: up.teamRoleId, name: roleName(up.teamRoleId)!, from: engine.teamLabel(up.id) }; break; }
    }
  }
  const teamRole: TeamRoleState = {
    managerId: scope, managerName: manager.name, mine,
    current: roleName(manager.teamRoleId) ? { id: manager.teamRoleId!, name: roleName(manager.teamRoleId)!, cascade: !!manager.teamRoleCascade } : null,
    inherited, hasManagersBelow: direct.some((e) => engine.isManager(e)),
    direct: { follow: reachDirect.follow.length, own: reachDirect.own.length },
    everyone: { follow: reachAll.follow.length, own: reachAll.own.length },
    managerOwnRole: roleName(manager.ownRoleId),
  };
  const holders = new Map<string, number>();
  for (const e of engine.activeEmployees) if (e.roleId) holders.set(e.roleId, (holders.get(e.roleId) ?? 0) + 1);
  const roleItems = [...engine.roles].sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({ id: r.id, name: r.name, hint: `${holders.get(r.id) ?? 0} ${holders.get(r.id) === 1 ? "person" : "people"}` }));

  const waitingOf = (e: Employee) => engine.ratingsOf(e.id).filter((r) => r.status === "submitted");
  const toConfirm = direct.filter((e) => waitingOf(e).length > 0);
  const waitingTotal = toConfirm.reduce((t, e) => t + waitingOf(e).length, 0);
  const href = (t: string, extra: Record<string, string | null> = {}) => withParams("/team", { scope: scope === own ? null : scope, tab: t, ...extra });
  // every section has its own address, so the menu can show which one is open: an address
  // without one goes to what waits (ratings to confirm), else to the people
  const asked = TEAM_SECTIONS.find((t) => t.key === param(sp, "tab"))?.key;
  if (!asked) redirect(href(canConfirm && waitingTotal ? "confirm" : "people", { person: param(sp, "person") ?? null }));
  const tab = asked;
  const demands = engine.demands(scope);
  const short = demands.map(engine.coverage).filter((c) => c.shortfall > 0 || c.spof).length;

  let body: React.ReactNode = null;
  if (tab === "confirm") {
    if (!canConfirm) {
      body = <p className="text-sm text-muted-foreground">{waitingTotal ? `${waitingTotal} ratings wait for ${manager.name} to confirm.` : "Nothing waits here."} Only the person&apos;s own manager confirms their ratings.</p>;
    } else {
      const people: ConfirmPerson[] = toConfirm.map((e) => ({
        id: e.id, name: e.name, title: e.title,
        items: waitingOf(e).filter((r) => engine.isRateable(r.skillId)).map((r) => {
          const full = engine.rating(e.id, r.skillId);
          return { skillId: r.skillId, skill: engine.skillLabel(r.skillId), target: engine.targetFor(e, r.skillId)?.target ?? null, self: r.selfLevel ?? 0, before: full?.validatedLevel ?? null, comment: "" };
        }).sort((a, b) => a.skill.localeCompare(b.skill)),
      }));
      // their comments come with the ratings, from the database
      const db = await getDb();
      const ids = people.map((p) => p.id);
      const comments = ids.length ? await db.select({ e: schema.rating.employeeId, s: schema.rating.skillId, c: schema.rating.selfComment }).from(schema.rating).where(inArray(schema.rating.employeeId, ids)) : [];
      const note = new Map(comments.map((x) => [`${x.e}|${x.s}`, x.c]));
      for (const p of people) for (const it of p.items) it.comment = note.get(`${p.id}|${it.skillId}`) ?? "";
      body = <ConfirmQueue people={people} levels={levels} focus={param(sp, "person")} />;
    }
  } else if (tab === "people") {
    const all = param(sp, "all") === "1";
    const list = all ? everyone : direct;
    const rows = list.slice(0, 1000).map((e) => {
      const p = engine.progress(e);
      return {
        name: e.name, href: `/people/${e.id}`, photo: photos.get(e.id) ?? null, title: e.title, manager: e.managerId ? engine.empById.get(e.managerId)?.name ?? "" : "",
        role: roleName(e.roleId) ? `${roleName(e.roleId)}${e.roleFrom ? "" : " (own)"}` : "–",
        state: STATE_LABEL[p.state], rated: p.required ? `${p.rated} / ${p.required}` : "–", waiting: waitingOf(e).length || null,
        onTarget: engine.aggregate([e]).pct,
      };
    });
    const email = await readEmailSettings(await getDb());
    const remindable: RemindCandidate[] = mine && (email.enabled || v.demo) ? direct.flatMap((e) => {
      const p = engine.progress(e);
      return p.needsAction ? [{ id: e.id, name: e.name, state: STATE_LABEL[p.state], progress: p.required ? `${p.rated} of ${p.required} rated` : "" }] : [];
    }) : [];
    body = (
      <Section title={all ? `Everyone below ${manager.name} (${everyone.length})` : `Reporting to ${manager.name} (${direct.length})`}
        info="Each person, how far their own skills have got, and whether ratings wait for their manager. Managers are not asked to rate themselves."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <RemindTeam people={remindable} />
            {mine && !email.enabled && !v.demo && <span className="text-xs text-muted-foreground">Reminders need e-mail (Settings › E-mail)</span>}
            {everyone.length !== direct.length && (
              <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label="Who to list">
                <Link href={href("people")} aria-current={!all ? "page" : undefined} className={!all ? "rounded bg-muted px-2 py-1 font-medium" : "rounded px-2 py-1 text-muted-foreground hover:text-foreground"}>Direct ({direct.length})</Link>
                <Link href={href("people", { all: "1" })} aria-current={all ? "page" : undefined} className={all ? "rounded bg-muted px-2 py-1 font-medium" : "rounded px-2 py-1 text-muted-foreground hover:text-foreground"}>Everyone ({everyone.length})</Link>
              </div>
            )}
          </div>
        )}>
        {list.length > rows.length && <p className="mb-2 text-xs text-muted-foreground">The first {rows.length} of {list.length} by name. Open a manager lower down to see their part in full.</p>}
        <DataTable csvName="my-team" rows={rows} pageSize={25} initialSort={{ key: "name" }} searchPlaceholder="Find a person…"
          columns={[
            { key: "name", header: "Name", kind: "person", hrefKey: "href", photoKey: "photo" },
            { key: "title", header: "Designation", kind: "muted" },
            { key: "role", header: "Role", facet: true, info: "The role that decides which skills they are asked to rate: the team's, or their own where it says (own). Open the person to give them a role of their own." },
            ...(all ? [{ key: "manager", header: "Manager", kind: "person" as const, facet: true }] : []),
            { key: "state", header: "Their skills", facet: true, info: "Not started: nothing rated. In progress: some rated, or saved and not sent. Sent back: the manager returned a rating with a note. Waiting: sent, the manager has not confirmed yet. Done: confirmed." },
            { key: "rated", header: "Rated", align: "right", info: "Skills rated, of those their role asks for." },
            { key: "waiting", header: "To confirm", kind: "number", align: "right", info: "Ratings this person sent that wait for their manager." },
            { key: "onTarget", header: "On target", kind: "pct", align: "right", info: "Of the skills their role asks for, the share where the confirmed level reaches the target." },
          ]} />
      </Section>
    );
  } else if (tab === "needs") {
    const lv = new Map(levels.map((l) => [l.level, l.name]));
    const rows: NeedRow[] = demands.map((d) => {
      const c = engine.coverage(d);
      return {
        skillId: d.skillId, skill: engine.skillLabel(d.skillId), minLevel: d.level, levelName: lv.get(d.level) ?? "", headcount: d.headcount,
        note: "", have: c.count, state: c.critical ? "Nobody" : c.count < c.headcount ? "Short" : c.spof ? "One holder" : "Covered",
        explicit: d.explicit, holders: c.holders.map((id) => engine.empById.get(id)?.name ?? "?"),
        elsewhere: engine.holdersOutside(scope, d.skillId, d.level).filter((e) => canSeeEmployee(v, e.id) || v.allPeople).length,
      };
    }).sort((a, b) => (a.have - a.headcount) - (b.have - b.headcount) || a.skill.localeCompare(b.skill));
    const notes = await (await getDb()).select().from(schema.teamNeed).where(eq(schema.teamNeed.managerId, scope));
    for (const r of rows) r.note = notes.find((n) => n.skillId === r.skillId)?.note ?? "";
    const skills = [...engine.skillById.values()].filter((s) => engine.isRateable(s.id))
      .map((s) => ({ id: s.id, name: engine.skillLabel(s.id), category: engine.categoryById.get(s.categoryId)?.name ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    body = (
      <Section title="What this team needs" info="Skills the team depends on: how many people it needs at what level, and how many it has (the manager and everyone below count). Needs the manager did not set are implied when two or more of their people have a role that asks for a skill.">
        <TeamNeeds managerId={scope} needs={rows} skills={skills} levels={levels} canEdit={canEdit}
          categories={[...engine.categoryById.values()].sort((a, b) => a.sort - b.sort).map((c) => ({ id: c.id, name: c.name }))}
          parents={[...engine.skillById.values()].filter((s) => !s.parentId && s.status === "active").map((s) => ({ id: s.id, name: s.name, categoryId: s.categoryId }))} />
      </Section>
    );
  } else {
    const all = param(sp, "all") === "1";
    const data = peopleHeatmapData(engine, scope, { everyone: all, hideMet: param(sp, "short") === "1", includeRated: true });
    body = (
      <Section title="Skills grid" info="One row per person, one column per skill their roles ask for (and the team's needs, and skills they added). The number is their confirmed level; the colour is how far it is from their target. Hover a cell for the detail."
        actions={(
          <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label="Who to show">
            <Link href={href("grid")} className={!all ? "rounded bg-muted px-2 py-1 font-medium" : "rounded px-2 py-1 text-muted-foreground hover:text-foreground"}>Direct</Link>
            <Link href={href("grid", { all: "1" })} className={all ? "rounded bg-muted px-2 py-1 font-medium" : "rounded px-2 py-1 text-muted-foreground hover:text-foreground"}>Everyone below</Link>
          </div>
        )}>
        <HeatLegend mode="people" />
        <PeopleHeatmap data={data} levels={levels.map((l) => l.name)} />
      </Section>
    );
  }

  return (
    <>
      <PageHeader
        title={<TeamTitle managerId={scope} name={engine.teamLabel(scope)} custom={manager.teamName ?? ""} canEdit={canEdit} />}
        description={<span className="inline-flex flex-wrap items-center gap-1.5">Manager <PersonChip name={manager.name} href={`/people/${manager.id}`} src={photos.get(manager.id)} /> · {direct.length} directly, {everyone.length} in all
          <Info label="About the team">A team is a manager and everyone below them, from the reporting lines (ServiceNow or the people CSV).</Info></span>}
        actions={options.length > 1 ? <UnitPicker units={options.map((o) => ({ id: o.id, name: o.name, depth: o.depth, kind: `${o.people}` }))} value={scope} paramName="scope" /> : undefined} />
      <div className="-mt-3 mb-4 text-sm text-muted-foreground"><TeamRole state={teamRole} roles={roleItems} canEdit={canEdit} /></div>
      <SubMenu label={mine ? "My team" : "Team"} active={tab} items={TEAM_SECTIONS.map((t) => ({
        key: t.key, label: t.label, hint: t.hint, href: href(t.key),
        ...(t.key === "confirm" ? { count: waitingTotal, attention: true } : t.key === "people" ? { count: direct.length } : t.key === "needs" && short ? { count: short, attention: true } : {}),
      }))} />
      {body}
    </>
  );
}
