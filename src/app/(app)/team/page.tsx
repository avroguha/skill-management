// My team: a manager says what their team needs (on top of what the roles imply),
// sees how well it is covered, and adds a skill to the catalogue when it is missing.
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker } from "@/components/filter-bar";
import { Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { Empty } from "@/components/heatmap";
import { requireViewer, getEngine, canSeeUnit, param, type SearchParams } from "@/lib/server";
import { unitOptions, withParams } from "@/lib/views";
import { TeamNeeds, type NeedRow } from "./team-needs";

export const metadata = { title: "My team" };

export default async function TeamPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireViewer();
  if (!(v.isAdmin || v.role === "manager")) redirect("/");
  const engine = await getEngine();
  const options = unitOptions(engine, v);
  if (!options.length) return (<><PageHeader title="My team" /><Empty>You do not manage a unit yet. An administrator sets unit managers in Admin › Organisation.</Empty></>);
  const requested = param(sp, "unit");
  const managed = v.employee ? engine.managedUnitIds(v.employee.id) : [];
  const unitId = requested && canSeeUnit(v, requested) ? requested : managed[0] ?? options[0].id;
  const unit = engine.unitById.get(unitId)!;

  const db = await getDb();
  const [levels, categories, reqs] = await Promise.all([
    db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level)),
    db.select().from(schema.skillCategory).orderBy(asc(schema.skillCategory.sort)),
    db.select().from(schema.unitRequirement).where(eq(schema.unitRequirement.unitId, unitId)),
  ]);
  const levelName = (n: number) => levels.find((l) => l.level === n)?.name ?? String(n);
  const covByskill = new Map(engine.demands(unitId).map((d) => [d.skillId, engine.coverage(d)]));
  const needs: NeedRow[] = reqs.map((r) => {
    const c = covByskill.get(r.skillId);
    return {
      skillId: r.skillId, skill: engine.skillLabel(r.skillId) || "(retired skill)", minLevel: r.minLevel, levelName: levelName(r.minLevel),
      headcount: r.headcount, note: r.note, have: c?.count ?? 0,
      state: !c ? "–" : c.critical ? "Nobody" : c.shortfall ? `Short ${c.shortfall}` : c.spof ? "One holder" : "Covered",
    };
  }).sort((a, b) => a.skill.localeCompare(b.skill));
  const implied = engine.demands(unitId).filter((d) => !d.explicit).map((d) => {
    const c = engine.coverage(d);
    return {
      skill: engine.skillLabel(d.skillId), href: `/skills/${d.skillId}?unit=${unitId}`, level: d.level, have: c.count,
      state: c.critical ? "Nobody" : c.spof ? "One holder" : "Covered",
    };
  });
  const members = engine.membersOf(unitId).map((e) => ({
    name: e.name, href: `/people/${e.id}`, title: e.title, onTarget: engine.aggregate([e]).pct,
    pending: engine.personProfile(e).cells.filter((c) => c.status === "submitted").length || null,
  }));
  const skills = [...engine.skillById.values()].filter((s) => engine.isRateable(s.id))
    .map((s) => ({ id: s.id, name: engine.skillLabel(s.id), category: engine.categoryById.get(s.categoryId)?.name ?? "" }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const parents = [...engine.skillById.values()].filter((s) => !s.parentId && s.status === "active")
    .map((s) => ({ id: s.id, name: s.name, categoryId: s.categoryId }));

  return (
    <>
      <PageHeader title={unit.name} description="What this team needs, beyond what its roles already expect."
        crumbs={[{ label: "My team" }, { label: unit.name }]} />
      {options.length > 1 && <FilterBar><UnitPicker units={options} value={unitId} /></FilterBar>}
      <div className="grid gap-5 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Team needs"
          description="“We need N people at level L in this skill.” Coverage counts validated ratings of everyone in the team.">
          <TeamNeeds unitId={unitId} needs={needs} skills={skills} categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            parents={parents} levels={levels.map((l) => ({ level: l.level, name: l.name }))} />
        </Section>
        <Section title="Already expected by roles" description="Mandatory skills two or more people's roles need: one person at the role baseline">
          {implied.length ? (
            <ul className="grid gap-1.5 text-sm">
              {implied.map((i) => (
                <li key={i.href} className="flex items-center justify-between gap-2">
                  <a href={i.href} className="truncate hover:underline">{i.skill}</a>
                  <span className="shrink-0 text-xs text-muted-foreground tabular">{i.level}+ · {i.have} {i.state === "Covered" ? "" : `· ${i.state}`}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nothing: no two people here share a mandatory role skill.</p>}
        </Section>
        <Section className="xl:col-span-3" title={`People (${members.length})`}
          actions={<a className="text-xs text-muted-foreground hover:text-foreground" href={withParams("/", { unit: unitId, view: "people" })}>Heatmap →</a>}>
          <DataTable rows={members} pageSize={15} initialSort={{ key: "name" }}
            columns={[
              { key: "name", header: "Name", kind: "link", hrefKey: "href" },
              { key: "title", header: "Title", kind: "muted" },
              { key: "onTarget", header: "On target", kind: "pct", align: "right" },
              { key: "pending", header: "To validate", kind: "number", align: "right" },
            ]} />
        </Section>
      </div>
    </>
  );
}
