// Home: what each person has to do, first. Rating your own skills; for a manager, the
// ratings waiting to be confirmed and who has not started; for managers and leaders, the
// headline numbers of their team or the organisation, each one link away from the detail.
import Link from "next/link";
import { ArrowRight, CircleCheck, Hourglass, PencilLine, Undo2, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiTiles, Section, type Kpi } from "@/components/kpi";
import { NeedList } from "@/components/needs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Info } from "@/components/info";
import { requireViewer, getEngine } from "@/lib/server";
import { getLevels, levelNamer } from "@/lib/levels";
import { needView, scopeName, withParams } from "@/lib/views";
import { fmtPct, plural } from "@/lib/format";
import { pctBand } from "@/lib/status";

export const metadata = { title: "Home" };

export default async function Home() {
  const v = await requireViewer();
  const engine = await getEngine();
  const levels = await getLevels();
  const me = v.employee;
  const first = v.name.split(/\s+/)[0];

  // ---- my own skills
  const mine = me ? engine.progress(me) : null;
  const optional = me && !engine.assesses(me);

  // ---- my direct reports: what waits for me
  const direct = me ? engine.directReportsOf(me.id) : [];
  const waitingPeople = direct.map((e) => ({ e, n: engine.ratingsOf(e.id).filter((r) => r.status === "submitted").length })).filter((x) => x.n > 0);
  const waiting = waitingPeople.reduce((t, x) => t + x.n, 0);
  const notStarted = direct.filter((e) => engine.progress(e).state === "not_started");

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

  return (
    <>
      <PageHeader title={`Hello ${first}`} description={v.demo ? "Demo mode: made-up people. Switch who you are in the orange bar." : "What needs you, then how things stand."} />

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        {mine && me && (mine.state !== "not_asked" || engine.ratingsOf(me.id).length > 0 || optional) && (
          <MySkillsCard state={mine.state} rated={mine.rated} required={mine.required} returned={mine.returned} waiting={mine.waiting} drafts={mine.drafts} optional={!!optional} />
        )}
        {direct.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UsersRound className="size-4" />Your team
              <Info label="About your team">The people who report to you directly. You confirm their ratings: agree, change a level, or send one back with a note.</Info>
            </div>
            <p className="mt-2 text-sm">
              {waiting
                ? <><b>{plural(waiting, "rating")}</b> from {plural(waitingPeople.length, "person", "people")} wait for you to confirm.</>
                : "Nothing waits for you to confirm."}
              {notStarted.length ? <> <b>{notStarted.length}</b> of {direct.filter((e) => engine.assesses(e)).length} have not started.</> : null}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {waiting > 0 && <Button asChild size="sm"><Link href="/team?tab=confirm">Review and confirm<ArrowRight /></Link></Button>}
              {notStarted.length > 0 && <Button asChild size="sm" variant="outline"><Link href="/team?tab=people">Remind them</Link></Button>}
              {!waiting && !notStarted.length && <Button asChild size="sm" variant="outline"><Link href="/team">Open my team</Link></Button>}
            </div>
          </div>
        )}
        {!me && v.isAdmin && (
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-semibold">Set up</div>
            <p className="mt-2 text-sm text-muted-foreground">You are signed in with the local administrator account, which is not a person. Everything is set up in Settings: people from ServiceNow, single sign-on, the skill catalogue, roles and e-mail.</p>
            <Button asChild size="sm" className="mt-3"><Link href="/settings">Open Settings<ArrowRight /></Link></Button>
          </div>
        )}
      </div>

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

function MySkillsCard({ state, rated, required, returned, waiting, drafts, optional }: {
  state: string; rated: number; required: number; returned: number; waiting: number; drafts: number; optional: boolean;
}) {
  const text: Record<string, { icon: React.ReactNode; line: string; action: string; primary: boolean }> = {
    not_started: { icon: <PencilLine className="size-4" />, line: `Rate the ${plural(required, "skill")} your role asks for, then send them to your manager. It takes a few minutes.`, action: "Start rating", primary: true },
    in_progress: { icon: <PencilLine className="size-4" />, line: drafts ? `${plural(drafts, "rating")} saved but not sent yet.` : `${required - rated} still to rate.`, action: "Carry on", primary: true },
    sent_back: { icon: <Undo2 className="size-4" />, line: `Your manager sent back ${plural(returned, "rating")} with a note.`, action: "Look at them", primary: true },
    waiting: { icon: <Hourglass className="size-4" />, line: `${plural(waiting, "rating")} wait for your manager to confirm.`, action: "Open my skills", primary: false },
    done: { icon: <CircleCheck className="size-4" />, line: "All done: your manager has confirmed your ratings. Keep them current as you learn.", action: "Open my skills", primary: false },
    not_asked: { icon: <PencilLine className="size-4" />, line: "As a manager you are not asked to rate yourself, but you can add skills you have.", action: "Add my skills", primary: false },
  };
  const t = text[state] ?? text.done;
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {t.icon}My skills{optional ? " (optional)" : ""}
        <Info label="About my skills">Your own levels, from 0 (no exposure) to 5 (expert). Your manager confirms them; the confirmed level is the one that counts.</Info>
      </div>
      {required > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Progress value={(rated / required) * 100} className="h-1.5 flex-1" aria-label="Skills rated" />
          <span className="tabular">{rated} of {required} rated</span>
        </div>
      )}
      <p className="mt-2 text-sm">{t.line}</p>
      <Button asChild size="sm" variant={t.primary ? "default" : "outline"} className="mt-3"><Link href="/my-skills">{t.action}<ArrowRight /></Link></Button>
    </div>
  );
}
