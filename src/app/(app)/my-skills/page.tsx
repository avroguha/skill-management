// My skills: rate your own skills (0-5) and send them to your manager. The skills your role
// asks for first, then the others you have, then the whole catalogue to search and add from,
// on the same page - nothing hidden behind a pop-up.
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/heatmap";
import { requireViewer, getEngine } from "@/lib/server";
import { getLevels } from "@/lib/levels";
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
  const ids = new Set([...required, ...needNote.keys(), ...ratings.map((r) => r.skillId).filter((id) => engine.isRateable(id))]);
  const cat = (sid: string) => engine.categoryById.get(engine.skillById.get(sid)?.categoryId ?? "");
  const rows: Row[] = [...ids].map((sid) => {
    const r = ratings.find((x) => x.skillId === sid);
    return {
      skillId: sid, skill: engine.skillLabel(sid), category: cat(sid)?.name ?? "", categorySort: cat(sid)?.sort ?? 0,
      required: required.has(sid), target: engine.targetFor(me, sid)?.target ?? null,
      level: r?.selfLevel ?? null, comment: r?.selfComment ?? "", interest: r?.interest ?? false,
      status: r?.status ?? null, confirmed: r?.validatedLevel ?? null, managerComment: r?.managerComment ?? "",
      teamNeed: needNote.get(sid) ?? null,
    };
  });
  const catalogue: CatalogueItem[] = [...engine.skillById.values()].filter((s) => engine.isRateable(s.id))
    .map((s) => ({ id: s.id, name: engine.skillLabel(s.id), category: cat(s.id)?.name ?? "", categoryId: s.categoryId, aliases: aliases.get(s.id) ?? [] }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const progress = engine.progress(me);
  const assesses = engine.assesses(me);
  const manager = me.managerId ? engine.empById.get(me.managerId) : undefined;
  const role = me.roleId ? engine.roleById.get(me.roleId) : undefined;
  const roleNote = role
    ? <>Your role is <Link href={`/roles/${role.id}`} className="font-medium text-foreground hover:underline">{role.name}</Link>{me.roleFrom && me.roleFrom !== me.id ? ` (the role of ${engine.teamLabel(me.roleFrom)})` : ""}. </>
    : assesses ? <>You have no role yet, so no particular skills are asked of you: your manager chooses the team&apos;s role. </> : null;

  return (
    <>
      <PageHeader title="My skills"
        description={<>{roleNote}{assesses
          ? `Rate each skill from 0 to 5, then send them to ${manager?.active ? manager.name : "your manager"} to confirm.`
          : "As a manager you are not asked to rate yourself. You can still add the skills you have: they count in your team's capability."}</>} />
      <MySkillsForm rows={rows} catalogue={catalogue} levels={levels}
        categories={[...engine.categoryById.values()].sort((a, b) => a.sort - b.sort).map((c) => ({ id: c.id, name: c.name }))}
        required={progress.required} managerName={manager?.active ? manager.name : null} />
    </>
  );
}
