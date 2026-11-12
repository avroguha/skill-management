// People: the directory for the viewer's scope, and the people finder
// ("who has Kubernetes at Proficient or above?").
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker, SelectFilter, ClearFilters, SearchParamInput } from "@/components/filter-bar";
import { Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { Empty } from "@/components/heatmap";
import { requireOrgViewer, getEngine, scopeUnit, param, type SearchParams } from "@/lib/server";
import { unitOptions } from "@/lib/views";

export const metadata = { title: "People" };

/** Rows sent to the browser at most; the search and filters narrow the rest on the server. */
const MAX_ROWS = 500;

export default async function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireOrgViewer();
  const engine = await getEngine();
  const unitId = scopeUnit(v, param(sp, "unit"));
  if (!unitId) return (<><PageHeader title="People" /><Empty>No organisation units yet.</Empty></>);
  const roleId = param(sp, "role") ?? null;
  const skillId = param(sp, "skill") ?? null;
  const min = Math.max(0, Math.min(5, Number(param(sp, "min") ?? 3)));
  const q = (param(sp, "q") ?? "").trim().toLowerCase();

  const db = await getDb();
  const [roles, grades, levelRows] = await Promise.all([
    db.select().from(schema.jobRole).orderBy(asc(schema.jobRole.name)),
    db.select().from(schema.grade),
    db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level)),
  ]);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const gradeName = new Map(grades.map((g) => [g.id, g.name]));
  const unitName = (id: string | null) => (id ? engine.unitById.get(id)?.name ?? "" : "");

  const visible = engine.membersOf(unitId).filter((e) => (v.allUnits || v.employeeIds.has(e.id)) && (!roleId || e.roleId === roleId)
    && (!q || `${e.name} ${e.title} ${e.email}`.toLowerCase().includes(q)));
  const skills = [...engine.skillById.values()].filter((s) => engine.isRateable(s.id))
    .sort((a, b) => engine.skillLabel(a.id).localeCompare(engine.skillLabel(b.id)))
    .map((s) => ({ id: s.id, name: `${engine.skillLabel(s.id)} (${engine.categoryById.get(s.categoryId)?.name ?? ""})` }));

  const toolbar = (
    <FilterBar>
      <SearchParamInput value={param(sp, "q") ?? null} placeholder="Find anyone by name or e-mail…" />
      <UnitPicker units={unitOptions(engine, v)} value={unitId} />
      <SelectFilter name="role" label="Role" allLabel="All roles" value={roleId} options={roles.map((r) => ({ id: r.id, name: r.name }))} />
      <SelectFilter name="skill" label="Has skill" allLabel="Any skill" value={skillId} options={skills} />
      {skillId && (
        <SelectFilter name="min" label="At least" allLabel="At least Proficient (3)" value={param(sp, "min") ?? null}
          options={levelRows.filter((l) => l.level > 0).map((l) => ({ id: String(l.level), name: `At least ${l.name} (${l.level})` }))} />
      )}
      <ClearFilters keys={["role", "skill", "min", "q"]} />
    </FilterBar>
  );

  if (skillId && engine.skillById.has(skillId)) {
    const ids = new Set(visible.map((e) => e.id));
    const all = engine.find(unitId, skillId, min).filter(({ e }) => ids.has(e.id));
    const found = all.slice(0, MAX_ROWS).map(({ e, c }) => ({
      name: e.name, href: `/people/${e.id}`, title: e.title, team: unitName(e.unitId), role: roleName.get(e.roleId ?? "") ?? "",
      level: c.level, target: c.target, assessed: c.at?.toISOString() ?? null, stale: c.stale ? "Stale" : "", interest: c.interest ? "Yes" : "",
      location: engine.empById.get(e.id)?.location ?? "",
    }));
    return (
      <>
        <PageHeader title="People finder" description={`Who has ${engine.skillLabel(skillId)} at level ${min} or above, validated by a manager.`} />
        {toolbar}
        <Section title={`${all.length.toLocaleString("en-GB")} ${all.length === 1 ? "person" : "people"}`}
          description={all.length > found.length ? `Showing the highest ${found.length} levels first. Choose a unit or role to narrow it down.` : undefined}>
          <DataTable csvName="people-finder" rows={found} initialSort={{ key: "level", desc: true }}
            emptyText="Nobody in this scope has a validated rating at that level."
            columns={[
              { key: "name", header: "Name", kind: "link", hrefKey: "href" },
              { key: "title", header: "Title", kind: "muted" },
              { key: "team", header: "Team", facet: true },
              { key: "location", header: "Location", kind: "muted", facet: true },
              { key: "level", header: "Level", kind: "level", align: "center" },
              { key: "target", header: "Their target", kind: "level", align: "center" },
              { key: "assessed", header: "Validated", kind: "date" },
              { key: "stale", header: "", kind: "muted", sortable: false },
              { key: "interest", header: "Wants more", kind: "muted", facet: true },
            ]} />
        </Section>
      </>
    );
  }

  // first MAX_ROWS by name; counts come straight from the ratings (no profile per person)
  const shown = [...visible].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_ROWS);
  const rows = shown.map((e) => {
    const agg = engine.aggregate([e]);
    return {
      name: e.name, href: `/people/${e.id}`, title: e.title, team: unitName(e.unitId),
      role: roleName.get(e.roleId ?? "") ?? "", grade: gradeName.get(e.gradeId ?? "") ?? "", location: e.location ?? "",
      onTarget: agg.pct, assessed: agg.required ? Math.round((agg.assessed / agg.required) * 100) : null,
      pending: engine.ratingsOf(e.id).filter((r) => r.status === "submitted").length || null,
      stale: agg.stale || null,
    };
  });

  return (
    <>
      <PageHeader title="People" description={`${visible.length.toLocaleString("en-GB")} people in ${engine.unitById.get(unitId)?.name}`} />
      {toolbar}
      {visible.length > rows.length && (
        <p className="mb-3 text-sm text-muted-foreground">Showing the first {rows.length.toLocaleString("en-GB")} of {visible.length.toLocaleString("en-GB")} by name. Search, or choose a unit or role, to narrow it down.</p>
      )}
      <DataTable csvName="people" rows={rows} initialSort={{ key: "name" }} searchPlaceholder="Find a person…"
        columns={[
          { key: "name", header: "Name", kind: "link", hrefKey: "href" },
          { key: "title", header: "Title", kind: "muted" },
          { key: "team", header: "Team", facet: true },
          { key: "role", header: "Role", facet: true },
          { key: "grade", header: "Grade", kind: "muted", facet: true },
          { key: "location", header: "Location", kind: "muted", facet: true },
          { key: "onTarget", header: "On target", kind: "pct", align: "right" },
          { key: "assessed", header: "Assessed", kind: "pct", align: "right" },
          { key: "pending", header: "To validate", kind: "number", align: "right" },
          { key: "stale", header: "Stale", kind: "number", align: "right" },
        ]} />
    </>
  );
}
