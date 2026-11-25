import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker } from "@/components/filter-bar";
import { KpiTiles, Section } from "@/components/kpi";
import { DistributionChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { requireViewer, getEngine, param, type SearchParams } from "@/lib/server";
import { photoUrls } from "@/lib/photos";
import { maySeeScope } from "@/lib/access";
import { scopeOptions, withParams } from "@/lib/views";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const engine = await getEngine();
  return { title: engine.skillLabel(id) || "Skill" };
}

export default async function SkillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const v = await requireViewer();
  const engine = await getEngine();
  const photos = await photoUrls();
  const db = await getDb();
  const [skill] = await db.select().from(schema.skill).where(eq(schema.skill.id, id));
  if (!skill) notFound();
  const levels = await db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level));
  const parent = skill.parentId ? engine.skillById.get(skill.parentId) : undefined;
  const subs = [...engine.skillById.values()].filter((s) => s.parentId === id && s.status === "active");
  const category = engine.categoryById.get(skill.categoryId);
  const header = (
    <PageHeader
      title={engine.skillLabel(id) || skill.name}
      description={[category?.name, skill.status !== "active" ? skill.status : null, skill.aliases.length ? `also ${skill.aliases.join(", ")}` : null].filter(Boolean).join(" · ")}
      crumbs={[{ label: "Skills", href: "/skills" }, ...(parent ? [{ label: parent.name, href: `/skills/${parent.id}` }] : []), { label: skill.name }]}
    />
  );
  const about = (
    <Section title="About this skill" info="What the catalogue says about it. Administrators edit it in Settings › Skills.">
      <p className="text-sm">{skill.description || <span className="text-muted-foreground">No description yet.</span>}</p>
      {subs.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Rated through its sub-skills: {subs.map((s, i) => (<span key={s.id}>{i ? ", " : ""}<a className="text-foreground hover:underline" href={`/skills/${s.id}`}>{s.name}</a></span>))}.
        </p>
      )}
    </Section>
  );

  if (!v.canSeeTeams) {
    const mine = v.employee ? engine.cell(v.employee, id) : null;
    return (<>{header}<div className="grid gap-5 lg:grid-cols-2">{about}
      {mine && <Section title="You" info="Your role's target for it, the level your manager confirmed, and your own."><p className="text-sm">Target {mine.target ?? "–"} · confirmed {mine.validatedLevel ?? "–"} · yours {mine.selfLevel ?? "–"}</p></Section>}
    </div></>);
  }

  const requested = param(sp, "scope");
  const scope = requested && maySeeScope(v, requested) ? requested : v.homeScope;
  if (!scope || !engine.isRateable(id)) return (<>{header}{about}</>);
  const stats = engine.skillStats(id, scope);
  const holders3 = stats.distribution.slice(3).reduce((a, b) => a + b, 0);
  const required = stats.people.filter((c) => c.target != null);
  const met = required.filter((c) => c.met).length;
  const people = stats.people
    .filter((c) => v.allPeople || v.employeeIds.has(c.employeeId))
    .map((c) => {
      const e = engine.empById.get(c.employeeId)!;
      return {
        name: e.name, href: `/people/${e.id}`, photo: photos.get(e.id) ?? null, team: e.managerId ? engine.teamLabel(e.managerId) : "",
        level: c.level, self: c.selfLevel, target: c.target, gap: c.target != null ? c.category : null,
        assessed: c.at?.toISOString() ?? null, interest: c.interest ? "Yes" : "",
      };
    });
  const coverage = stats.coverage.map((c) => ({
    team: engine.teamLabel(c.managerId), href: withParams("/team", { scope: c.managerId, tab: "needs" }),
    level: c.level, have: c.count, need: c.headcount, kind: c.explicit ? "Set by the manager" : "Implied by roles",
    state: c.critical ? "Nobody" : c.shortfall ? `Short ${c.shortfall}` : c.spof ? "One holder" : "Covered",
  }));

  return (
    <>
      {header}
      <FilterBar><UnitPicker units={scopeOptions(engine, v).map((o) => ({ id: o.id, name: o.name, depth: o.depth, kind: `${o.people}` }))} value={scope} paramName="scope" /></FilterBar>
      <KpiTiles items={[
        { label: "Role asks for it", value: String(required.length), hint: "people here", info: "People here whose role (and grade) asks for this skill." },
        { label: "On target", value: required.length ? `${Math.round((met / required.length) * 100)}%` : "–", hint: `${met} of ${required.length}`, info: "Of those, the share whose confirmed level reaches their target." },
        { label: "3 or above", value: String(holders3), hint: "confirmed", info: "People here confirmed at Proficient (3) or above, whether their role asks for it or not." },
        { label: "Not rated", value: String(stats.unassessed), hint: "of those whose role asks", info: "People whose role asks for it who have no confirmed level yet." },
        { label: "Teams short", value: String(stats.coverage.filter((c) => c.shortfall > 0).length), hint: `${stats.coverage.filter((c) => c.spof).length} rest on one person`, tone: stats.coverage.some((c) => c.shortfall > 0) ? "bad" : "default", info: "Teams here that need this skill and have fewer people at the level than they need." },
      ]} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Distribution" info="How many people here are at each confirmed level, counting those who hold it or whose role asks for it. “?” = their role asks for it, not rated yet.">
          <DistributionChart data={levels.map((l) => ({ level: `${l.level}`, people: stats.distribution[l.level] ?? 0 })).concat([{ level: "?", people: stats.unassessed }])} />
          <p className="mt-2 text-xs text-muted-foreground">0–5 by level; “?” = needed but not assessed.</p>
        </Section>
        <Section className="lg:col-span-2" title="Team coverage" info="Each team here that needs this skill: how many people it has at the level, against how many it needs.">
          <DataTable rows={coverage} pageSize={10} emptyText="No team here depends on this skill."
            columns={[
              { key: "team", header: "Team", kind: "link", hrefKey: "href" },
              { key: "level", header: "Level", kind: "level", align: "center" },
              { key: "have", header: "Have", kind: "number", align: "right" },
              { key: "need", header: "Need", kind: "number", align: "right" },
              { key: "state", header: "State", kind: "badge", facet: true },
              { key: "kind", header: "Source", kind: "muted" },
            ]} />
        </Section>
        <Section className="lg:col-span-3" title="People" info="Everyone here who holds this skill or whose role asks for it.">
          <DataTable csvName="skill-people" rows={people} initialSort={{ key: "level", desc: true }}
            columns={[
              { key: "name", header: "Name", kind: "person", hrefKey: "href", photoKey: "photo" },
              { key: "team", header: "Team", facet: true },
              { key: "level", header: "Confirmed", kind: "level", align: "center" },
              { key: "self", header: "Self", kind: "level", align: "center" },
              { key: "target", header: "Target", kind: "level", align: "center" },
              { key: "gap", header: "Gap", kind: "gap", facet: true },
              { key: "assessed", header: "Confirmed on", kind: "date" },
              { key: "interest", header: "Wants to grow", kind: "muted", facet: true },
            ]} />
        </Section>
        {about}
      </div>
    </>
  );
}
