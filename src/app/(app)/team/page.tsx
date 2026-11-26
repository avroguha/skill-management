// My team: a manager's people. Its sections are the sub menu under My team:
//   To confirm        ratings the people sent
//   People and roles  the team's roles, one section each: who is in it, which skills it asks for
//   Team needs        the skills the team must have
//   Skills grid       everyone against every skill
//   Fit in other teams  where these people's skills also match a role elsewhere
//   Review changes    changes to roles and needs that are not in force yet
// Leaders and administrators can open any team they may see.
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
import { Button } from "@/components/ui/button";
import { requireTeamViewer, getEngine, param, canSeeEmployee, type SearchParams } from "@/lib/server";
import { photoUrls } from "@/lib/photos";
import { getLevels } from "@/lib/levels";
import { peopleHeatmapData, scopeOptions, withParams } from "@/lib/views";
import { readEmailSettings } from "@/lib/mail/notify";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ALL, type Employee } from "@/lib/engine/engine";
import { diffSetup, sanitize, type Change } from "@/lib/team-setup";
import { readDraft, readLiveSetup } from "@/lib/team-setup-db";
import { getAskCatalogue } from "@/lib/catalogue-view";
import { fmtDate } from "@/lib/format";
import { tintName, tintsFor } from "@/lib/role-colors";
import { ConfirmQueue, type ConfirmPerson } from "./confirm";
import { RemindTeam, type RemindCandidate } from "./remind";
import { TeamNeeds, type NeedRow } from "./needs";
import { TeamTitle } from "./rename";
import { TeamBoard, type BoardPerson, type BoardRole } from "./board";
import { ReviewChanges, type ReviewLine } from "./review";

export const metadata = { title: "My team" };

const STATE_LABEL: Record<string, string> = {
  not_started: "Not started", in_progress: "In progress", sent_back: "Sent back", waiting: "Waiting for the manager", done: "Done", not_asked: "Not asked (manages people)",
};
const STATE_SHORT: Record<string, string> = { not_started: "Not started", in_progress: "In progress", sent_back: "Sent back", waiting: "Waiting", done: "Done", not_asked: "Manager" };
const STATE_TONE: Record<string, BoardPerson["tone"]> = { not_started: "todo", in_progress: "wait", sent_back: "todo", waiting: "wait", done: "done", not_asked: "none" };

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
  const canEdit = (v.isAdmin || v.manageIds.has(scope)) && !v.viewAs;
  const db = await getDb();

  // the team's setup: what is in force, and the draft of changes not confirmed yet
  const ctx = { people: new Set(direct.map((e) => e.id)), rateable: engine.isRateable };
  const live = sanitize(await readLiveSetup(db, scope), ctx);
  const stored = await readDraft(db, scope);
  const draft = stored ? sanitize(stored.setup, ctx) : null;
  const changes = draft ? diffSetup(live, draft) : [];
  const view = changes.length ? draft! : live;
  const changed = new Set(changes.map((c) => c.key));

  const waitingOf = (e: Employee) => engine.ratingsOf(e.id).filter((r) => r.status === "submitted");
  const toConfirm = direct.filter((e) => waitingOf(e).length > 0);
  const waitingTotal = toConfirm.reduce((t, e) => t + waitingOf(e).length, 0);
  const href = (t: string, extra: Record<string, string | null> = {}) => withParams("/team", { scope: scope === own ? null : scope, tab: t, ...extra });
  // every section has its own address, so the menu can show which one is open: an address
  // without one goes to what waits (ratings to confirm), else to the people
  const asked = TEAM_SECTIONS.find((t) => t.key === param(sp, "tab"))?.key;
  if (!asked) redirect(href(canConfirm && waitingTotal ? "confirm" : "people", { person: param(sp, "person") ?? null }));
  const tab = asked;
  const short = engine.demands(scope).map(engine.coverage).filter((c) => c.shortfall > 0 || c.spof).length;
  const roleNames = (e: Employee) => e.roleIds.map((id) => engine.roleById.get(id)?.name).filter(Boolean).join(", ");
  const roleTags = (e: Employee) => e.roleIds.flatMap((id) => { const r = engine.roleById.get(id); return r ? [{ name: r.name, tint: engine.roleTint(id) }] : []; });
  const skillName = (id: string) => engine.skillLabel(id) || "a skill that was removed";
  const personName = (id: string) => engine.empById.get(id)?.name ?? "someone";

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
        role: roleNames(e) || "–", roleTags: roleTags(e),
        state: STATE_LABEL[p.state], rated: p.required ? `${p.rated} / ${p.required}` : "–", waiting: waitingOf(e).length || null,
        onTarget: engine.aggregate([e]).pct,
      };
    });
    const email = await readEmailSettings(db);
    const remindable: RemindCandidate[] = mine && (email.enabled || v.demo) ? direct.flatMap((e) => {
      const p = engine.progress(e);
      return p.needsAction ? [{ id: e.id, name: e.name, state: STATE_LABEL[p.state], progress: p.required ? `${p.rated} of ${p.required} rated` : "" }] : [];
    }) : [];
    const liveRoles = new Set(live.roles.map((r) => r.id));
    const tints = tintsFor(view.roles);
    const boardRoles: BoardRole[] = view.roles.map((r) => ({
      id: r.id, name: r.name, description: r.description, tint: tints.get(r.id) ?? "slate", draft: !liveRoles.has(r.id),
      members: r.members.map((id) => ({ id, draft: liveRoles.has(r.id) && changed.has(`member_added:${r.id}:${id}`) }))
        .sort((a, b) => personName(a.id).localeCompare(personName(b.id))),
      skills: r.skills.map((k) => ({
        skillId: k.skillId, name: skillName(k.skillId), category: engine.categoryById.get(engine.skillById.get(k.skillId)?.categoryId ?? "")?.name ?? "",
        target: k.target, mandatory: k.mandatory, draft: liveRoles.has(r.id) && (changed.has(`skill_added:${r.id}:${k.skillId}`) || changed.has(`skill_changed:${r.id}:${k.skillId}`)),
      })).sort((a, b) => Number(b.mandatory) - Number(a.mandatory) || a.name.localeCompare(b.name)),
    }));
    const boardPeople: BoardPerson[] = direct.map((e) => {
      const p = engine.progress(e);
      return { id: e.id, name: e.name, title: e.title, photo: photos.get(e.id) ?? null, href: `/people/${e.id}`, status: STATE_SHORT[p.state] ?? "", tone: STATE_TONE[p.state] ?? "none", rated: p.required ? `${p.rated} of ${p.required}` : "" };
    });
    const catalogue = [...engine.skillById.values()].filter((s) => engine.isRateable(s.id))
      .map((s) => ({ id: s.id, name: engine.skillLabel(s.id), category: engine.categoryById.get(s.categoryId)?.name ?? "", categoryId: s.categoryId }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const ask = await getAskCatalogue();
    body = (
      <div className="grid gap-5">
        <Section title={`Roles (${view.roles.length})`}
          info="A role is a group inside this team, made by its manager: who is in it, and which skills it asks for. Its name is unique in this team only. A person can be in more than one role, and nobody is put in a role by themselves. What a person's roles ask for is what they are asked to rate.">
          <TeamBoard managerId={scope} canEdit={canEdit} roles={boardRoles} people={boardPeople} catalogue={catalogue} levels={levels} ask={ask}
            categories={[...engine.categoryById.values()].sort((a, b) => a.sort - b.sort).map((c) => ({ id: c.id, name: c.name }))} />
        </Section>
        <Section title={all ? `Everyone below ${manager.name}, as a list (${everyone.length})` : `Reporting to ${manager.name}, as a list (${direct.length})`}
          info="Each person, how far their own skills have got, and whether ratings wait for their manager. Managers are not asked to rate themselves. The roles shown are the ones in force."
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
              { key: "role", header: "Roles", kind: "roles", chipsKey: "roleTags", facet: true, info: "The roles of their manager's team this person is in, each in its own colour. What those roles ask for is what they are asked to rate." },
              ...(all ? [{ key: "manager", header: "Manager", kind: "person" as const, facet: true }] : []),
              { key: "state", header: "Their skills", facet: true, info: "Not started: nothing rated. In progress: some rated, or saved and not sent. Sent back: the manager returned a rating with a note. Waiting: sent, the manager has not confirmed yet. Done: confirmed." },
              { key: "rated", header: "Rated", align: "right", info: "Skills rated, of those their roles ask for." },
              { key: "waiting", header: "To confirm", kind: "number", align: "right", info: "Ratings this person sent that wait for their manager." },
              { key: "onTarget", header: "On target", kind: "pct", align: "right", info: "Of the skills their roles ask for, the share where the confirmed level reaches the level asked." },
            ]} />
        </Section>
      </div>
    );
  } else if (tab === "needs") {
    const lv = new Map(levels.map((l) => [l.level, l.name]));
    const set = new Set(view.needs.map((n) => n.skillId));
    const off = new Set(view.dismissed);
    const implied = engine.impliedDemands(scope);
    const all = [
      ...view.needs.map((n) => ({ d: { managerId: scope, skillId: n.skillId, level: n.minLevel, headcount: Math.max(1, n.headcount), explicit: true }, note: n.note })),
      ...implied.filter((d) => !set.has(d.skillId) && !off.has(d.skillId)).map((d) => ({ d, note: "" })),
    ];
    const rows: NeedRow[] = all.map(({ d, note }) => {
      const c = engine.coverage(d);
      return {
        skillId: d.skillId, skill: skillName(d.skillId), minLevel: d.level, levelName: lv.get(d.level) ?? "", headcount: d.headcount,
        note, have: c.count, state: c.critical ? "Nobody" : c.count < c.headcount ? "Short" : c.spof ? "One holder" : "Covered",
        explicit: d.explicit, draft: changed.has(`need_added:${d.skillId}`) || changed.has(`need_changed:${d.skillId}`) || changed.has(`need_restored:${d.skillId}`),
        holders: c.holders.map((id) => engine.empById.get(id)?.name ?? "?"),
        elsewhere: engine.holdersOutside(scope, d.skillId, d.level).filter((e) => canSeeEmployee(v, e.id) || v.allPeople).length,
      };
    }).sort((a, b) => (a.have - a.headcount) - (b.have - b.headcount) || a.skill.localeCompare(b.skill));
    const skills = [...engine.skillById.values()].filter((s) => engine.isRateable(s.id))
      .map((s) => ({ id: s.id, name: engine.skillLabel(s.id), category: engine.categoryById.get(s.categoryId)?.name ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const impliedIds = new Set(implied.map((d) => d.skillId));
    body = (
      <Section title="What this team needs" info="Skills the team depends on: how many people it needs at what level, and how many it has (the manager and everyone below count). The manager chooses them. A need is also listed “from the roles” when two or more of the manager's people are in a role that asks for a skill as a must-have. Every need can be changed or removed, those too.">
        <TeamNeeds managerId={scope} needs={rows} skills={skills} levels={levels} canEdit={canEdit} ask={await getAskCatalogue()}
          dismissed={view.dismissed.filter((id) => impliedIds.has(id)).map((id) => ({ id, name: skillName(id) }))} />
      </Section>
    );
  } else if (tab === "grid") {
    const all = param(sp, "all") === "1";
    const data = peopleHeatmapData(engine, scope, { everyone: all, hideMet: param(sp, "short") === "1", includeRated: true });
    body = (
      <Section title="Skills grid" info="One row per person, one column per skill their roles ask for (and the team's needs, and skills they added). The number is their confirmed level; the colour is how far it is from the level asked. Hover a cell for the detail."
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
  } else if (tab === "fit") {
    const at = engine.settings.fitPercent;
    const rows = direct.flatMap((e) => engine.roleFits(e, at, 8).map((f) => {
      const role = engine.roleById.get(f.roleId)!;
      const boss = engine.empById.get(f.managerId)!;
      return {
        name: e.name, href: `/people/${e.id}`, photo: photos.get(e.id) ?? null,
        team: engine.teamLabel(f.managerId), manager: boss.name, managerHref: canSeeEmployee(v, boss.id) ? `/people/${boss.id}` : undefined, managerPhoto: photos.get(boss.id) ?? null,
        role: role.name, roleTags: [{ name: role.name, tint: engine.roleTint(role.id) }], match: f.pct, has: `${f.matched.length} of ${f.matched.length + f.missing.length}`,
        missing: f.missing.map((m) => `${engine.skillLabel(m.skillId)} (${m.level ?? "not rated"}, asks ${m.target})`).join("; ") || "–",
      };
    }));
    body = (
      <Section title="Where your people would also fit"
        description={`A person is listed for a role of another team when they already hold at least ${at}% of the skills that role asks for, at the level it asks for.`}
        info={<>For each person who reports here: the roles of <b>other</b> teams their confirmed skills match, the team, and the manager they would be under. Match = the skills of that role they hold at the level it asks for, out of all the role asks for. It is shown from {at}% upwards; an administrator changes that number in Settings › Levels &amp; rules. This shows capability only: whether anyone moves is a conversation.</>}>
        {rows.length ? (
          <DataTable csvName="fit-in-other-teams" rows={rows} pageSize={25} initialSort={{ key: "match", desc: true }} searchPlaceholder="Find a person, team or role…"
            columns={[
              { key: "name", header: "Person", kind: "person", hrefKey: "href", photoKey: "photo", facet: true },
              { key: "team", header: "Would fit in", facet: true, info: "The other team whose role their skills match." },
              { key: "manager", header: "Under", kind: "person", hrefKey: "managerHref", photoKey: "managerPhoto", info: "The manager of that team." },
              { key: "role", header: "As", kind: "roles", chipsKey: "roleTags", facet: true, info: "The role of that team their skills match." },
              { key: "match", header: "Match", kind: "pct", align: "right", info: "The share of that role's skills they hold at the level it asks for." },
              { key: "has", header: "Skills", align: "right", info: "How many of the role's skills they hold at the level it asks for." },
              { key: "missing", header: "Not there yet", kind: "muted", info: "The skills of that role they are below in or have not rated: their level, and the level the role asks for." },
            ]} />
        ) : (
          <Empty>Nobody here matches a role of another team at {at}% or more yet. This fills in as people&apos;s ratings are confirmed and other teams set up their roles.</Empty>
        )}
      </Section>
    );
  } else {
    const line = (c: Change): ReviewLine => {
      const need = (n: { minLevel: number; headcount: number }) => `${n.headcount} ${n.headcount === 1 ? "person" : "people"} at level ${n.minLevel} or above`;
      const kind = (m: boolean) => (m ? "must-have" : "nice-to-have");
      switch (c.kind) {
        case "role_added": return { key: c.key, group: `Role: ${c.role}`, kind: "add", text: `New role “${c.role}”` };
        case "role_removed": return { key: c.key, group: `Role: ${c.role}`, kind: "remove", text: `Role “${c.role}” deleted (${c.members} ${c.members === 1 ? "person" : "people"} in it, ${c.skills} ${c.skills === 1 ? "skill" : "skills"})` };
        case "role_renamed": return { key: c.key, group: `Role: ${c.role}`, kind: "change", text: `Renamed from “${c.from}” to “${c.role}”` };
        case "role_described": return { key: c.key, group: `Role: ${c.role}`, kind: "change", text: "What it is for was changed" };
        case "role_coloured": return { key: c.key, group: `Role: ${c.role}`, kind: "change", text: `Colour changed${tintName(c.from) ? ` from ${tintName(c.from)}` : ""} to ${tintName(c.color) || "the team's next free colour"}` };
        case "roles_reordered": return { key: c.key, group: "Roles", kind: "change", text: "The order of the roles was changed" };
        case "member_added": return { key: c.key, group: `Role: ${c.role}`, kind: "add", text: `${personName(c.employeeId)} added to the role` };
        case "member_removed": return { key: c.key, group: `Role: ${c.role}`, kind: "remove", text: `${personName(c.employeeId)} taken out of the role` };
        case "skill_added": return { key: c.key, group: `Role: ${c.role}`, kind: "add", text: `${skillName(c.skillId)} added, level ${c.target}, ${kind(c.mandatory)}` };
        case "skill_removed": return { key: c.key, group: `Role: ${c.role}`, kind: "remove", text: `${skillName(c.skillId)} removed (was level ${c.target}, ${kind(c.mandatory)})` };
        case "skill_changed": return { key: c.key, group: `Role: ${c.role}`, kind: "change", text: `${skillName(c.skillId)}: ${[c.from.target !== c.target ? `level ${c.from.target} → ${c.target}` : "", c.from.mandatory !== c.mandatory ? `now a ${kind(c.mandatory)}` : ""].filter(Boolean).join(", ")}` };
        case "need_added": return { key: c.key, group: "Team needs", kind: "add", text: `${skillName(c.skillId)}: ${need(c)}` };
        case "need_removed": return { key: c.key, group: "Team needs", kind: "remove", text: `${skillName(c.skillId)} removed (was ${need(c)})` };
        case "need_changed": return { key: c.key, group: "Team needs", kind: "change", text: `${skillName(c.skillId)}: ${need(c.from)} → ${need(c)}${c.from.minLevel === c.minLevel && c.from.headcount === c.headcount ? " (the reason changed)" : ""}` };
        case "need_dismissed": return { key: c.key, group: "Team needs", kind: "remove", text: `${skillName(c.skillId)} taken off the list (the roles ask for it)` };
        case "need_restored": return { key: c.key, group: "Team needs", kind: "add", text: `${skillName(c.skillId)} back on the list` };
      }
    };
    body = (
      <Section title="Review changes" info="Every change to this team's roles and needs is a draft first. Here is what differs from what is in force. Take back a line you did not mean, then confirm: only then do people's roles and the skills they are asked for change.">
        <ReviewChanges managerId={scope} canEdit={canEdit} lines={changes.map(line)} by={stored?.authorName ?? ""} when={stored ? fmtDate(stored.updatedAt) : ""} backHref={href("people")} />
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
      <SubMenu label={mine ? "My team" : "Team"} active={tab} items={TEAM_SECTIONS.map((t) => ({
        key: t.key, label: t.label, hint: t.hint, href: href(t.key),
        ...(t.key === "confirm" ? { count: waitingTotal, attention: true } : t.key === "people" ? { count: direct.length } : t.key === "needs" && short ? { count: short, attention: true }
          : t.key === "review" && changes.length ? { count: changes.length, attention: true } : {}),
      }))} />
      {changes.length > 0 && tab !== "review" && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="min-w-0 flex-1"><b className="tabular">{changes.length} change{changes.length === 1 ? "" : "s"}</b> to this team {changes.length === 1 ? "is" : "are"} a draft: not in force until confirmed. What you see here includes {changes.length === 1 ? "it" : "them"}.</span>
          <Button asChild size="sm"><Link href={href("review")}>Review changes</Link></Button>
        </div>
      )}
      {body}
    </>
  );
}
