// My team: everything a manager looks after, for anyone with people reporting to them.
//   People         direct reports (or everyone below): role, self-assessment, what waits for
//                  validation, on-target share, gaps and open training
//   Skills needed  what the team needs beyond its roles (editable), and what roles already expect
//   Gaps           team needs that are short, and each person below their target
//   Training       training plans booked for the team
// Administrators, executives and managers of managers can open any team they can see.
import { redirect } from "next/navigation";
import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { CheckCheck, LayoutGrid, Network } from "lucide-react";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker, type UnitOption } from "@/components/filter-bar";
import { KpiTiles, Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { NeedList } from "@/components/needs";
import { Empty } from "@/components/heatmap";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireViewer, getEngine, loadDataset, param, type SearchParams } from "@/lib/server";
import { needView, withParams } from "@/lib/views";
import type { Employee } from "@/lib/engine/engine";
import { TeamNeeds, type NeedRow } from "./team-needs";

export const metadata = { title: "My team" };

const TABS = ["people", "skills", "gaps", "training"] as const;

export default async function TeamPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const engine = await getEngine();
  const active = (e: Employee | undefined): e is Employee => !!e && e.active;
  const below = (id: string) => engine.reportsOf(id).filter(active);
  const directOf = (id: string) => [...engine.empById.values()].filter((e) => e.active && e.managerId === id);

  // whose team: the viewer's own, or one they may open (admins and executives: anyone's;
  // a manager: their own and those of managers below them)
  const own = v.employee && below(v.employee.id).length ? v.employee : null;
  const pool: Employee[] = v.allUnits ? [...engine.empById.values()].filter(active) : own ? [own, ...below(own.id)] : [];
  const leads = pool.filter((e) => below(e.id).length > 0);
  // ?unit=<id> (from Admin › Organisation): that unit's manager, on the skills it needs
  const unitParam = param(sp, "unit");
  const requested = param(sp, "manager") ?? (unitParam ? engine.unitById.get(unitParam)?.managerId ?? undefined : undefined);
  const manager = (requested && leads.find((e) => e.id === requested)) || own
    || [...leads].sort((a, b) => below(b.id).length - below(a.id).length)[0] || null;
  if (!manager) {
    if (!v.allUnits) redirect(v.employee ? `/people/${v.employee.id}` : "/");
    return (<><PageHeader title="My team" /><Empty>Nobody reports to anyone yet. Sync people from ServiceNow, or set managers in Admin › Organisation.</Empty></>);
  }
  const mine = manager.id === own?.id;
  const tab = (TABS as readonly string[]).includes(param(sp, "tab") ?? "") ? param(sp, "tab")! : unitParam ? "skills" : "people";
  const everyone = below(manager.id);
  const direct = directOf(manager.id);
  const scopeAll = param(sp, "scope") === "all" || !direct.length; // a unit manager may have no reporting lines
  const people = scopeAll ? everyone : direct;
  const link = (patch: Record<string, string | null>) => withParams("/team", { manager: mine ? null : manager.id, tab, scope: scopeAll && direct.length ? "all" : null, ...patch });

  // the team the "skills needed" belong to: the unit this manager leads (the top one if several)
  const units = engine.managedUnitIds(manager.id);
  const unitId = (unitParam && units.includes(unitParam) ? unitParam : null)
    ?? units.find((u) => !engine.ancestors(u).some((a) => units.includes(a.id))) ?? units[0] ?? null;
  const unit = unitId ? engine.unitById.get(unitId) ?? null : null;

  const db = await getDb();
  const ids = everyone.map((e) => e.id);
  const [levels, categories, reqs, plans] = await Promise.all([
    db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level)),
    db.select().from(schema.skillCategory).orderBy(asc(schema.skillCategory.sort)),
    unitId ? db.select().from(schema.unitRequirement).where(eq(schema.unitRequirement.unitId, unitId)) : Promise.resolve([]),
    ids.length ? db.select().from(schema.trainingPlan).where(inArray(schema.trainingPlan.employeeId, ids)) : Promise.resolve([]),
  ]);
  const levelName = (n: number) => levels.find((l) => l.level === n)?.name ?? String(n);
  const roleName = new Map((await loadDataset()).roles.map((r) => [r.id, r.name]));
  const openPlans = plans.filter((p) => p.status === "planned" || p.status === "in_progress");

  // ---- people ----
  const gapsAll = engine.individualGaps(people);
  const rows = people.map((e) => {
    const cells = engine.personProfile(e).cells;
    const required = cells.filter((c) => c.target != null && c.mandatory);
    const selfDone = required.filter((c) => c.selfLevel != null).length;
    const waiting = cells.filter((c) => c.status === "submitted").length;
    const returned = cells.filter((c) => c.status === "returned").length;
    const status = waiting ? "Waiting for validation" : returned ? "Sent back" : !cells.some((c) => c.selfLevel != null) ? "Not started"
      : selfDone < required.length || cells.some((c) => c.status === "draft") ? "In progress" : "Up to date";
    const last = cells.reduce<number>((m, c) => Math.max(m, c.at?.getTime() ?? 0), 0);
    const team = directOf(e.id).length;
    return {
      name: e.name, href: `/people/${e.id}`, title: e.title,
      role: [roleName.get(e.roleId ?? ""), engine.gradeById.get(e.gradeId ?? "")?.name].filter(Boolean).join(" · "),
      selfAssessed: required.length ? `${selfDone} / ${required.length}` : "–",
      status, toValidate: v.reportIds.has(e.id) && waiting ? waiting : null,
      onTarget: engine.aggregate([e]).pct, gaps: gapsAll.filter((g) => g.employeeId === e.id && g.level != null).length || null,
      training: openPlans.filter((p) => p.employeeId === e.id).length || null,
      last: last ? new Date(last).toISOString() : null,
      team: team ? `${team} report${team === 1 ? "" : "s"}` : "", teamHref: team ? withParams("/team", { manager: e.id }) : "",
    };
  });

  // ---- tiles: always over everyone below ----
  const agg = engine.aggregate(everyone);
  const waitingForMe = everyone.reduce((n, e) => n + (v.reportIds.has(e.id) ? engine.personProfile(e).cells.filter((c) => c.status === "submitted").length : 0), 0);
  const notStarted = everyone.filter((e) => !engine.personProfile(e).cells.some((c) => c.selfLevel != null)).length;
  const needsAll = unitId ? engine.shortNeeds(unitId).map((c) => needView(engine, c, levelName)) : [];
  const short = needsAll.filter((n) => n.count < n.headcount);
  const single = needsAll.filter((n) => n.count >= n.headcount && n.spof);

  // ---- skills needed ----
  const covBySkill = new Map((unitId ? engine.demands(unitId) : []).map((d) => [d.skillId, engine.coverage(d)]));
  const needs: NeedRow[] = reqs.map((r) => {
    const c = covBySkill.get(r.skillId);
    return {
      skillId: r.skillId, skill: engine.skillLabel(r.skillId) || "(retired skill)", minLevel: r.minLevel, levelName: levelName(r.minLevel),
      headcount: r.headcount, note: r.note, have: c?.count ?? 0,
      state: !c ? "–" : c.critical ? "Nobody" : c.shortfall ? `Short ${c.shortfall}` : c.spof ? "One holder" : "Covered",
    };
  }).sort((a, b) => a.skill.localeCompare(b.skill));
  const implied = (unitId ? engine.demands(unitId) : []).filter((d) => !d.explicit).map((d) => {
    const c = engine.coverage(d);
    return { skill: engine.skillLabel(d.skillId), href: `/skills/${d.skillId}?unit=${unitId}`, level: d.level, have: c.count, state: c.critical ? "Nobody" : c.spof ? "One holder" : "Covered" };
  });
  const skills = [...engine.skillById.values()].filter((s) => engine.isRateable(s.id))
    .map((s) => ({ id: s.id, name: engine.skillLabel(s.id), category: engine.categoryById.get(s.categoryId)?.name ?? "" }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const parents = [...engine.skillById.values()].filter((s) => !s.parentId && s.status === "active")
    .map((s) => ({ id: s.id, name: s.name, categoryId: s.categoryId }));

  // ---- gaps and training ----
  const gapRows = gapsAll.map((n) => {
    const e = engine.empById.get(n.employeeId)!;
    return {
      person: e.name, personHref: `/people/${e.id}`, skill: engine.skillLabel(n.skillId),
      category: engine.categoryById.get(engine.skillById.get(n.skillId)!.categoryId)?.name ?? "",
      level: n.level, target: n.target, gap: n.category, mandatory: n.mandatory ? "Required" : "Optional", interest: n.interest ? "Yes" : "",
    };
  });
  const planRows = plans.filter((p) => people.some((e) => e.id === p.employeeId)).map((p) => ({
    person: engine.empById.get(p.employeeId)?.name ?? "", personHref: `/people/${p.employeeId}`, skill: engine.skillLabel(p.skillId),
    title: p.title, level: engine.levelOf(p.employeeId, p.skillId).level, target: p.targetLevel, due: p.dueOn, status: p.status.replace("_", " "),
  }));

  // teams this viewer may switch to
  const pick: UnitOption[] = leads.length > 1
    ? leads.sort((a, b) => engine.ancestors(a.unitId ?? "").length - engine.ancestors(b.unitId ?? "").length || a.name.localeCompare(b.name))
      .map((e) => ({ id: e.id, name: `${e.name}${e.title ? ` · ${e.title}` : ""}`, depth: 0, kind: "team" }))
    : [];

  return (
    <>
      <PageHeader title={mine ? "My team" : `${manager.name}'s team`}
        description={[manager.title, unit?.name, `${direct.length} direct report${direct.length === 1 ? "" : "s"}`, `${everyone.length} in all`].filter(Boolean).join(" · ")}
        crumbs={mine ? undefined : [{ label: "My team", href: own ? "/team" : undefined }, { label: manager.name }]}
        actions={
          <div className="flex flex-wrap gap-2">
            {waitingForMe > 0 && <Button asChild size="sm"><Link href="/validate"><CheckCheck />Validate {waitingForMe}</Link></Button>}
            {unitId && <Button asChild size="sm" variant="outline"><Link href={withParams("/", { unit: unitId, view: "people" })}><LayoutGrid />Heatmap</Link></Button>}
            <Button asChild size="sm" variant="outline"><Link href={`/org?root=${manager.id}`}><Network />Org chart</Link></Button>
          </div>
        } />
      {pick.length > 1 && <FilterBar><UnitPicker units={pick} value={manager.id} paramName="manager" /></FilterBar>}
      <KpiTiles items={[
        { label: "People", value: String(everyone.length), hint: direct.length === everyone.length ? "all report directly" : `${direct.length} direct, ${everyone.length - direct.length} below them` },
        { label: "On target", value: agg.pct == null ? "–" : `${agg.pct}%`, hint: `${agg.met} of ${agg.required} required skill ratings`, tone: agg.pct == null ? "default" : agg.pct >= engine.settings.greenAt ? "good" : agg.pct >= engine.settings.amberAt ? "warn" : "bad" },
        { label: "Assessed", value: agg.required ? `${Math.round((agg.assessed / agg.required) * 100)}%` : "–", hint: `${notStarted} not started a self-assessment`, tone: notStarted ? "warn" : "default" },
        { label: "Waiting for you", value: String(waitingForMe), hint: "ratings to validate", tone: waitingForMe ? "warn" : "default", href: waitingForMe ? "/validate" : undefined },
        { label: "Team needs short", value: unitId ? String(short.length) : "–", hint: unitId ? `${single.length} rest on one person` : "no team unit", tone: short.length ? "bad" : "default", href: link({ tab: "gaps" }) },
      ]} />
      <Tabs defaultValue={tab}>
        <TabsList className="mb-3 flex-wrap">
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="skills">Skills needed</TabsTrigger>
          <TabsTrigger value="gaps">Gaps</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
        </TabsList>

        <TabsContent value="people">
          <Section title={scopeAll ? `Everyone below (${people.length})` : `Direct reports (${people.length})`}
            description="Who reports here, how far each self-assessment has got, what waits for your validation and where each person stands."
            actions={direct.length > 0 && direct.length !== everyone.length ? (
              <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label="Who to list">
                <Link href={link({ scope: null, tab: "people" })} aria-current={!scopeAll ? "page" : undefined}
                  className={!scopeAll ? "rounded bg-muted px-2 py-1 font-medium" : "rounded px-2 py-1 text-muted-foreground hover:text-foreground"}>Direct ({direct.length})</Link>
                <Link href={link({ scope: "all", tab: "people" })} aria-current={scopeAll ? "page" : undefined}
                  className={scopeAll ? "rounded bg-muted px-2 py-1 font-medium" : "rounded px-2 py-1 text-muted-foreground hover:text-foreground"}>Everyone ({everyone.length})</Link>
              </div>
            ) : undefined}>
            <DataTable csvName="my-team" rows={rows} pageSize={20} initialSort={{ key: "name" }} searchPlaceholder="Find a person…"
              columns={[
                { key: "name", header: "Name", kind: "link", hrefKey: "href" },
                { key: "title", header: "Designation", kind: "muted" },
                { key: "role", header: "Role", kind: "muted", facet: true },
                { key: "status", header: "Self-assessment", kind: "badge", facet: true },
                { key: "selfAssessed", header: "Rated", kind: "muted", align: "right", sortable: false },
                { key: "toValidate", header: "To validate", kind: "number", align: "right" },
                { key: "onTarget", header: "On target", kind: "pct", align: "right" },
                { key: "gaps", header: "Below target", kind: "number", align: "right" },
                { key: "training", header: "Training", kind: "number", align: "right" },
                { key: "last", header: "Last rating", kind: "date" },
                { key: "team", header: "Their team", kind: "link", hrefKey: "teamHref", sortable: false },
              ]} />
          </Section>
        </TabsContent>

        <TabsContent value="skills">
          {unitId ? (
            <div className="grid gap-5 xl:grid-cols-3">
              <Section className="xl:col-span-2" title="Skills the team needs"
                description="“We need N people at level L in this skill”, on top of what the roles expect. Coverage counts validated ratings of everyone in the team.">
                <TeamNeeds unitId={unitId} needs={needs} skills={skills} categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                  parents={parents} levels={levels.map((l) => ({ level: l.level, name: l.name }))} />
              </Section>
              <Section title="Already expected by roles" description="Mandatory skills two or more people's roles need: one person at the role baseline">
                {implied.length ? (
                  <ul className="grid gap-1.5 text-sm">
                    {implied.map((i) => (
                      <li key={i.href} className="flex items-center justify-between gap-2">
                        <Link href={i.href} className="truncate hover:underline">{i.skill}</Link>
                        <span className="shrink-0 text-xs text-muted-foreground tabular">{i.level}+ · {i.have}{i.state === "Covered" ? "" : ` · ${i.state}`}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">Nothing: no two people here share a mandatory role skill.</p>}
              </Section>
            </div>
          ) : (
            <Empty>Team needs are kept per team, and {mine ? "you do" : `${manager.name} does`} not lead a team unit yet. Turn on “Build teams from the manager chain” in Admin › ServiceNow, or set the team's manager in Admin › Organisation.</Empty>
          )}
        </TabsContent>

        <TabsContent value="gaps" className="grid gap-5">
          {unitId && (
            <div className="grid gap-5 lg:grid-cols-2">
              <Section title="Team needs short" description="Fewer people at the level than the team needs. Worst first.">
                <NeedList items={short} empty="No team need is short." />
              </Section>
              <Section title="Resting on one person" description="Enough people on paper, but only one holds it.">
                <NeedList items={single} empty="No team need rests on one person." />
              </Section>
            </div>
          )}
          <Section title="People below their target" description="Each person below their own target, or with a required skill not yet assessed.">
            <DataTable csvName="team-gaps" rows={gapRows} searchPlaceholder="Find a person or skill…" emptyText="Everyone is at or above target."
              columns={[
                { key: "person", header: "Person", kind: "link", hrefKey: "personHref" },
                { key: "skill", header: "Skill" },
                { key: "category", header: "Category", kind: "muted", facet: true },
                { key: "level", header: "Level", kind: "level", align: "center" },
                { key: "target", header: "Target", kind: "level", align: "center" },
                { key: "gap", header: "Gap", kind: "gap", facet: true },
                { key: "mandatory", header: "", kind: "muted", facet: true },
                { key: "interest", header: "Wants it", kind: "muted", facet: true },
              ]} />
          </Section>
        </TabsContent>

        <TabsContent value="training">
          <Section title="Training plans" description="Booked from a person's profile, against a gap. Open a person to add or update one.">
            <DataTable csvName="team-training" rows={planRows} emptyText="No training booked for this team."
              columns={[
                { key: "person", header: "Person", kind: "link", hrefKey: "personHref" },
                { key: "skill", header: "Skill" },
                { key: "title", header: "Plan", kind: "muted" },
                { key: "level", header: "Now", kind: "level", align: "center" },
                { key: "target", header: "Aim", kind: "level", align: "center" },
                { key: "due", header: "Due", kind: "date" },
                { key: "status", header: "Status", kind: "badge", facet: true },
              ]} />
          </Section>
        </TabsContent>
      </Tabs>
    </>
  );
}
