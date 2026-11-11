// Overview: the executive and manager landing page. KPI tiles, the heatmap for the
// chosen unit (units x categories, or people x skills at team level), the top gaps
// with their train / develop / move / hire plan, the trend, and rating calibration.
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker, SelectFilter, SegmentFilter, SwitchFilter, ClearFilters } from "@/components/filter-bar";
import { KpiTiles, Section } from "@/components/kpi";
import { UnitHeatmap, PeopleHeatmap, HeatLegend, Empty } from "@/components/heatmap";
import { TrendChart } from "@/components/charts";
import { RecommendationList, type RecView } from "@/components/actions";
import { requireOrgViewer, getEngine, scopeUnit, param, type SearchParams } from "@/lib/server";
import { unitOptions, unitHeatmapData, peopleHeatmapData, describeRecommendation, withParams } from "@/lib/views";
import { fmtPct } from "@/lib/format";

export const metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireOrgViewer();
  const basis = param(sp, "basis") === "self" ? "self" : "validated";
  const engine = await getEngine(basis);
  const unitId = scopeUnit(v, param(sp, "unit"));
  if (!unitId) {
    return (<><PageHeader title="Overview" /><Empty>There is no organisation unit yet. An administrator adds them in Admin › Organisation.</Empty></>);
  }
  const unit = engine.unitById.get(unitId)!;
  const categoryId = param(sp, "category") ?? null;
  const roleId = param(sp, "role") ?? null;
  const hideMet = param(sp, "only") === "gaps";
  const hasChildren = engine.children(unitId).length > 0;
  const view = param(sp, "view") === "people" || !hasChildren ? "people" : "units";

  const members = engine.membersOf(unitId).filter((e) => !roleId || e.roleId === roleId);
  const k = engine.kpis(unitId, members);
  const levels = [...Array(6).keys()].map((n) => n);
  const db = await getDb();
  const levelRows = await db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level));
  const levelNames = levels.map((n) => levelRows.find((l) => l.level === n)?.name ?? String(n));

  const snaps = await db.select().from(schema.snapshot).where(eq(schema.snapshot.unitId, unitId)).orderBy(asc(schema.snapshot.period));
  const trend = snaps.slice(-12).map((s) => ({
    period: s.period,
    onTarget: s.required ? Math.round((s.met / s.required) * 100) : null,
    assessed: s.required ? Math.round((s.assessed / s.required) * 100) : null,
  }));
  const prev = trend.length >= 2 ? trend[trend.length - 2].onTarget : null;
  const delta = prev != null && k.onTargetPct != null ? k.onTargetPct - prev : null;

  const inCategory = (sid: string) => !categoryId || engine.skillById.get(sid)?.categoryId === categoryId;
  const recs = engine.recommendations(unitId).filter((r) => inCategory(r.skillId));
  const recViews: RecView[] = recs.slice(0, 8).map((r) => {
    const d = describeRecommendation(engine, r);
    return {
      key: `${r.unitId}|${r.skillId}`, unit: d.unit, unitHref: withParams("/", { unit: r.unitId, view: "people" }),
      skill: d.skill, skillHref: `/skills/${r.skillId}`, level: r.level, levelName: levelNames[r.level],
      count: r.count, headcount: r.headcount, critical: r.critical, backupOnly: r.backupOnly, explicit: r.explicit, steps: d.steps,
    };
  });
  const calibration = engine.calibration(unitId).slice(0, 5);

  const thresholds = { greenAt: engine.settings.greenAt, amberAt: engine.settings.amberAt };
  const crumbs = [...engine.ancestors(unitId).filter((a) => v.allUnits || v.unitIds.has(a.id)), unit]
    .map((u) => ({ label: u.name, href: u.id === unitId ? undefined : withParams("/", { unit: u.id }) }));
  const keep = { unit: unitId, category: categoryId, role: roleId, basis: basis === "self" ? "self" : null };

  return (
    <>
      <PageHeader
        title={unit.name}
        description={`${members.length} people${roleId ? " in this role" : ""} · ${basis === "self" ? "self-assessed levels" : "manager-validated levels"}`}
        crumbs={crumbs.length > 1 ? crumbs : undefined}
      />
      <FilterBar>
        <UnitPicker units={unitOptions(engine, v)} value={unitId} />
        <SelectFilter name="category" label="Category" allLabel="All categories" value={categoryId}
          options={[...engine.categoryById.values()].sort((a, b) => a.sort - b.sort).map((c) => ({ id: c.id, name: c.name }))} />
        <SelectFilter name="role" label="Role" allLabel="All roles" value={roleId}
          options={(await getRoles()).map((r) => ({ id: r.id, name: r.name }))} />
        <SegmentFilter name="basis" value={basis} defaultValue="validated"
          options={[{ value: "validated", label: "Validated" }, { value: "self", label: "Self" }]} />
        <ClearFilters keys={["category", "role", "basis", "only", "view"]} />
      </FilterBar>

      <KpiTiles items={[
        { label: "On target", value: fmtPct(k.onTargetPct), hint: delta == null ? `${k.required} required skill ratings` : `${delta >= 0 ? "+" : ""}${delta} pts since last month`, tone: k.onTargetPct == null ? "default" : k.onTargetPct >= thresholds.greenAt ? "good" : k.onTargetPct >= thresholds.amberAt ? "warn" : "bad" },
        { label: "Assessed", value: fmtPct(k.assessedPct), hint: k.pendingValidation ? `${k.pendingValidation} awaiting validation` : "of required skill ratings", href: v.reportIds.size ? "/validate" : undefined },
        { label: "Critical gaps", value: String(k.criticalGaps), hint: "team needs nobody covers", tone: k.criticalGaps ? "bad" : "good", href: withParams("/gaps", { unit: unitId }) },
        { label: "Single points of failure", value: String(k.spof), hint: "skills only one person holds", tone: k.spof ? "warn" : "good", href: withParams("/gaps", { unit: unitId, tab: "teams" }) },
        { label: "Stale", value: fmtPct(k.stalePct), hint: `validated more than ${engine.settings.staleMonths} months ago`, tone: (k.stalePct ?? 0) > 20 ? "warn" : "default" },
      ]} />

      <Section
        className="mb-5"
        title={view === "units" ? (categoryId ? `${engine.categoryById.get(categoryId)?.name} by unit` : "Capability by unit") : "People and skills"}
        description={view === "units"
          ? "Click a unit to go down a level, or a category to see its skills."
          : "Colour shows the gap to each person's own target. The bottom row is team coverage."}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {view === "people" && <SwitchFilter name="only" label="Only gaps" value={hideMet} />}
            {hasChildren && (
              <SegmentFilter name="view" value={view} defaultValue="units"
                options={[{ value: "units", label: "Units" }, { value: "people", label: "People" }]} />
            )}
          </div>
        }
      >
        {view === "units"
          ? <UnitHeatmap data={unitHeatmapData(engine, unitId, { categoryId, roleId, basis: keep.basis })} thresholds={thresholds} />
          : members.length > 300
            ? <Empty>{members.length} people is too many to show one by one. Pick a smaller unit, a role or a category.</Empty>
            : <PeopleHeatmap data={peopleHeatmapData(engine, unitId, { categoryId, roleId, hideMet })} levels={levelNames} />}
        <div className="mt-3"><HeatLegend mode={view} /></div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section
          className="lg:col-span-2"
          title="Top gaps and what to do"
          description="Team needs that are short, worst first. Train before develop, move before hire."
          actions={<Link href={withParams("/gaps", { unit: unitId, category: categoryId })} className="text-xs text-muted-foreground hover:text-foreground">All gaps →</Link>}
        >
          <RecommendationList items={recViews} />
        </Section>
        <div className="grid content-start gap-5">
          <Section title="Trend" description="Share of required skill ratings on target, monthly">
            <TrendChart data={trend} />
          </Section>
          <Section title="Rating calibration" description="Self minus validated level, average per team">
            {calibration.length ? (
              <ul className="grid gap-1.5 text-sm">
                {calibration.map((c) => (
                  <li key={c.unitId} className="flex items-center justify-between gap-2">
                    <Link href={withParams("/", { unit: c.unitId, view: "people" })} className="truncate hover:underline">{engine.unitById.get(c.unitId)?.name}</Link>
                    <span className={`tabular text-xs ${Math.abs(c.delta) >= 1 ? "font-semibold text-status-critical dark:text-[color:oklch(0.75_0.15_27)]" : Math.abs(c.delta) >= 0.5 ? "font-medium" : "text-muted-foreground"}`}>
                      {c.delta > 0 ? "+" : ""}{c.delta.toFixed(1)} <span className="font-normal text-muted-foreground">({c.n})</span>
                    </span>
                  </li>
                ))}
                <li className="pt-1 text-xs text-muted-foreground">Above +1 means people and managers read the scale differently.</li>
              </ul>
            ) : <p className="text-sm text-muted-foreground">Not enough validated ratings yet.</p>}
          </Section>
        </div>
      </div>
    </>
  );
}

async function getRoles() {
  const db = await getDb();
  return db.select({ id: schema.jobRole.id, name: schema.jobRole.name }).from(schema.jobRole).orderBy(asc(schema.jobRole.name));
}
