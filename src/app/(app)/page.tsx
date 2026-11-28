// Home: the viewer's next step first (rating their own skills; for a manager, ratings to
// confirm and who has not started; for an administrator, what the app still needs), then
// everything they can do in their own words ("What do you want to do?"), then for
// managers and leaders the headline numbers of their team or the organisation, each one link
// away from the detail.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiTiles, Section, type Kpi } from "@/components/kpi";
import { NeedList } from "@/components/needs";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/info";
import { requireViewer, getEngine } from "@/lib/server";
import { getNextSteps } from "@/lib/next-steps-server";
import { NextSteps } from "@/components/next-step";
import { TaskList } from "@/components/task-list";
import { tasksFor } from "@/lib/menu";
import { getMenuFor } from "@/lib/menu-server";
import { getLevels, levelNamer } from "@/lib/levels";
import { needView, scopeName, withParams } from "@/lib/views";
import { fmtPct } from "@/lib/format";
import { pctBand } from "@/lib/status";

export const metadata = { title: "Home" };

export default async function Home() {
  const v = await requireViewer();
  const engine = await getEngine();
  const levels = await getLevels();
  const first = v.name.split(/\s+/)[0];
  const steps = await getNextSteps();

  // ---- the team or organisation
  const scope = v.homeScope;
  const k = scope ? engine.kpis(scope) : null;
  const short = scope ? engine.shortNeeds(scope).slice(0, 6).map((c) => needView(engine, c, levelNamer(levels), v)) : [];
  const insights = (extra: Record<string, string>) => withParams("/insights", { scope: scope ?? undefined, ...extra });
  const tiles: Kpi[] = k ? [
    { label: "People", value: String(k.people), hint: `${k.asked} asked to rate their skills`, href: insights({}),
      info: "Everyone in this view who is active. Managers are not asked to rate their own skills (they may, if they like); everyone else is." },
    { label: "Finished rating", value: fmtPct(k.donePct), hint: `${k.done} of ${k.asked} people`, tone: k.donePct == null ? "default" : k.donePct >= 85 ? "good" : k.donePct >= 50 ? "warn" : "bad", href: "/team?tab=people",
      info: "People who rated every skill their role asks for and sent them to their manager. In progress, not started and sent back do not count." },
    { label: "On target", value: fmtPct(k.onTargetPct), hint: `of ${k.required} required skill ratings`, href: insights({}),
      tone: pctBand(k.onTargetPct, engine.settings) === "good" ? "good" : pctBand(k.onTargetPct, engine.settings) === "watch" ? "warn" : k.onTargetPct == null ? "default" : "bad",
      info: "Of every skill a person's role asks for, the share where their confirmed level reaches the target. Levels are never averaged: one expert does not hide four beginners." },
    { label: "Team needs short", value: String(k.short), hint: `${k.nobody} with nobody at all`, tone: k.short ? "bad" : "good", href: insights({}),
      info: "Team needs (\"N people at level L in skill S\") where the team has fewer people at that level than it needs. A need is set by the manager, or implied when two or more of a manager's people have a role that requires the skill." },
    { label: "Rest on one person", value: String(k.spof), hint: "needs only one person covers", tone: k.spof ? "warn" : "good", href: insights({}),
      info: "Team needs covered by exactly one person: if they are away or leave, the team has nobody at that level." },
  ] : [];

  // someone with no team of their own: their own numbers, each one click from where to act
  const me = v.employee;
  const p = !k && me ? engine.progress(me) : null;
  const myPct = p && me ? engine.onTargetOf(me) : null;
  const mine: Kpi[] = p && me && p.required ? [
    { label: "Rated", value: `${p.rated} of ${p.required}`, hint: p.rated < p.required ? `${p.required - p.rated} still to rate` : "every skill your roles ask for", href: "/my-skills",
      tone: p.rated === p.required ? "good" : "warn", info: "The skills your roles ask for that you gave a level." },
    { label: "Confirmed", value: `${p.confirmed} of ${p.required}`, hint: p.waiting ? `${p.waiting} waiting for your manager` : p.returned ? `${p.returned} sent back to you` : "by your manager", href: "/my-skills",
      info: "Ratings your manager agreed with or changed. The confirmed level is the one that counts." },
    { label: "On target", value: fmtPct(myPct), hint: myPct == null ?"once something is confirmed" : "of the skills your roles ask for", href: "/my-skills",
      info: "Of the skills your roles ask for, the share where your confirmed level reaches the level asked." },
  ] : [];

  return (
    <>
      <PageHeader title={`Hello ${first}`} description={v.demo ? "Demo mode: made-up people. Switch who you are in the orange bar." : "Your next step, then how things stand."} />

      <NextSteps steps={steps} />
      {mine.length > 0 && <KpiTiles items={mine} />}
      <TaskList tasks={tasksFor(await getMenuFor())} />

      {k && scope && (
        <>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            {scopeName(engine, scope)}
            <Info label="About these numbers">{scope === "*" ? "The whole organisation." : "You and everyone below you, at every level."} Every number links to the page that explains it.</Info>
          </h2>
          <KpiTiles items={tiles} />
          <Section title="Where teams are short" info="Team needs with fewer people at the level than needed, or only one, worst first. Under each: who in the organisation already has it, outside that team."
            actions={<Button asChild size="sm" variant="ghost"><Link href={insights({})}>All insights<ArrowRight /></Link></Button>}>
            <NeedList items={short} empty="Every team need is covered by two or more people." />
          </Section>
        </>
      )}
    </>
  );
}
