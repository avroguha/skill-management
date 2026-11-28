// A person: their skills (their own level and the confirmed one, against what their roles ask
// for), how far their self-assessment has got, the roles of other teams their skills match,
// and the other teams whose gaps they already fill.
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PencilLine, Star } from "lucide-react";
import { getDb, schema } from "@/db";
import { readEmailSettings } from "@/lib/mail/notify";
import { RemindTeam } from "@/app/(app)/team/remind";
import { PageHeader } from "@/components/page-header";
import { ViewAsButton } from "@/components/view-as";
import { KpiTiles, Section } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/person-avatar";
import { requireViewer, getViewer, getEngine, canSeeEmployee } from "@/lib/server";
import { maySeeFit } from "@/lib/access";
import { RoleChip } from "@/components/role-chip";
import { getLevels } from "@/lib/levels";
import { withParams } from "@/lib/views";
import { fmtPct, fmtDate } from "@/lib/format";
import { GAP_CLASS, GAP_LABEL, LEVEL_CLASS } from "@/lib/status";
import { photoUrls } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { SkillLink } from "@/components/menus";

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
  const roles = e.roleIds.map((rid) => engine.roleById.get(rid)).filter((r) => !!r);
  const grade = e.gradeId ? engine.gradeById.get(e.gradeId) : undefined;
  const manager = e.managerId ? engine.empById.get(e.managerId) : undefined;
  const waiting = profile.cells.filter((c) => c.status === "submitted").length;
  const canConfirm = v.reportIds.has(id);
  // where their skills would also fit: for their managers (and leaders, administrators); for
  // the person themselves only when an administrator switched that on
  const seesFit = maySeeFit(v, self, engine.settings.membersSeeFit);
  const fits = seesFit ? engine.fitsFor(e, 5) : [];
  const cells = [...profile.cells].sort((a, b) => Number(b.target != null) - Number(a.target != null)
    || (engine.categoryById.get(engine.skillById.get(a.skillId)!.categoryId)?.sort ?? 0) - (engine.categoryById.get(engine.skillById.get(b.skillId)!.categoryId)?.sort ?? 0)
    || engine.skillLabel(a.skillId).localeCompare(engine.skillLabel(b.skillId)));
  const roleFits = seesFit ? engine.roleFits(e, engine.settings.fitPercent, 6) : [];
  const rolesHref = (roleId: string) => `${withParams("/roles", { team: e.managerId })}#${roleId}`;
  const mayPutInRole = e.active && !self && !!e.managerId && (v.isAdmin || v.manageIds.has(e.managerId));
  const chain = engine.chainOf(id).filter((m) => canSeeEmployee(v, m.id) && engine.isManager(m));
  // their own manager can remind them from here, as from My team
  const remind = canConfirm && progress.needsAction && (v.demo || (await readEmailSettings(db)).enabled)
    ? [{ id: e.id, name: e.name, state: progress.state === "sent_back" ? "Sent back" : progress.state === "not_started" ? "Not started" : "In progress", progress: progress.required ? `${progress.rated} of ${progress.required} rated` : "" }] : [];
  const nothingConfirmed = profile.required > 0 && !progress.confirmed;
  const extras = new Map(engine.extrasOf(id).map((x) => [x.skillId, x]));

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><PersonAvatar name={e.name} src={(await photoUrls()).get(id) ?? null} size="lg" />{e.name}</span>}
        description={<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">{[e.title, grade ? `grade ${grade.name}` : null, e.location, e.active ? null : "has left"].filter(Boolean).join(" · ")}
          {roles.map((r) => <RoleChip key={r.id} name={r.name} tint={engine.roleTint(r.id)} href={rolesHref(r.id)} />)}</span>}
        crumbs={v.canSeeTeams && chain.length ? [...chain.map((m) => ({ label: engine.teamLabel(m.id), href: withParams("/team", { scope: m.id }) })), { label: e.name }] : undefined}
        actions={self ? <Button asChild><Link href="/my-skills"><PencilLine />Update my skills</Link></Button>
          : (remind.length || (v.isAdmin && e.active && !v.demo)) ? <>{remind.length > 0 && <RemindTeam people={remind} label="Remind" />}{v.isAdmin && e.active && !v.demo && <ViewAsButton employeeId={e.id} name={e.name} />}</> : undefined}
      />
      <KpiTiles items={[
        { label: "On target", value: nothingConfirmed ? "–" : fmtPct(profile.fitPct),
          hint: nothingConfirmed ? (progress.waiting ? "waiting for their manager to confirm" : "nothing confirmed yet") : profile.required ? `${profile.met} of ${profile.required} skills their roles ask for` : roles.length ? "their roles ask for no skills" : "in no role yet",
          tone: nothingConfirmed || profile.fitPct == null ? "default" : profile.fitPct >= engine.settings.greenAt ? "good" : profile.fitPct >= engine.settings.amberAt ? "warn" : "bad",
          info: "Of the skills this person’s roles ask for, the share where their confirmed level reaches the level asked." },
        { label: "Their skills", value: progress.state === "not_asked" ? "Optional" : progress.state === "done" ? "Done" : progress.state === "waiting" ? "Waiting" : progress.state === "sent_back" ? "Sent back" : progress.state === "not_started" ? "Not started" : "In progress",
          hint: progress.required ? `${progress.rated} of ${progress.required} rated` : "manages people",
          info: "How far their self-assessment has got. Managers are not asked to rate themselves, but may." },
        ...(roles.length ? [] : [{ label: "Role", value: "None yet", href: mayPutInRole && manager ? withParams("/team", { scope: manager.id, tab: "people" }) : undefined,
          hint: mayPutInRole ? "put them in one on My team" : "their manager puts them in one",
          info: "A person is asked to rate the skills of the roles they are in. Their manager puts them in a role (My team › People and roles); a person can be in several." }]),
        { label: "Manager", value: manager?.name ?? "–", person: manager ? { name: manager.name, src: (await photoUrls()).get(manager.id) ?? null } : undefined, hint: manager ? engine.teamLabel(manager.id) : "",
          info: "Who confirms this person’s ratings: their direct manager.", href: manager && canSeeEmployee(v, manager.id) ? `/people/${manager.id}` : undefined },
        { label: "To confirm", value: String(waiting), hint: canConfirm ? "on My team" : "with their manager",
          info: "Ratings this person sent that wait for their manager.", href: canConfirm && waiting ? withParams("/team", { tab: "confirm", person: id }) : undefined },
      ]} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Skills"
          info="Their own level (Self) and the one their manager confirmed (Confirmed), against the level their roles ask for, or their manager asks of them alone (Target). The colour shows how far the confirmed level is from the target. ★ = wants to grow in it.">
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
                          <SkillLink id={c.skillId} name={engine.skillLabel(c.skillId)} />
                          {c.interest && <Star className="ml-1 inline size-3.5 fill-amber-400 text-amber-500" aria-label="wants to grow in it" />}
                          <div className="text-xs text-muted-foreground">
                            {engine.categoryById.get(engine.skillById.get(c.skillId)!.categoryId)?.name}
                            {c.status ? ` · ${STATUS[c.status] ?? c.status}` : ""}{c.at ? ` · ${fmtDate(c.at)}` : ""}{c.stale ? " · stale" : ""}
                          </div>
                          {extras.has(c.skillId) && <div className="text-xs text-muted-foreground"><span className="rounded bg-amber-500/10 px-1 font-medium text-foreground">Asked of them alone</span>{extras.get(c.skillId)!.note ? ` · “${extras.get(c.skillId)!.note}”` : ""}</div>}
                          {(r?.selfComment || r?.managerComment) && <div className="text-xs text-muted-foreground">{r.selfComment && `“${r.selfComment}”`} {r.managerComment && `Manager: “${r.managerComment}”`}</div>}
                        </td>
                        <td className="px-2 py-2 text-center"><Lvl n={c.target} /></td>
                        <td className="px-2 py-2 text-center"><Lvl n={c.selfLevel} /></td>
                        <td className="px-2 py-2 text-center"><Lvl n={c.validatedLevel} /></td>
                        <td className="px-2 py-2">{c.target != null ? <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", c.category === "unassessed" ? "border border-dashed text-muted-foreground" : GAP_CLASS[c.category])}>{c.category === "unassessed" && c.status === "submitted" ? "Waiting to confirm" : GAP_LABEL[c.category]}</span> : <span className="text-xs text-muted-foreground">beyond their roles</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted-foreground">No skills yet.{self ? " Open My skills to add yours." : ""}</p>}
        </Section>
        <div className="grid content-start gap-5">
          {seesFit && <Section title="Could strengthen" info="Other teams that are short of a skill this person already has at the level they need. Capability only: whether anyone helps, coaches or moves is a conversation.">
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
          </Section>}
          {seesFit && (
            <Section title="Fits in other teams" info={`Roles of other teams whose skills this person already holds at the level asked, from ${engine.settings.fitPercent}% of the role’s skills upwards (an administrator sets that number in Settings › Levels & rules). The manager named is the one they would be under. Capability only: whether anyone moves is a conversation.`}>
              {roleFits.length ? (
                <ul className="grid gap-2.5 text-sm">
                  {roleFits.map((f) => (
                    <li key={f.roleId} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium"><RoleChip name={engine.roleById.get(f.roleId)?.name ?? ""} tint={engine.roleTint(f.roleId)} href={v.allPeople || v.manageIds.has(f.managerId) ? `${withParams("/roles", { team: f.managerId })}#${f.roleId}` : undefined} /> <span className="font-normal text-muted-foreground">in {engine.teamLabel(f.managerId)}</span></div>
                        <div className="text-xs text-muted-foreground">under {engine.empById.get(f.managerId)?.name} · has {f.matched.length} of {f.matched.length + f.missing.length} skills
                          {f.missing.length ? ` · not yet: ${f.missing.slice(0, 3).map((m) => engine.skillLabel(m.skillId)).join(", ")}${f.missing.length > 3 ? ` +${f.missing.length - 3}` : ""}` : ""}</div>
                      </div>
                      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold tabular">{f.pct}%</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">No role of another team matches at {engine.settings.fitPercent}% or more.</p>}
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

