import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/heatmap";
import { requireViewer, getEngine } from "@/lib/server";
import { fmtDate } from "@/lib/format";
import { AssessForm, type AssessRow } from "./assess-form";

export const metadata = { title: "Self-assessment" };

export default async function AssessPage() {
  const v = await requireViewer();
  if (!v.employee) {
    return (<><PageHeader title="Self-assessment" /><Empty>Your account is not linked to an employee record, so there is nothing to assess. An administrator links accounts in Admin › Users.</Empty></>);
  }
  const engine = await getEngine();
  const db = await getDb();
  const [levels, ratings, cycles] = await Promise.all([
    db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level)),
    db.select().from(schema.rating).where(eq(schema.rating.employeeId, v.employee.id)),
    db.select().from(schema.assessmentCycle).where(eq(schema.assessmentCycle.status, "open")),
  ]);
  const cycle = cycles[0];
  const drafts = await db.select({ name: schema.skill.name }).from(schema.skill).where(eq(schema.skill.status, "draft"));
  const required = new Set(engine.requiredSkillIds(v.employee));
  // What the person's team (and the units above it) say they need: offered for rating too.
  const unitChain = v.employee.unitId ? [v.employee.unitId, ...engine.ancestors(v.employee.unitId).map((u) => u.id)] : [];
  const needs = unitChain.length
    ? await db.select().from(schema.unitRequirement).where(inArray(schema.unitRequirement.unitId, unitChain))
    : [];
  const teamNeed = new Map<string, string>();
  for (const n of needs) {
    if (!engine.isRateable(n.skillId) || teamNeed.has(n.skillId)) continue;
    const u = engine.unitById.get(n.unitId)?.name ?? "Your team";
    teamNeed.set(n.skillId, `${u} needs ${n.headcount} at ${levels.find((l) => l.level === n.minLevel)?.name ?? n.minLevel}`);
  }
  const ids = new Set([...required, ...teamNeed.keys(), ...ratings.map((r) => r.skillId).filter((id) => engine.isRateable(id))]);
  const rows: AssessRow[] = [...ids].map((sid) => {
    const s = engine.skillById.get(sid)!;
    const r = ratings.find((x) => x.skillId === sid);
    const t = engine.targetFor(v.employee!, sid);
    return {
      skillId: sid, skill: engine.skillLabel(sid), category: engine.categoryById.get(s.categoryId)?.name ?? "",
      categorySort: engine.categoryById.get(s.categoryId)?.sort ?? 0, required: required.has(sid), target: t?.target ?? null,
      level: r?.selfLevel ?? null, comment: r?.selfComment ?? "", interest: r?.interest ?? false,
      status: r?.status ?? null, validated: r?.validatedLevel ?? null, managerComment: r?.managerComment ?? "",
      teamNeed: teamNeed.get(sid) ?? null,
    };
  });
  const catalogue = [...engine.skillById.values()].filter((s) => engine.isRateable(s.id) && !ids.has(s.id))
    .map((s) => ({ id: s.id, name: engine.skillLabel(s.id), category: engine.categoryById.get(s.categoryId)?.name ?? "" }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title="Self-assessment"
        description={cycle ? `${cycle.name} · due ${fmtDate(cycle.dueOn)}` : "No assessment cycle is open; you can still keep your skills current."}
      />
      <AssessForm rows={rows} catalogue={catalogue} levels={levels.map((l) => ({ level: l.level, name: l.name, description: l.description }))}
        categories={[...engine.categoryById.values()].sort((a, b) => a.sort - b.sort).map((c) => ({ id: c.id, name: c.name }))}
        drafts={drafts.map((d) => d.name)} />
    </>
  );
}
