// Skills: the catalogue. For managers and above, each skill with how much of the
// requirement for it is met in the chosen unit. Employees see the catalogue and the
// level definitions only - never other people's ratings.
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker } from "@/components/filter-bar";
import { Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { requireViewer, getEngine, param, type SearchParams } from "@/lib/server";
import { maySeeScope } from "@/lib/access";
import { scopeOptions } from "@/lib/views";
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
    <Section title="Proficiency levels" info="The same 0-5 scale for every skill. Rate what you can do on your own today, not what you did once. Administrators can change the wording in Settings › Levels & rules.">
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

  if (!v.canSeeTeams) {
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

  const requested = param(sp, "scope");
  const scope = requested && maySeeScope(v, requested) ? requested : v.homeScope!;
  const t = engine.talent(scope);
  const covBySkill = new Map<string, { short: number; spof: number }>();
  for (const x of engine.coverageIn(scope)) {
    const c = covBySkill.get(x.skillId) ?? { short: 0, spof: 0 };
    if (x.shortfall > 0) c.short += 1;
    if (x.spof) c.spof += 1;
    covBySkill.set(x.skillId, c);
  }
  const rows = rateable.map((s) => {
    const x = t.skills.get(s.id);
    const c = covBySkill.get(s.id);
    return {
      skill: engine.skillLabel(s.id), href: `/skills/${s.id}${scope !== v.homeScope ? `?scope=${scope}` : ""}`, category: catName(s.categoryId),
      required: x?.needed || null, onTarget: x?.needed ? Math.round((x.onTarget / x.needed) * 100) : null, holders: x?.holders || null,
      proficient: x?.proficient || null, interested: x?.interested || null, short: c?.short || null, spof: c?.spof || null,
    };
  });
  return (
    <>
      <PageHeader title="Skills" description="Every skill in the catalogue: who needs it, who has it, where it is thin." />
      <FilterBar>
        <UnitPicker units={scopeOptions(engine, v).map((o) => ({ id: o.id, name: o.name, depth: o.depth, kind: `${o.people}` }))} value={scope} paramName="scope" />
      </FilterBar>
      <div className="grid gap-5">
        <DataTable csvName="skills" rows={rows} initialSort={{ key: "required", desc: true }} searchKeys={["skill", "category"]} searchPlaceholder="Find a skill…"
          columns={[
            { key: "skill", header: "Skill", kind: "link", hrefKey: "href" },
            { key: "category", header: "Category", facet: true },
            { key: "required", header: "Role asks", kind: "number", align: "right", info: "People here whose role asks for this skill." },
            { key: "onTarget", header: "On target", kind: "pct", align: "right", info: "Of those, the share at or above their target (confirmed levels)." },
            { key: "holders", header: "Have it", kind: "number", align: "right", info: "People here with a confirmed level of 1 or more." },
            { key: "proficient", header: "3+", kind: "number", align: "right", info: "People here confirmed at Proficient (3) or above." },
            { key: "interested", header: "Want to grow", kind: "number", align: "right", info: "People who starred it: they want to get better at it." },
            { key: "short", header: "Teams short", kind: "number", align: "right", info: "Teams here that need it and have fewer people at the level than needed." },
            { key: "spof", header: "One holder", kind: "number", align: "right", info: "Teams here where only one person covers the need." },
          ]} />
        {levelGuide}
      </div>
    </>
  );
}
