// Skills: the catalogue. For managers and above, each skill with how much of the
// requirement for it is met in the chosen unit. Employees see the catalogue and the
// level definitions only - never other people's ratings.
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker, ClearFilters } from "@/components/filter-bar";
import { Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { requireViewer, getEngine, scopeUnit, param, type SearchParams } from "@/lib/server";
import { unitOptions } from "@/lib/views";
import { LEVEL_CLASS } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata = { title: "Skills" };

export default async function SkillsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const engine = await getEngine();
  const db = await getDb();
  const levels = await db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level));
  const allSkills = await db.select().from(schema.skill);
  const rateable = allSkills.filter((s) => engine.isRateable(s.id));
  const catName = (id: string) => engine.categoryById.get(id)?.name ?? "";

  const levelGuide = (
    <Section title="Proficiency levels" description="The same scale for every skill. Rate what you can do on your own today.">
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {levels.map((l) => (
          <li key={l.level} className="flex gap-3">
            <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded text-sm font-semibold tabular", LEVEL_CLASS[l.level])}>{l.level}</span>
            <div><div className="text-sm font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{l.description}</div></div>
          </li>
        ))}
      </ol>
    </Section>
  );

  if (!v.canSeeOrg) {
    const rows = rateable.map((s) => ({
      skill: engine.skillLabel(s.id), href: `/skills/${s.id}`, category: catName(s.categoryId), description: s.description,
      aliases: s.aliases.join(", "),
    }));
    return (
      <>
        <PageHeader title="Skill catalogue" description="Every skill the organisation tracks." />
        <div className="grid gap-5">
          {levelGuide}
          <DataTable rows={rows} initialSort={{ key: "skill" }} searchKeys={["skill", "category", "aliases", "description"]} searchPlaceholder="Find a skill…"
            columns={[
              { key: "skill", header: "Skill", kind: "link", hrefKey: "href" },
              { key: "category", header: "Category", facet: true },
              { key: "aliases", header: "Also known as", kind: "muted" },
              { key: "description", header: "Description", kind: "muted" },
            ]} />
        </div>
      </>
    );
  }

  const unitId = scopeUnit(v, param(sp, "unit"));
  const summary = unitId ? engine.skillSummaryIn(unitId) : new Map();
  const covBySkill = new Map<string, { short: number; spof: number }>();
  for (const x of unitId ? engine.coverageIn(unitId) : []) {
    const c = covBySkill.get(x.skillId) ?? { short: 0, spof: 0 };
    if (x.shortfall > 0) c.short += 1;
    if (x.spof) c.spof += 1;
    covBySkill.set(x.skillId, c);
  }
  const rows = rateable.map((s) => {
    const sum = summary.get(s.id);
    const agg = sum?.agg ?? { required: 0, pct: null };
    const proficient = sum?.proficient ?? 0;
    const interested = sum?.interested ?? 0;
    const c = covBySkill.get(s.id);
    return {
      skill: engine.skillLabel(s.id), href: `/skills/${s.id}${unitId ? `?unit=${unitId}` : ""}`, category: catName(s.categoryId),
      required: agg.required || null, onTarget: agg.pct, proficient: proficient || null, interested: interested || null,
      short: c?.short || null, spof: c?.spof || null,
      status: s.status,
    };
  });
  return (
    <>
      <PageHeader title="Skills" description="Each skill across the chosen unit: who needs it, who has it, where it is thin." />
      <FilterBar>
        <UnitPicker units={unitOptions(engine, v)} value={unitId} />
        <ClearFilters keys={[]} />
      </FilterBar>
      <div className="grid gap-5">
        <DataTable csvName="skills" rows={rows} initialSort={{ key: "required", desc: true }} searchKeys={["skill", "category"]} searchPlaceholder="Find a skill…"
          columns={[
            { key: "skill", header: "Skill", kind: "link", hrefKey: "href" },
            { key: "category", header: "Category", facet: true },
            { key: "required", header: "Required by", kind: "number", align: "right" },
            { key: "onTarget", header: "On target", kind: "pct", align: "right" },
            { key: "proficient", header: "Proficient+", kind: "number", align: "right" },
            { key: "interested", header: "Want to grow", kind: "number", align: "right" },
            { key: "short", header: "Teams short", kind: "number", align: "right" },
            { key: "spof", header: "One holder", kind: "number", align: "right" },
          ]} />
        {levelGuide}
      </div>
    </>
  );
}
