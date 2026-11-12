// Talent: what capability a unit has and what it lacks, at whatever level of the
// organisation the viewer picks. Strengths (skills many people hold well), what is
// lacking (skills people need and do not have), depth by category, the role and grade
// mix, talent beyond what roles ask for, what people want to learn, and the same
// picture for each team one level down. Capability only: never a judgement of a person.
import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { FilterBar, UnitPicker, SelectFilter, ClearFilters } from "@/components/filter-bar";
import { KpiTiles, Section } from "@/components/kpi";
import { Empty } from "@/components/heatmap";
import { DataTable } from "@/components/data-table";
import { requireOrgViewer, getEngine, scopeUnit, param, type SearchParams } from "@/lib/server";
import { unitOptions, withParams } from "@/lib/views";
import { LEVEL_CLASS } from "@/lib/status";
import { pct } from "@/lib/engine/engine";
import { cn } from "@/lib/utils";

export const metadata = { title: "Talent" };

const TOP = 10;

export default async function TalentPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireOrgViewer();
  const engine = await getEngine();
  const unitId = scopeUnit(v, param(sp, "unit"));
  if (!unitId) return (<><PageHeader title="Talent" /><Empty>There is no organisation unit yet. An administrator adds them in Admin › Organisation.</Empty></>);
  const unit = engine.unitById.get(unitId)!;
  const categoryId = param(sp, "category") ?? null;
  const t = engine.talent(unitId);

  const db = await getDb();
  const [roles, levels] = await Promise.all([
    db.select().from(schema.jobRole).orderBy(asc(schema.jobRole.name)),
    db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level)),
  ]);
  const levelName = (n: number) => levels.find((l) => l.level === n)?.name ?? `Level ${n}`;
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const inCategory = (sid: string) => !categoryId || engine.skillById.get(sid)?.categoryId === categoryId;
  const skills = [...t.skills.values()].filter((s) => engine.isRateable(s.skillId) && inCategory(s.skillId));
  const href = (sid: string) => `/skills/${sid}?unit=${unitId}`;
  const label = (sid: string) => engine.skillLabel(sid);

  // the picture in numbers
  const deep = skills.filter((s) => s.proficient >= 3);
  const thin = skills.filter((s) => s.needed > 0 && s.proficient > 0 && s.proficient < 3);
  const missing = skills.filter((s) => s.needed > 0 && s.proficient === 0);
  const beyond = skills.reduce((n, s) => n + s.extra, 0);
  const critical = engine.coverageIn(unitId).filter((c) => c.critical && inCategory(c.skillId));
  const criticalBySkill = new Map<string, number>();
  for (const c of critical) criticalBySkill.set(c.skillId, (criticalBySkill.get(c.skillId) ?? 0) + 1);

  const strengths = [...skills].filter((s) => s.proficient > 0)
    .sort((a, b) => b.proficient - a.proficient || b.expert - a.expert).slice(0, TOP);
  const lacking = [...skills].filter((s) => s.needed > s.onTarget || criticalBySkill.has(s.skillId))
    .sort((a, b) => (criticalBySkill.get(b.skillId) ?? 0) - (criticalBySkill.get(a.skillId) ?? 0)
      || (b.needed - b.onTarget) - (a.needed - a.onTarget)).slice(0, TOP);
  const hidden = [...skills].filter((s) => s.extra > 0).sort((a, b) => b.extra - a.extra).slice(0, 8);
  const wanted = [...skills].filter((s) => s.interested > 0).sort((a, b) => b.interested - a.interested).slice(0, 8);

  // depth by category (all levels held, 1-5)
  const cats = [...engine.categoryById.values()].sort((a, b) => a.sort - b.sort)
    .filter((c) => !categoryId || c.id === categoryId)
    .map((c) => ({ id: c.id, name: c.name, dist: t.byCategory.get(c.id) ?? [0, 0, 0, 0, 0, 0] }))
    .filter((c) => c.dist.some((n, i) => i > 0 && n > 0));
  const roleMix = [...t.roles.entries()].map(([id, n]) => ({ name: id ? roleName.get(id) ?? "(removed role)" : "No role yet", n }))
    .sort((a, b) => b.n - a.n);
  const gradeMix = [...t.grades.entries()].map(([id, n]) => ({ name: id ? engine.gradeById.get(id)?.name ?? "(removed grade)" : "No grade yet", n, rank: id ? engine.gradeById.get(id)?.rank ?? 99 : 100 }))
    .sort((a, b) => a.rank - b.rank);

  // one level down: each team side by side
  const teams = engine.children(unitId).filter((u) => v.allUnits || v.unitIds.has(u.id)).map((u) => {
    const tt = engine.talent(u.id);
    const agg = engine.aggregate(engine.membersOf(u.id));
    const ss = [...tt.skills.values()].filter((s) => engine.isRateable(s.skillId) && inCategory(s.skillId));
    return {
      name: u.name, href: withParams("/talent", { unit: u.id, category: categoryId }), kind: u.kind,
      people: tt.people, avgLevel: tt.avgLevel, onTarget: agg.pct,
      deep: ss.filter((s) => s.proficient >= 3).length || null,
      missing: ss.filter((s) => s.needed > 0 && s.proficient === 0).length || null,
      beyond: ss.reduce((n, s) => n + s.extra, 0) || null,
    };
  }).filter((r) => r.people > 0);

  const allRows = skills.map((s) => ({
    skill: label(s.skillId), href: href(s.skillId),
    category: engine.categoryById.get(engine.skillById.get(s.skillId)?.categoryId ?? "")?.name ?? "",
    holders: s.holders || null, proficient: s.proficient || null, expert: s.expert || null,
    avg: s.holders ? Math.round((s.levelSum / s.holders) * 10) / 10 : null,
    needed: s.needed || null, onTarget: pct(s.onTarget, s.needed), beyond: s.extra || null, wanted: s.interested || null,
  }));

  const crumbs = [...engine.ancestors(unitId).filter((a) => v.allUnits || v.unitIds.has(a.id)), unit]
    .map((u) => ({ label: u.name, href: u.id === unitId ? undefined : withParams("/talent", { unit: u.id, category: categoryId }) }));

  return (
    <>
      <PageHeader title={`Talent · ${unit.name}`} crumbs={crumbs.length > 1 ? crumbs : undefined}
        description={`What capability ${t.people.toLocaleString("en-GB")} people have, and what is lacking. Manager-validated levels; level 3 and above counts as holding a skill.`} />
      <FilterBar>
        <UnitPicker units={unitOptions(engine, v)} value={unitId} />
        <SelectFilter name="category" label="Category" allLabel="All categories" value={categoryId}
          options={[...engine.categoryById.values()].sort((a, b) => a.sort - b.sort).map((c) => ({ id: c.id, name: c.name }))} />
        <ClearFilters keys={["category"]} />
      </FilterBar>

      <KpiTiles items={[
        { label: "People", value: t.people.toLocaleString("en-GB"), hint: `${pct(t.rated, t.people) ?? 0}% rated${t.avgLevel == null ? "" : ` · average level ${t.avgLevel.toFixed(1)}`}` },
        { label: "Deep skills", value: String(deep.length), hint: "three or more at level 3+", tone: deep.length ? "good" : "default" },
        { label: "Thin", value: String(thin.length), hint: "needed; one or two hold it", tone: thin.length ? "warn" : "default" },
        { label: "Lacking", value: String(missing.length), hint: "needed, and nobody holds it", tone: missing.length ? "bad" : "good" },
        { label: "Beyond the role", value: beyond.toLocaleString("en-GB"), hint: "level 3+ outside their role" },
      ]} />

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Section title="Strengths" description="The skills most people hold at level 3 or above.">
          {strengths.length ? <BarList rows={strengths.map((s) => ({ key: s.skillId, label: label(s.skillId), href: href(s.skillId), value: s.proficient, of: t.people,
            note: `${s.proficient.toLocaleString("en-GB")} at 3+${s.expert ? ` · ${s.expert.toLocaleString("en-GB")} at 4+` : ""}` }))} />
            : <Empty>No validated ratings at level 3 or above yet.</Empty>}
        </Section>
        <Section title="What is lacking" description="Skills people need for their role and do not have yet, and team needs nobody covers. Worst first."
          actions={<Link href={withParams("/gaps", { unit: unitId, category: categoryId })} className="text-xs text-muted-foreground hover:text-foreground">All gaps →</Link>}>
          {lacking.length ? <BarList tone="bad" rows={lacking.map((s) => {
            const short = s.needed - s.onTarget;
            const crit = criticalBySkill.get(s.skillId) ?? 0;
            return { key: s.skillId, label: label(s.skillId), href: href(s.skillId), value: short, of: Math.max(1, s.needed),
              note: [short ? `${short.toLocaleString("en-GB")} of ${s.needed.toLocaleString("en-GB")} below target` : "", s.proficient === 0 ? "nobody at 3+" : "", crit ? `${crit} team need${crit === 1 ? "" : "s"} uncovered` : ""].filter(Boolean).join(" · ") };
          })} /> : <Empty>Everyone who needs a skill has it, and every team need is covered.</Empty>}
        </Section>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Section className="lg:col-span-2" title="Depth by category" description="How many validated ratings sit at each level. More weight to the right is a deeper bench.">
          {cats.length ? (
            <div className="grid gap-2.5">
              {cats.map((c) => {
                const held = c.dist.slice(1).reduce((a, b) => a + b, 0);
                return (
                  <div key={c.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
                    <Link href={withParams("/talent", { unit: unitId, category: c.id })} className="truncate hover:underline">{c.name}</Link>
                    <div className="flex h-5 overflow-hidden rounded bg-muted" role="img"
                      aria-label={`${c.name}: ${[1, 2, 3, 4, 5].map((l) => `${c.dist[l]} at ${levelName(l)}`).join(", ")}`}>
                      {[1, 2, 3, 4, 5].map((l) => c.dist[l] > 0 && (
                        <div key={l} className={cn(LEVEL_CLASS[l], "h-full")} style={{ width: `${(c.dist[l] / held) * 100}%` }} title={`${levelName(l)}: ${c.dist[l]}`} />
                      ))}
                    </div>
                    <span className="w-14 text-right text-xs text-muted-foreground tabular">{held.toLocaleString("en-GB")}</span>
                  </div>
                );
              })}
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {[1, 2, 3, 4, 5].map((l) => <span key={l} className="inline-flex items-center gap-1.5"><span className={cn("size-3 rounded-sm", LEVEL_CLASS[l])} />{l} {levelName(l)}</span>)}
              </div>
            </div>
          ) : <Empty>No validated ratings yet.</Empty>}
        </Section>
        <Section title="Role and grade mix" description="Who the unit is made of.">
          <BarList compact rows={roleMix.slice(0, 8).map((r) => ({ key: r.name, label: r.name, value: r.n, of: t.people, note: r.n.toLocaleString("en-GB") }))} />
          {roleMix.length > 8 && <p className="mt-1 text-xs text-muted-foreground">and {roleMix.length - 8} more roles</p>}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {gradeMix.map((g) => <span key={g.name} className="rounded border px-2 py-0.5 text-xs">{g.name} <span className="text-muted-foreground tabular">{g.n.toLocaleString("en-GB")}</span></span>)}
          </div>
        </Section>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Section title="Beyond the role" description="People at level 3 or above in skills their own role does not ask for: talent to draw on before hiring.">
          {hidden.length ? <BarList compact rows={hidden.map((s) => ({ key: s.skillId, label: label(s.skillId), href: href(s.skillId), value: s.extra, of: Math.max(...hidden.map((h) => h.extra)), note: `${s.extra.toLocaleString("en-GB")} people` }))} />
            : <Empty>Nobody holds a skill beyond their role yet.</Empty>}
        </Section>
        <Section title="Wanted" description="Skills people marked as ones they want to grow in.">
          {wanted.length ? <BarList compact rows={wanted.map((s) => ({ key: s.skillId, label: label(s.skillId), href: href(s.skillId), value: s.interested, of: Math.max(...wanted.map((w) => w.interested)), note: `${s.interested.toLocaleString("en-GB")} people` }))} />
            : <Empty>Nobody has marked a skill they want to grow in.</Empty>}
        </Section>
      </div>

      {teams.length > 0 && (
        <Section className="mb-5" title="One level down" description="The same picture for each team below. Open one to see its talent.">
          <DataTable csvName="talent-by-team" rows={teams} initialSort={{ key: "people", desc: true }} columns={[
            { key: "name", header: "Team", kind: "link", hrefKey: "href" },
            { key: "kind", header: "", kind: "muted", facet: true },
            { key: "people", header: "People", kind: "number", align: "right" },
            { key: "avgLevel", header: "Avg level", kind: "number", align: "right" },
            { key: "onTarget", header: "On target", kind: "pct", align: "right" },
            { key: "deep", header: "Deep skills", kind: "number", align: "right" },
            { key: "missing", header: "Lacking", kind: "number", align: "right" },
            { key: "beyond", header: "Beyond role", kind: "number", align: "right" },
          ]} />
        </Section>
      )}

      <Section title="Every skill" description="The whole picture, to sort, search or download.">
        <DataTable csvName="talent-skills" rows={allRows} initialSort={{ key: "proficient", desc: true }} searchPlaceholder="Find a skill…" columns={[
          { key: "skill", header: "Skill", kind: "link", hrefKey: "href" },
          { key: "category", header: "Category", kind: "muted", facet: true },
          { key: "holders", header: "Hold it", kind: "number", align: "right" },
          { key: "proficient", header: "Level 3+", kind: "number", align: "right" },
          { key: "expert", header: "Level 4+", kind: "number", align: "right" },
          { key: "avg", header: "Avg level", kind: "number", align: "right" },
          { key: "needed", header: "Need it", kind: "number", align: "right" },
          { key: "onTarget", header: "On target", kind: "pct", align: "right" },
          { key: "beyond", header: "Beyond role", kind: "number", align: "right" },
          { key: "wanted", header: "Want it", kind: "number", align: "right" },
        ]} />
      </Section>
    </>
  );
}

function BarList({ rows, tone = "good", compact = false }: {
  rows: { key: string; label: string; href?: string; value: number; of: number; note: string }[];
  tone?: "good" | "bad"; compact?: boolean;
}) {
  return (
    <ul className={cn("grid", compact ? "gap-1.5" : "gap-2.5")}>
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1">
          <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
            {r.href ? <Link href={r.href} className="min-w-0 truncate hover:underline">{r.label}</Link> : <span className="min-w-0 truncate">{r.label}</span>}
            {compact && <span className="shrink-0 text-xs text-muted-foreground tabular">{r.note}</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", tone === "bad" ? "bg-status-critical" : "bg-primary")} style={{ width: `${Math.max(2, Math.min(100, (r.value / Math.max(1, r.of)) * 100))}%` }} />
          </div>
          {!compact && <span className="text-xs text-muted-foreground tabular">{r.note}</span>}
        </li>
      ))}
    </ul>
  );
}

