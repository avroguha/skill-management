// Insights, for managers and leadership: what a team (or the whole organisation) has, what
// it needs, and who could strengthen another team. One page, read top to bottom:
//   the numbers -> capability by team -> where teams are short -> strengths -> people who
//   already have what another team is short of.
// Capability only: never a judgement of a person, never a suggestion to hire.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiTiles, Section, type Kpi } from "@/components/kpi";
import { Empty, UnitHeatmap, HeatLegend } from "@/components/heatmap";
import { NeedList } from "@/components/needs";
import { DataTable } from "@/components/data-table";
import { UnitPicker } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { requireTeamViewer, getEngine, param, type SearchParams } from "@/lib/server";
import { photoUrls } from "@/lib/photos";
import { maySeeScope } from "@/lib/access";
import { getLevels, levelNamer } from "@/lib/levels";
import { needView, scopeName, scopeOptions, teamHeatmapData, withParams } from "@/lib/views";
import { fmtPct } from "@/lib/format";
import { pctBand } from "@/lib/status";

export const metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireTeamViewer();
  const engine = await getEngine();
  const photos = await photoUrls();
  const requested = param(sp, "scope");
  const scope = requested && maySeeScope(v, requested) && (requested === "*" || engine.empById.get(requested)) ? requested : v.homeScope!;
  const categoryId = param(sp, "category") ?? null;
  const levels = await getLevels();
  const name = levelNamer(levels);
  const options = scopeOptions(engine, v);
  const k = engine.kpis(scope);
  const here = (extra: Record<string, string | null>) => withParams("/insights", { scope: scope === v.homeScope ? null : scope, category: categoryId, ...extra });

  if (!k.people) {
    return (<><PageHeader title="Insights" /><Empty>No people here yet. People and their managers come from ServiceNow (Settings › ServiceNow) or a people CSV (Settings › Data).</Empty></>);
  }

  const band = pctBand(k.onTargetPct, engine.settings);
  const tiles: Kpi[] = [
    { label: "People", value: String(k.people), hint: `${k.asked} asked to rate their skills`,
      info: "Everyone active here. Managers are not asked to rate their own skills; everyone else is." },
    { label: "Finished rating", value: fmtPct(k.donePct), hint: `${k.done} of ${k.asked} people`, tone: k.donePct == null ? "default" : k.donePct >= 85 ? "good" : k.donePct >= 50 ? "warn" : "bad",
      info: "People who rated every skill their role asks for and sent them. Until most have, the other numbers describe only part of the team." },
    { label: "On target", value: fmtPct(k.onTargetPct), hint: `of ${k.required} required skill ratings`, tone: band === "good" ? "good" : band === "watch" ? "warn" : k.onTargetPct == null ? "default" : "bad",
      info: `Of every skill a person's role asks for, the share where the confirmed level reaches the target. Green from ${engine.settings.greenAt}%, amber from ${engine.settings.amberAt}% (Settings › Levels & rules).` },
    { label: "Team needs short", value: String(k.short), hint: `of ${k.needs} needs · ${k.nobody} with nobody`, tone: k.short ? "bad" : "good",
      info: "Needs (N people at level L in skill S) where a team has fewer people at that level than it needs." },
    { label: "Rest on one person", value: String(k.spof), hint: "covered by one person only", tone: k.spof ? "warn" : "good",
      info: "Needs covered by exactly one person in the team: if they are away or leave, nobody is left at that level." },
  ];

  // capability by team: categories, or the skills of one category
  const heat = teamHeatmapData(engine, scope, { categoryId });
  const short = engine.shortNeeds(scope).slice(0, 25).map((c) => needView(engine, c, name, v));

  // strengths: the skills most people here hold well
  const t = engine.talent(scope);
  const inCat = (sid: string) => !categoryId || engine.skillById.get(sid)?.categoryId === categoryId;
  const strengths = [...t.skills.values()].filter((s) => engine.isRateable(s.skillId) && inCat(s.skillId) && s.holders > 0)
    .sort((a, b) => b.proficient - a.proficient || b.expert - a.expert || b.holders - a.holders).slice(0, 200)
    .map((s) => ({
      skill: engine.skillLabel(s.skillId), href: `/skills/${s.skillId}`, category: engine.categoryById.get(engine.skillById.get(s.skillId)!.categoryId)?.name ?? "",
      holders: s.holders, proficient: s.proficient, expert: s.expert, needed: s.needed || null, onTarget: s.needed ? s.onTarget : null, extra: s.extra || null, interested: s.interested || null,
    }));

  // people here who already have what another team is short of
  const fits = engine.membersOf(scope).flatMap((e) => {
    const f = engine.fitsFor(e, 3);
    if (!f.length) return [];
    return [{
      name: e.name, href: `/people/${e.id}`, photo: photos.get(e.id) ?? null, team: e.managerId ? engine.teamLabel(e.managerId) : "",
      fits: f.map((x) => `${engine.teamLabel(x.managerId)}: ${x.skills.map((s) => `${engine.skillLabel(s.skillId)} ${s.has}`).join(", ")}`).join(" · "),
      count: f.reduce((n, x) => n + x.skills.length, 0),
    }];
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 500);

  return (
    <>
      <PageHeader title="Insights" description={`${scopeName(engine, scope)}${scope === "*" ? "" : ` · ${engine.empById.get(scope)?.name ?? ""} and everyone below`}`}
        actions={options.length > 1 ? <UnitPicker units={options.map((o) => ({ id: o.id, name: o.name, depth: o.depth, kind: `${o.people}` }))} value={scope} paramName="scope" /> : undefined} />
      <KpiTiles items={tiles} />

      <div className="grid gap-5">
        <Section title={categoryId ? `${engine.categoryById.get(categoryId)?.name ?? "Category"}: skill by skill` : "Capability by team"}
          info="Each row is a team directly below (open it to go one level down). Each cell: of the skills that team's roles ask for in that category, the share of people at their target. Click a category to see its skills one by one."
          actions={categoryId ? <Button asChild size="sm" variant="ghost"><Link href={here({ category: null })}>All categories</Link></Button> : undefined}>
          <HeatLegend mode="units" />
          <UnitHeatmap data={heat} thresholds={engine.settings} />
        </Section>

        <Section title="Where teams are short" info="Team needs with fewer people at the level than needed, or only one, worst first. Under each: who outside that team already has it at that level or above - people who could help, move or coach.">
          <NeedList items={short} />
        </Section>

        <Section title="Strengths" info="The skills people here hold, the deepest first. 3+ = Proficient or above; 4+ = Advanced or above. Beyond role: people at 3+ whose role does not ask for it - hidden capability. Want to grow: people who starred the skill.">
          <DataTable csvName="strengths" rows={strengths} pageSize={15} initialSort={{ key: "proficient", desc: true }} searchPlaceholder="Find a skill…"
            columns={[
              { key: "skill", header: "Skill", kind: "link", hrefKey: "href" },
              { key: "category", header: "Category", kind: "muted", facet: true },
              { key: "holders", header: "Have it", kind: "number", align: "right", info: "People with a confirmed level of 1 or more." },
              { key: "proficient", header: "3+", kind: "number", align: "right", info: "People at Proficient (3) or above." },
              { key: "expert", header: "4+", kind: "number", align: "right", info: "People at Advanced (4) or above." },
              { key: "needed", header: "Role asks", kind: "number", align: "right", info: "People whose role asks for this skill." },
              { key: "onTarget", header: "On target", kind: "number", align: "right", info: "Of those, how many reach their role's target." },
              { key: "extra", header: "Beyond role", kind: "number", align: "right", info: "People at 3+ whose role does not ask for it." },
              { key: "interested", header: "Want to grow", kind: "number", align: "right", info: "People who starred this skill: they want to get better at it." },
            ]} />
        </Section>

        <Section title="People who could strengthen another team" info="People here who already meet a need another team is short of (a team they are not in), with their confirmed level. Capability only: whether anyone moves, helps or coaches is a conversation, not something the app decides.">
          {fits.length ? (
            <DataTable csvName="could-strengthen" rows={fits} pageSize={15} initialSort={{ key: "count", desc: true }} searchPlaceholder="Find a person or team…"
              columns={[
                { key: "name", header: "Person", kind: "person", hrefKey: "href", photoKey: "photo" },
                { key: "team", header: "Their team", kind: "muted", facet: true },
                { key: "fits", header: "Could strengthen", className: "min-w-72 whitespace-normal", info: "Other teams, and the skills they are short of that this person has (with their level)." },
                { key: "count", header: "Needs met", kind: "number", align: "right", info: "How many short needs, across those teams, this person meets." },
              ]} />
          ) : <p className="text-sm text-muted-foreground">Nobody here meets a need another team is short of yet.</p>}
        </Section>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Numbers count confirmed ratings only. <Link className="underline underline-offset-2" href="/help">How the numbers work</Link> ·{" "}
        <Link className="inline-flex items-center gap-1 underline underline-offset-2" href={withParams("/team", { scope: scope === "*" ? null : scope })}>Open the team<ArrowRight className="size-3" /></Link>
      </p>
    </>
  );
}
