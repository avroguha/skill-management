// People: everyone the viewer may see, and the finder ("who has Kubernetes at 3 or above?").
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker, SelectFilter, ClearFilters, SearchParamInput } from "@/components/filter-bar";
import { Section } from "@/components/kpi";
import { DataTable } from "@/components/data-table";
import { Empty } from "@/components/heatmap";
import { Info } from "@/components/info";
import { requireTeamViewer, getEngine, param, type SearchParams } from "@/lib/server";
import { photoUrls } from "@/lib/photos";
import { maySeeScope } from "@/lib/access";
import { getLevels } from "@/lib/levels";
import { scopeOptions } from "@/lib/views";

export const metadata = { title: "People" };

/** Rows sent to the browser at most; the search and filters narrow the rest on the server. */
const MAX_ROWS = 500;

export default async function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireTeamViewer();
  const engine = await getEngine();
  const photos = await photoUrls();
  const requested = param(sp, "scope");
  const scope = requested && maySeeScope(v, requested) ? requested : v.homeScope!;
  const roleId = param(sp, "role") ?? null;
  const skillId = param(sp, "skill") ?? null;
  const min = Math.max(1, Math.min(5, Number(param(sp, "min") ?? 3)));
  const q = (param(sp, "q") ?? "").trim().toLowerCase();
  const levels = await getLevels();

  const visible = engine.membersOf(scope).filter((e) => (v.allPeople || v.employeeIds.has(e.id)) && (!roleId || e.roleId === roleId)
    && (!q || `${e.name} ${e.title} ${e.email}`.toLowerCase().includes(q)));
  if (!engine.activeEmployees.length) return (<><PageHeader title="People" /><Empty>No people yet. They come from ServiceNow (Settings › ServiceNow) or a people CSV (Settings › Data).</Empty></>);
  const skills = [...engine.skillById.values()].filter((s) => engine.isRateable(s.id))
    .sort((a, b) => engine.skillLabel(a.id).localeCompare(engine.skillLabel(b.id)))
    .map((s) => ({ id: s.id, name: `${engine.skillLabel(s.id)} (${engine.categoryById.get(s.categoryId)?.name ?? ""})` }));
  const team = (managerId: string | null) => (managerId ? engine.teamLabel(managerId) : "");

  const toolbar = (
    <FilterBar>
      <SearchParamInput value={param(sp, "q") ?? null} placeholder="Find anyone by name or e-mail…" />
      <UnitPicker units={scopeOptions(engine, v).map((o) => ({ id: o.id, name: o.name, depth: o.depth, kind: `${o.people}` }))} value={scope} paramName="scope" />
      <SelectFilter name="role" label="Role" allLabel="All roles" value={roleId} options={engine.roles.map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name))} />
      <SelectFilter name="skill" label="Has skill" allLabel="Any skill" value={skillId} options={skills} />
      {skillId && (
        <SelectFilter name="min" label="At least" allLabel="At least 3 (Proficient)" value={param(sp, "min") ?? null}
          options={levels.filter((l) => l.level > 0).map((l) => ({ id: String(l.level), name: `At least ${l.level} (${l.name})` }))} />
      )}
      <ClearFilters keys={["role", "skill", "min", "q"]} />
      <Info label="About finding people">Pick a skill to find who has it at a level or above (confirmed by their manager), across the team you chose. Search finds a person by name or e-mail.</Info>
    </FilterBar>
  );

  if (skillId && engine.skillById.has(skillId)) {
    const ids = new Set(visible.map((e) => e.id));
    const all = engine.find(scope, skillId, min).filter(({ e }) => ids.has(e.id));
    const found = all.slice(0, MAX_ROWS).map(({ e, c }) => ({
      name: e.name, href: `/people/${e.id}`, photo: photos.get(e.id) ?? null, title: e.title, team: team(e.managerId), role: engine.roleById.get(e.roleId ?? "")?.name ?? "",
      level: c.level, target: c.target, assessed: c.at?.toISOString() ?? null, interest: c.interest ? "Yes" : "", location: e.location ?? "",
    }));
    return (
      <>
        <PageHeader title="People" description={`Who has ${engine.skillLabel(skillId)} at ${min} or above, confirmed by their manager`} />
        {toolbar}
        <Section title={`${all.length.toLocaleString("en-GB")} ${all.length === 1 ? "person" : "people"}`}
          description={all.length > found.length ? `Showing the highest ${found.length} levels first. Choose a team or role to narrow it down.` : undefined}>
          <DataTable csvName="people-with-skill" rows={found} initialSort={{ key: "level", desc: true }} emptyText="Nobody here has a confirmed rating at that level."
            columns={[
              { key: "name", header: "Name", kind: "person", hrefKey: "href", photoKey: "photo" },
              { key: "title", header: "Designation", kind: "muted" },
              { key: "team", header: "Team", facet: true },
              { key: "location", header: "Location", kind: "muted", facet: true },
              { key: "level", header: "Level", kind: "level", align: "center", info: "Their confirmed level in this skill." },
              { key: "target", header: "Their target", kind: "level", align: "center", info: "What their own role asks for in this skill; empty when it asks for nothing." },
              { key: "assessed", header: "Confirmed", kind: "date" },
              { key: "interest", header: "Wants to grow", kind: "muted", facet: true, info: "They starred this skill: they would like to get better at it." },
            ]} />
        </Section>
      </>
    );
  }

  const shown = [...visible].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_ROWS);
  const rows = shown.map((e) => {
    const p = engine.progress(e);
    return {
      name: e.name, href: `/people/${e.id}`, photo: photos.get(e.id) ?? null, title: e.title, team: team(e.managerId),
      role: engine.roleById.get(e.roleId ?? "")?.name ?? "", grade: engine.gradeById.get(e.gradeId ?? "")?.name ?? "", location: e.location ?? "",
      onTarget: engine.aggregate([e]).pct, rated: p.required ? `${p.rated} / ${p.required}` : "–",
      skills: engine.ratingsOf(e.id).filter((r) => r.validatedLevel != null && engine.isRateable(r.skillId)).length,
    };
  });

  return (
    <>
      <PageHeader title="People" description={`${visible.length.toLocaleString("en-GB")} people`} />
      {toolbar}
      {visible.length > rows.length && (
        <p className="mb-3 text-sm text-muted-foreground">Showing the first {rows.length.toLocaleString("en-GB")} of {visible.length.toLocaleString("en-GB")} by name. Search, or choose a team or role, to narrow it down.</p>
      )}
      <DataTable csvName="people" rows={rows} initialSort={{ key: "name" }} searchPlaceholder="Filter this list…"
        columns={[
          { key: "name", header: "Name", kind: "person", hrefKey: "href", photoKey: "photo" },
          { key: "title", header: "Designation", kind: "muted" },
          { key: "team", header: "Team", facet: true, info: "The team of their manager." },
          { key: "role", header: "Role", facet: true },
          { key: "grade", header: "Grade", kind: "muted", facet: true },
          { key: "location", header: "Location", kind: "muted", facet: true },
          { key: "skills", header: "Skills", kind: "number", align: "right", info: "Skills with a confirmed level." },
          { key: "rated", header: "Rated", align: "right", info: "Of the skills their role asks for, how many they rated." },
          { key: "onTarget", header: "On target", kind: "pct", align: "right", info: "Of the skills their role asks for, the share where the confirmed level reaches the target." },
        ]} />
    </>
  );
}
