// My skills: rate your own skills (0-5) and send them to your manager. The skills your roles
// ask for first, then the others you have, then the whole catalogue to search and add from,
// on the same page - nothing hidden behind a pop-up.
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/heatmap";
import { requireViewer, getEngine } from "@/lib/server";
import { getLevels } from "@/lib/levels";
import { getAskCatalogue } from "@/lib/catalogue-view";
import { Section } from "@/components/kpi";
import { RoleChip } from "@/components/role-chip";
import { withParams } from "@/lib/views";
import { MySkillsForm, type Row, type CatalogueItem } from "./form";

export const metadata = { title: "My skills" };

export default async function MySkillsPage() {
  const v = await requireViewer();
  if (!v.employee) {
    return (<><PageHeader title="My skills" /><Empty>Your account is not linked to a person, so there are no skills to rate. An administrator links accounts in Settings › People &amp; access.</Empty></>);
  }
  const me = v.employee;
  const engine = await getEngine();
  const db = await getDb();
  const [levels, ratings, aliasRows] = await Promise.all([
    getLevels(),
    db.select().from(schema.rating).where(eq(schema.rating.employeeId, me.id)),
    db.select({ id: schema.skill.id, aliases: schema.skill.aliases }).from(schema.skill),
  ]);
  const aliases = new Map(aliasRows.map((a) => [a.id, a.aliases]));
  const required = new Set(engine.requiredSkillIds(me));
  // what the person's own team needs is offered for rating too
  const teamNeeds = me.managerId ? engine.demands(me.managerId).filter((d) => d.explicit) : [];
  const needNote = new Map(teamNeeds.map((d) => [d.skillId, `${engine.teamLabel(d.managerId)} needs ${d.headcount} at level ${d.level}+`]));
  // what your manager asks of you alone, beyond your roles, and why
  const mgrFirst = me.managerId ? engine.empById.get(me.managerId)?.name.split(" ")[0] ?? "Your manager" : "Your manager";
  const extras = new Map(engine.extrasOf(me.id).map((x) => [x.skillId, `${mgrFirst} asks this of you${x.note ? `: “${x.note}”` : ""}`]));
  const ids = new Set([...required, ...needNote.keys(), ...ratings.map((r) => r.skillId).filter((id) => engine.isRateable(id))]);
  const cat = (sid: string) => engine.categoryById.get(engine.skillById.get(sid)?.categoryId ?? "");
  const rows: Row[] = [...ids].map((sid) => {
    const r = ratings.find((x) => x.skillId === sid);
    return {
      skillId: sid, skill: engine.skillLabel(sid), category: cat(sid)?.name ?? "", categorySort: cat(sid)?.sort ?? 0,
      required: required.has(sid), target: engine.targetFor(me, sid)?.target ?? null,
      level: r?.selfLevel ?? null, comment: r?.selfComment ?? "", interest: r?.interest ?? false,
      status: r?.status ?? null, confirmed: r?.validatedLevel ?? null, managerComment: r?.managerComment ?? "",
      teamNeed: needNote.get(sid) ?? null, asked: extras.get(sid) ?? null,
    };
  });
  const catalogue: CatalogueItem[] = [...engine.skillById.values()].filter((s) => engine.isRateable(s.id))
    .map((s) => ({ id: s.id, name: engine.skillLabel(s.id), category: cat(s.id)?.name ?? "", categoryId: s.categoryId, aliases: aliases.get(s.id) ?? [] }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const manager = me.managerId ? engine.empById.get(me.managerId) : undefined;
  const progress = engine.progress(me);
  const assesses = engine.assesses(me);
  const roles = me.roleIds.map((id) => engine.roleById.get(id)).filter((r) => !!r);
  const roleNote = roles.length
    ? <>You are in {roles.length === 1 ? "the role" : "the roles"} {roles.map((r, i) => (
      <span key={r.id}>{i > 0 ? (i === roles.length - 1 ? " and " : ", ") : ""}<RoleChip name={r.name} tint={engine.roleTint(r.id)} href={`${withParams("/roles", { team: me.managerId })}#${r.id}`} /></span>
    ))} of {manager ? engine.teamLabel(manager.id) : "your team"}. </>
    : assesses ? (extras.size
      ? <>You are in no role yet; {mgrFirst} asks {extras.size === 1 ? "one skill" : `${extras.size} skills`} of you, listed below. </>
      : <>You are in no role yet, so no particular skills are asked of you: your manager puts you in one. You can already add the skills you have. </>) : null;
  const myRequests = await db.select({ id: schema.catalogueRequest.id }).from(schema.catalogueRequest)
    .where(and(eq(schema.catalogueRequest.requestedById, v.viewAs ? v.viewAs.byUserId : v.userId), inArray(schema.catalogueRequest.status, ["pending", "returned"])));
  // which other teams you would fit in: shown to you only when an administrator switched it on
  const fits = engine.settings.membersSeeFit ? engine.roleFits(me, engine.settings.fitPercent, 6) : [];

  return (
    <>
      <PageHeader title="My skills"
        description={<>{roleNote}{assesses
          ? `Rate each skill from 0 to 5, then send them to ${manager?.active ? manager.name : "your manager"} to confirm.`
          : "As a manager you are not asked to rate yourself. You can still add the skills you have: they count in your team’s capability."}</>} />
      <MySkillsForm rows={rows} catalogue={catalogue} levels={levels}
        categories={[...engine.categoryById.values()].sort((a, b) => a.sort - b.sort).map((c) => ({ id: c.id, name: c.name }))}
        required={progress.required} managerName={manager?.active ? manager.name : null} ask={await getAskCatalogue()} openRequests={myRequests.length} />
      {engine.settings.membersSeeFit && (
        <Section className="mt-5" title="Where your skills would also fit"
          info={`Roles of other teams whose skills you already hold at the level asked, from ${engine.settings.fitPercent}% of the role’s skills upwards, counting the levels your manager confirmed. The manager named is the one you would be under. It shows capability only: whether anyone moves is a conversation. Only you and your managers see this.`}>
          {fits.length ? (
            <ul className="grid gap-2.5 text-sm sm:grid-cols-2">
              {fits.map((f) => (
                <li key={f.roleId} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div><RoleChip name={engine.roleById.get(f.roleId)?.name ?? ""} tint={engine.roleTint(f.roleId)} /> <span className="text-muted-foreground">in {engine.teamLabel(f.managerId)}</span></div>
                    <div className="mt-0.5 text-xs text-muted-foreground">under {engine.empById.get(f.managerId)?.name} · you have {f.matched.length} of its {f.matched.length + f.missing.length} skills
                      {f.missing.length ? ` · not yet: ${f.missing.slice(0, 3).map((m) => engine.skillLabel(m.skillId)).join(", ")}${f.missing.length > 3 ? ` +${f.missing.length - 3}` : ""}` : ""}</div>
                  </div>
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold tabular">{f.pct}%</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No role of another team matches your confirmed skills at {engine.settings.fitPercent}% or more yet.</p>}
        </Section>
      )}
    </>
  );
}
