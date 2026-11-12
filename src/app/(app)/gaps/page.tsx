// Gaps: where capability is short, at any level of the organisation. Capability only -
// the page reports what is short and where, not what to do about it.
//   Team needs   needs that are short (fewer people at the level than needed) or rest on one person
//   People       each person below their own target, or not yet assessed
//   Training     training plans managers have booked against gaps, and their status
import { asc, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker, SelectFilter, ClearFilters } from "@/components/filter-bar";
import { KpiTiles, Section } from "@/components/kpi";
import { NeedList } from "@/components/needs";
import { DataTable } from "@/components/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty } from "@/components/heatmap";
import { requireOrgViewer, getEngine, scopeUnit, param, type SearchParams } from "@/lib/server";
import { unitOptions, needView } from "@/lib/views";

export const metadata = { title: "Gaps" };

export default async function GapsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireOrgViewer();
  const engine = await getEngine();
  const unitId = scopeUnit(v, param(sp, "unit"));
  if (!unitId) return (<><PageHeader title="Gaps" /><Empty>No organisation units yet.</Empty></>);
  const categoryId = param(sp, "category") ?? null;
  const tab = param(sp, "tab") ?? "teams";
  const inCategory = (sid: string) => !categoryId || engine.skillById.get(sid)?.categoryId === categoryId;

  const db = await getDb();
  const levelRows = await db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level));
  const levelName = (n: number) => levelRows.find((l) => l.level === n)?.name ?? String(n);

  const needs = engine.shortNeeds(unitId).filter((c) => inCategory(c.skillId)).map((c) => needView(engine, c, levelName));
  const short = needs.filter((n) => n.count < n.headcount);
  const single = needs.filter((n) => n.count >= n.headcount && n.spof);

  const members = engine.membersOf(unitId);
  const gaps = engine.individualGaps(members).filter((n) => inCategory(n.skillId)).map((n) => {
    const e = engine.empById.get(n.employeeId)!;
    return {
      person: e.name, personHref: `/people/${e.id}`,
      team: engine.unitById.get(e.unitId ?? "")?.name ?? "",
      skill: engine.skillLabel(n.skillId),
      category: engine.categoryById.get(engine.skillById.get(n.skillId)!.categoryId)?.name ?? "",
      target: n.target, level: n.level, gap: n.category,
      interest: n.interest ? "Yes" : "", mandatory: n.mandatory ? "Required" : "Optional",
    };
  });

  const ids = members.map((m) => m.id);
  const plans = ids.length ? await db.select().from(schema.trainingPlan).where(inArray(schema.trainingPlan.employeeId, ids)) : [];
  const planRows = plans.filter((p) => inCategory(p.skillId)).map((p) => {
    const e = engine.empById.get(p.employeeId);
    const { level } = engine.levelOf(p.employeeId, p.skillId);
    return {
      person: e?.name ?? "", personHref: `/people/${p.employeeId}`, skill: engine.skillLabel(p.skillId),
      title: p.title, target: p.targetLevel, level, due: p.dueOn, status: p.status.replace("_", " "),
    };
  });
  const below = gaps.filter((g) => g.gap !== "unassessed");

  return (
    <>
      <PageHeader title="Gaps" description="Where the team or individual capability is below what is needed." />
      <FilterBar>
        <UnitPicker units={unitOptions(engine, v)} value={unitId} />
        <SelectFilter name="category" label="Category" allLabel="All categories" value={categoryId}
          options={[...engine.categoryById.values()].sort((a, b) => a.sort - b.sort).map((c) => ({ id: c.id, name: c.name }))} />
        <ClearFilters keys={["category"]} />
      </FilterBar>
      <KpiTiles items={[
        { label: "Team needs short", value: String(short.length), hint: `${needs.filter((n) => n.critical).length} with nobody at the level`, tone: short.length ? "bad" : "good" },
        { label: "Single holders", value: String(single.length), hint: "covered by one person only", tone: single.length ? "warn" : "good" },
        { label: "People below target", value: String(new Set(below.map((g) => g.personHref)).size), hint: `${below.length} skill gaps` },
        { label: "Not assessed", value: String(gaps.length - below.length), hint: "required skills with no rating" },
        { label: "Training booked", value: String(planRows.filter((p) => p.status !== "done" && p.status !== "cancelled").length), hint: `${planRows.filter((p) => p.status === "done").length} completed` },
      ]} />
      <Tabs defaultValue={tab}>
        <TabsList className="mb-3">
          <TabsTrigger value="teams">Team needs</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="plans">Training plans</TabsTrigger>
        </TabsList>
        <TabsContent value="teams" className="grid gap-5 lg:grid-cols-2">
          <Section title="Short" description="Fewer people at the level than the team needs. Worst first.">
            <NeedList items={short} empty="No team need is short." />
          </Section>
          <Section title="Single holders" description="Enough people on paper, but only one person holds it.">
            <NeedList items={single} empty="No team need rests on one person." />
          </Section>
        </TabsContent>
        <TabsContent value="people">
          <Section title="Individual gaps" description="Each person below their own target, or with a required skill not yet assessed.">
            <DataTable csvName="individual-gaps" rows={gaps} searchPlaceholder="Find a person or skill…"
              columns={[
                { key: "person", header: "Person", kind: "link", hrefKey: "personHref" },
                { key: "team", header: "Team", kind: "muted", facet: true },
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
        <TabsContent value="plans">
          <Section title="Training plans" description="Booked by managers from a person's profile.">
            <DataTable csvName="training-plans" rows={planRows} emptyText="No training booked."
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
