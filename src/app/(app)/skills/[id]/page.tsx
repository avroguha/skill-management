import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker } from "@/components/filter-bar";
import { KpiTiles, Section } from "@/components/kpi";
import { DistributionChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { requireViewer, getEngine, scopeUnit, param, type SearchParams } from "@/lib/server";
import { unitOptions, withParams } from "@/lib/views";

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
    <Section title="About this skill">
      <p className="text-sm">{skill.description || <span className="text-muted-foreground">No description yet.</span>}</p>
      {subs.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Rated through its sub-skills: {subs.map((s, i) => (<span key={s.id}>{i ? ", " : ""}<a className="text-foreground hover:underline" href={`/skills/${s.id}`}>{s.name}</a></span>))}.
        </p>
      )}
    </Section>
  );

  if (!v.canSeeOrg) {
    const mine = v.employee ? engine.cell(v.employee, id) : null;
    return (<>{header}<div className="grid gap-5 lg:grid-cols-2">{about}
      {mine && <Section title="You"><p className="text-sm">Target {mine.target ?? "–"} · validated {mine.validatedLevel ?? "–"} · self {mine.selfLevel ?? "–"}</p></Section>}
    </div></>);
  }

  const unitId = scopeUnit(v, param(sp, "unit"));
  if (!unitId || !engine.isRateable(id)) return (<>{header}{about}</>);
  const stats = engine.skillStats(id, unitId);
  const holders3 = stats.distribution.slice(3).reduce((a, b) => a + b, 0);
  const required = stats.people.filter((c) => c.target != null);
  const met = required.filter((c) => c.met).length;
  const people = stats.people
    .filter((c) => v.allUnits || v.employeeIds.has(c.employeeId))
    .map((c) => {
      const e = engine.empById.get(c.employeeId)!;
      return {
        name: e.name, href: `/people/${e.id}`, team: engine.unitById.get(e.unitId ?? "")?.name ?? "",
        level: c.level, self: c.selfLevel, target: c.target, gap: c.target != null ? c.category : null,
        assessed: c.at?.toISOString() ?? null, interest: c.interest ? "Yes" : "",
      };
    });
  const coverage = stats.coverage.map((c) => ({
    team: engine.unitById.get(c.unitId)?.name ?? "", href: withParams("/", { unit: c.unitId, view: "people" }),
    level: c.level, have: c.count, need: c.headcount, kind: c.explicit ? "Team requirement" : "From roles",
    state: c.critical ? "Nobody" : c.shortfall ? `Short ${c.shortfall}` : c.spof ? "One holder" : "Covered",
  }));

  return (
    <>
      {header}
      <FilterBar><UnitPicker units={unitOptions(engine, v)} value={unitId} /></FilterBar>
      <KpiTiles items={[
        { label: "Required by", value: String(required.length), hint: "people in this unit" },
        { label: "On target", value: required.length ? `${Math.round((met / required.length) * 100)}%` : "–", hint: `${met} of ${required.length}` },
        { label: "Proficient or above", value: String(holders3), hint: "validated" },
        { label: "Not assessed", value: String(stats.unassessed), hint: "of those who need it" },
        { label: "Teams short", value: String(stats.coverage.filter((c) => c.shortfall > 0).length), hint: `${stats.coverage.filter((c) => c.spof).length} rely on one person`, tone: stats.coverage.some((c) => c.shortfall > 0) ? "bad" : "default" },
      ]} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Distribution" description="Validated levels of people who need or hold it">
          <DistributionChart data={levels.map((l) => ({ level: `${l.level}`, people: stats.distribution[l.level] ?? 0 })).concat([{ level: "?", people: stats.unassessed }])} />
          <p className="mt-2 text-xs text-muted-foreground">0–5 by level; “?” = needed but not assessed.</p>
        </Section>
        <Section className="lg:col-span-2" title="Team coverage" description="Each team that needs it: people at the level against the number needed">
          <DataTable rows={coverage} pageSize={10} emptyText="No team in this unit depends on this skill."
            columns={[
              { key: "team", header: "Team", kind: "link", hrefKey: "href" },
              { key: "level", header: "Level", kind: "level", align: "center" },
              { key: "have", header: "Have", kind: "number", align: "right" },
              { key: "need", header: "Need", kind: "number", align: "right" },
              { key: "state", header: "State", kind: "badge", facet: true },
              { key: "kind", header: "Source", kind: "muted" },
            ]} />
        </Section>
        <Section className="lg:col-span-3" title="People">
          <DataTable csvName="skill-people" rows={people} initialSort={{ key: "level", desc: true }}
            columns={[
              { key: "name", header: "Name", kind: "link", hrefKey: "href" },
              { key: "team", header: "Team", facet: true },
              { key: "level", header: "Validated", kind: "level", align: "center" },
              { key: "self", header: "Self", kind: "level", align: "center" },
              { key: "target", header: "Target", kind: "level", align: "center" },
              { key: "gap", header: "Gap", kind: "gap", facet: true },
              { key: "assessed", header: "Assessed", kind: "date" },
              { key: "interest", header: "Wants more", kind: "muted", facet: true },
            ]} />
        </Section>
        {about}
      </div>
    </>
  );
}
