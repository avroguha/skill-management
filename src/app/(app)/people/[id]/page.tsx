// A person: their skills (their own level and the confirmed one, against their role's target),
// how far their self-assessment has got, the next grade, and the other teams whose gaps they
// already fill.
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PencilLine, Star } from "lucide-react";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { ViewAsButton } from "@/components/view-as";
import { KpiTiles, Section } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/person-avatar";
import { requireViewer, getViewer, getEngine, canSeeEmployee } from "@/lib/server";
import { getLevels } from "@/lib/levels";
import { withParams } from "@/lib/views";
import { fmtPct, fmtDate } from "@/lib/format";
import { GAP_CLASS, GAP_LABEL, LEVEL_CLASS } from "@/lib/status";
import { photoUrls } from "@/lib/photos";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getViewer();
  if (!v || !canSeeEmployee(v, id)) return { title: "Person" }; // never leak a name in the title
  const engine = await getEngine();
  return { title: engine.empById.get(id)?.name ?? "Person" };
}

const STATUS: Record<string, string> = { draft: "saved, not sent", submitted: "waiting for the manager", validated: "confirmed", returned: "sent back" };

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await requireViewer();
  const engine = await getEngine();
  const e = engine.empById.get(id);
  if (!e || !canSeeEmployee(v, id)) notFound();

  const db = await getDb();
  const [levels, ratings] = await Promise.all([getLevels(), db.select().from(schema.rating).where(eq(schema.rating.employeeId, id))]);
  const profile = engine.personProfile(e);
  const progress = engine.progress(e);
  const self = v.employee?.id === id;
  const role = e.roleId ? engine.roleById.get(e.roleId) : undefined;
  const grade = e.gradeId ? engine.gradeById.get(e.gradeId) : undefined;
  const manager = e.managerId ? engine.empById.get(e.managerId) : undefined;
  const waiting = profile.cells.filter((c) => c.status === "submitted").length;
  const canConfirm = v.reportIds.has(id);
  const fits = engine.fitsFor(e, 5);
  const cells = [...profile.cells].sort((a, b) => Number(b.target != null) - Number(a.target != null)
    || (engine.categoryById.get(engine.skillById.get(a.skillId)!.categoryId)?.sort ?? 0) - (engine.categoryById.get(engine.skillById.get(b.skillId)!.categoryId)?.sort ?? 0)
    || engine.skillLabel(a.skillId).localeCompare(engine.skillLabel(b.skillId)));
  const chain = engine.chainOf(id).filter((m) => canSeeEmployee(v, m.id) && engine.isManager(m));

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><PersonAvatar name={e.name} src={(await photoUrls()).get(id) ?? null} className="size-10" />{e.name}</span>}
        description={[e.title, e.location, e.active ? null : "has left"].filter(Boolean).join(" · ")}
        crumbs={v.canSeeTeams && chain.length ? [...chain.map((m) => ({ label: engine.teamLabel(m.id), href: withParams("/team", { scope: m.id }) })), { label: e.name }] : undefined}
        actions={self ? <Button asChild><Link href="/my-skills"><PencilLine />Update my skills</Link></Button>
          : v.isAdmin && e.active && !v.demo ? <ViewAsButton employeeId={e.id} name={e.name} /> : undefined}
      />
      <KpiTiles items={[
        { label: "On target", value: fmtPct(profile.fitPct), hint: profile.required ? `${profile.met} of ${profile.required} skills their role asks for` : "their role asks for no skills",
          tone: profile.fitPct == null ? "default" : profile.fitPct >= engine.settings.greenAt ? "good" : profile.fitPct >= engine.settings.amberAt ? "warn" : "bad",
          info: "Of the skills this person's role (and grade) asks for, the share where their confirmed level reaches the target." },
        { label: "Their skills", value: progress.state === "not_asked" ? "Optional" : progress.state === "done" ? "Done" : progress.state === "waiting" ? "Waiting" : progress.state === "sent_back" ? "Sent back" : progress.state === "not_started" ? "Not started" : "In progress",
          hint: progress.required ? `${progress.rated} of ${progress.required} rated` : "manages people",
          info: "How far their self-assessment has got. Managers are not asked to rate themselves, but may." },
        { label: "Role", value: role?.name ?? "–", hint: grade ? `Grade ${grade.name}` : "No grade",
          info: "The job role and grade decide which skills a person is expected to have and at what level (Settings › Roles & targets)." },
        { label: "Manager", value: manager?.name ?? "–", hint: manager ? engine.teamLabel(manager.id) : "",
          info: "Who confirms this person's ratings: their direct manager.", href: manager && canSeeEmployee(v, manager.id) ? `/people/${manager.id}` : undefined },
        { label: "To confirm", value: String(waiting), hint: canConfirm ? "on My team" : "with their manager",
          info: "Ratings this person sent that wait for their manager.", href: canConfirm && waiting ? withParams("/team", { tab: "confirm", person: id }) : undefined },
      ]} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Skills"
          info="Their own level (Self) and the one their manager confirmed (Confirmed), against the target their role sets. The colour shows how far the confirmed level is from the target. ★ = wants to grow in it.">
          {cells.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-2 text-left font-medium">Skill</th>
                  <th className="px-2 py-2 text-center font-medium">Target</th>
                  <th className="px-2 py-2 text-center font-medium">Self</th>
                  <th className="px-2 py-2 text-center font-medium">Confirmed</th>
                  <th className="px-2 py-2 text-left font-medium">Where it stands</th>
                </tr></thead>
                <tbody>
                  {cells.map((c) => {
                    const r = ratings.find((x) => x.skillId === c.skillId);
                    return (
                      <tr key={c.skillId} className="border-b align-top last:border-0">
                        <td className="py-2 pr-2">
                          <Link href={`/skills/${c.skillId}`} className="font-medium hover:underline">{engine.skillLabel(c.skillId)}</Link>
                          {c.interest && <Star className="ml-1 inline size-3.5 fill-amber-400 text-amber-500" aria-label="wants to grow in it" />}
                          <div className="text-xs text-muted-foreground">
                            {engine.categoryById.get(engine.skillById.get(c.skillId)!.categoryId)?.name}
                            {c.status ? ` · ${STATUS[c.status] ?? c.status}` : ""}{c.at ? ` · ${fmtDate(c.at)}` : ""}{c.stale ? " · stale" : ""}
                          </div>
                          {(r?.selfComment || r?.managerComment) && <div className="text-xs text-muted-foreground">{r.selfComment && `“${r.selfComment}”`} {r.managerComment && `Manager: “${r.managerComment}”`}</div>}
                        </td>
                        <td className="px-2 py-2 text-center"><Lvl n={c.target} /></td>
                        <td className="px-2 py-2 text-center"><Lvl n={c.selfLevel} /></td>
                        <td className="px-2 py-2 text-center"><Lvl n={c.validatedLevel} /></td>
                        <td className="px-2 py-2">{c.target != null ? <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", GAP_CLASS[c.category])}>{GAP_LABEL[c.category]}</span> : <span className="text-xs text-muted-foreground">beyond role</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted-foreground">No skills yet.{self ? " Open My skills to add yours." : ""}</p>}
        </Section>
        <div className="grid content-start gap-5">
          <Section title="Could strengthen" info="Other teams that are short of a skill this person already has at the level they need. Capability only: whether anyone helps, coaches or moves is a conversation.">
            {fits.length ? (
              <ul className="grid gap-2 text-sm">
                {fits.map((f) => (
                  <li key={f.managerId}>
                    <div className="font-medium">{engine.teamLabel(f.managerId)}</div>
                    <div className="text-xs text-muted-foreground">{f.skills.map((s) => `${engine.skillLabel(s.skillId)} (has ${s.has}, needs ${s.level}+)`).join(", ")}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No other team is short of a skill they have.</p>}
          </Section>
          {profile.nextGrade && (
            <Section title={`Ready for ${profile.nextGrade.grade.name}?`} info="The skills where this person is below what the next grade of their role expects.">
              {profile.nextGrade.missing.length ? (
                <ul className="grid gap-1.5 text-sm">
                  {profile.nextGrade.missing.map((m) => (
                    <li key={m.skillId} className="flex items-center justify-between gap-2">
                      <span className="truncate">{engine.skillLabel(m.skillId)}</span>
                      <span className="text-xs text-muted-foreground tabular">{m.level ?? "–"} → {m.target}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm">Meets every target of the next grade.</p>}
            </Section>
          )}
          <Section title="Levels" info="The scale every rating uses.">
            <ul className="grid gap-1 text-xs">{levels.map((l) => <li key={l.level}><b>{l.level} {l.name}</b> <span className="text-muted-foreground">{l.description}</span></li>)}</ul>
          </Section>
        </div>
      </div>
    </>
  );
}

function Lvl({ n }: { n: number | null }) {
  if (n == null) return <span className="text-muted-foreground">–</span>;
  return <span className={cn("inline-flex size-6 items-center justify-center rounded text-xs font-medium tabular", LEVEL_CLASS[n])}>{n}</span>;
}

