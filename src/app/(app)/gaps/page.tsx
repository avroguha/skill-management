// Gaps & actions: the hire / train output of the app, at any level of the organisation.
//   Team needs     every team need that is short or rests on one person, with its plan
//   Hiring plan    the "hire" steps summed by skill and level
//   People         individual gaps: who is below their own target, train or develop
//   Training plans what has been booked against gaps, and its status
import { asc, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker, SelectFilter, ClearFilters } from "@/components/filter-bar";
import { KpiTiles, Section } from "@/components/kpi";
import { RecommendationList, type RecView } from "@/components/actions";
import { DataTable } from "@/components/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty } from "@/components/heatmap";
import { requireOrgViewer, getEngine, scopeUnit, param, type SearchParams } from "@/lib/server";
import { unitOptions, describeRecommendation, withParams } from "@/lib/views";

export const metadata = { title: "Gaps & actions" };

export default async function GapsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireOrgViewer();
  const engine = await getEngine();
  const unitId = scopeUnit(v, param(sp, "unit"));
  if (!unitId) return (<><PageHeader title="Gaps & actions" /><Empty>No organisation units yet.</Empty></>);
  const categoryId = param(sp, "category") ?? null;
  const tab = param(sp, "tab") ?? "teams";
  const inCategory = (sid: string) => !categoryId || engine.skillById.get(sid)?.categoryId === categoryId;

  const db = await getDb();
  const levelRows = await db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level));
  const levelName = (n: number) => levelRows.find((l) => l.level === n)?.name ?? String(n);

  const recs = engine.recommendations(unitId).filter((r) => inCategory(r.skillId));
  const recViews: RecView[] = recs.map((r) => {
    const d = describeRecommendation(engine, r);
    return {
      key: `${r.unitId}|${r.skillId}`, unit: d.unit, unitHref: withParams("/", { unit: r.unitId, view: "people" }),
      skill: d.skill, skillHref: `/skills/${r.skillId}`, level: r.level, levelName: levelName(r.level),
      count: r.count, headcount: r.headcount, critical: r.critical, backupOnly: r.backupOnly, explicit: r.explicit, steps: d.steps,
    };
  });
  const shortfalls = recViews.filter((r) => !r.backupOnly);
  const backups = recViews.filter((r) => r.backupOnly);

  const hiring = engine.hiringPlan(unitId).filter((h) => inCategory(h.skillId)).map((h) => ({
    skill: engine.skillLabel(h.skillId), skillHref: `/skills/${h.skillId}`,
    category: engine.categoryById.get(engine.skillById.get(h.skillId)!.categoryId)?.name ?? "",
    level: `${h.level} ${levelName(h.level)}`, count: h.count,
    teams: [...new Set(h.unitIds)].map((id) => engine.unitById.get(id)?.name).join(", "),
  }));
  const hires = hiring.reduce((s, h) => s + h.count, 0);

  const members = engine.membersOf(unitId);
  const needs = engine.trainingNeeds(members).filter((n) => inCategory(n.skillId)).map((n) => {
    const e = engine.empById.get(n.employeeId)!;
    return {
      person: e.name, personHref: `/people/${e.id}`,
      team: engine.unitById.get(e.unitId ?? "")?.name ?? "",
      skill: engine.skillLabel(n.skillId),
      category: engine.categoryById.get(engine.skillById.get(n.skillId)!.categoryId)?.name ?? "",
      target: n.target, level: n.level, gap: n.category, action: n.action,
      interest: n.interest ? "Yes" : "", mandatory: n.mandatory ? "Required" : "Optional",
    };
  });

  const ids = members.map((m) => m.id);
  const plans = ids.length
    ? await db.select().from(schema.trainingPlan).where(inArray(schema.trainingPlan.employeeId, ids))
    : [];
  const planRows = plans.filter((p) => inCategory(p.skillId)).map((p) => {
    const e = engine.empById.get(p.employeeId);
    const { level } = engine.levelOf(p.employeeId, p.skillId);
    return {
      person: e?.name ?? "", personHref: `/people/${p.employeeId}`, skill: engine.skillLabel(p.skillId),
      title: p.title, target: p.targetLevel, level, due: p.dueOn, status: p.status.replace("_", " "),
    };
  });

  return (
    <>
      <PageHeader title="Gaps & actions" description="What each team is short of, and whether to train, develop, move or hire." />
      <FilterBar>
        <UnitPicker units={unitOptions(engine, v)} value={unitId} />
        <SelectFilter name="category" label="Category" allLabel="All categories" value={categoryId}
          options={[...engine.categoryById.values()].sort((a, b) => a.sort - b.sort).map((c) => ({ id: c.id, name: c.name }))} />
        <ClearFilters keys={["category"]} />
      </FilterBar>
      <KpiTiles items={[
        { label: "Short team needs", value: String(shortfalls.length), hint: `${recs.filter((r) => r.critical).length} with nobody at all`, tone: shortfalls.length ? "bad" : "good" },
        { label: "Needs a backup", value: String(backups.length), hint: "one person holds it", tone: backups.length ? "warn" : "good" },
        { label: "To hire", value: String(hires), hint: `${hiring.length} skill${hiring.length === 1 ? "" : "s"}`, tone: hires ? "warn" : "good" },
        { label: "People below target", value: String(new Set(needs.filter((n) => n.action !== "assess").map((n) => n.personHref)).size), hint: `${needs.filter((n) => n.action !== "assess").length} skill gaps` },
        { label: "Training booked", value: String(planRows.filter((p) => p.status !== "done" && p.status !== "cancelled").length), hint: `${planRows.filter((p) => p.status === "done").length} completed` },
      ]} />
      <Tabs defaultValue={tab}>
        <TabsList className="mb-3">
          <TabsTrigger value="teams">Team needs</TabsTrigger>
          <TabsTrigger value="hiring">Hiring plan</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="plans">Training plans</TabsTrigger>
        </TabsList>
        <TabsContent value="teams" className="grid gap-5 lg:grid-cols-2">
          <Section title="Short of what they need" description="Fewer people at the level than the team needs. Worst first.">
            <RecommendationList items={shortfalls} />
          </Section>
          <Section title="Single points of failure" description="One person holds a skill the team depends on. Plan a second.">
            <RecommendationList items={backups} />
          </Section>
        </TabsContent>
        <TabsContent value="hiring">
          <Section title="Hiring plan" description="What is left after training, development and moving people who are spare elsewhere.">
            <DataTable csvName="hiring-plan" rows={hiring} emptyText="Nothing to hire: every short need can be met from inside."
              initialSort={{ key: "count", desc: true }}
              columns={[
                { key: "skill", header: "Skill", kind: "link", hrefKey: "skillHref" },
                { key: "category", header: "Category", kind: "muted", facet: true },
                { key: "level", header: "At level" },
                { key: "count", header: "People", kind: "number", align: "right" },
                { key: "teams", header: "For", kind: "muted" },
              ]} />
          </Section>
        </TabsContent>
        <TabsContent value="people">
          <Section title="Individual gaps" description="Each person below their own target. One level: train. Two or more: a development plan. No rating: assess first.">
            <DataTable csvName="individual-gaps" rows={needs} searchPlaceholder="Find a person or skill…"
              columns={[
                { key: "person", header: "Person", kind: "link", hrefKey: "personHref" },
                { key: "team", header: "Team", kind: "muted", facet: true },
                { key: "skill", header: "Skill" },
                { key: "category", header: "Category", kind: "muted", facet: true },
                { key: "level", header: "Level", kind: "level", align: "center" },
                { key: "target", header: "Target", kind: "level", align: "center" },
                { key: "gap", header: "Gap", kind: "gap", facet: true },
                { key: "action", header: "Action", kind: "action", facet: true },
                { key: "interest", header: "Wants it", kind: "muted", facet: true },
              ]} />
          </Section>
        </TabsContent>
        <TabsContent value="plans">
          <Section title="Training plans" description="Booked from a person's profile. A plan turns a red cell into work in progress.">
            <DataTable csvName="training-plans" rows={planRows} emptyText="No training booked yet. Book it from a person's profile."
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
