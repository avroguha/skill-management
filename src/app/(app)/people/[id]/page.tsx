import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { PencilLine } from "lucide-react";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { ViewAsButton } from "@/components/view-as";
import { KpiTiles, Section } from "@/components/kpi";
import { SkillRadar } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { requireViewer, getViewer, getEngine, canSeeEmployee } from "@/lib/server";
import { withParams } from "@/lib/views";
import { fmtPct } from "@/lib/format";
import { PersonSkills, type SkillRow } from "./person-skills";
import { TrainingPlans } from "./training-plans";
import { PersonAvatar } from "@/components/person-avatar";
import { photoUrls } from "@/lib/photos";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getViewer();
  if (!v || !canSeeEmployee(v, id)) return { title: "Person" }; // never leak a name in the title
  const engine = await getEngine();
  return { title: engine.empById.get(id)?.name ?? "Person" };
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await requireViewer();
  const engine = await getEngine();
  const e = engine.empById.get(id);
  if (!e || !canSeeEmployee(v, id)) notFound();

  const db = await getDb();
  const [roles, grades, levelRows, targets, plans] = await Promise.all([
    db.select().from(schema.jobRole),
    db.select().from(schema.grade),
    db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level)),
    db.select().from(schema.employeeTarget).where(eq(schema.employeeTarget.employeeId, id)),
    db.select().from(schema.trainingPlan).where(eq(schema.trainingPlan.employeeId, id)).orderBy(desc(schema.trainingPlan.createdAt)),
  ]);
  const ratings = await db.select().from(schema.rating).where(eq(schema.rating.employeeId, id));
  const levels = levelRows.map((l) => ({ level: l.level, name: l.name, description: l.description }));
  const profile = engine.personProfile(e);
  const self = v.employee?.id === id;
  const canManage = v.reportIds.has(id);

  const role = roles.find((r) => r.id === e.roleId);
  const grade = grades.find((g) => g.id === e.gradeId);
  const unit = e.unitId ? engine.unitById.get(e.unitId) : undefined;
  const manager = e.managerId ? engine.empById.get(e.managerId) : undefined;
  const rows: SkillRow[] = profile.cells.map((c) => {
    const s = engine.skillById.get(c.skillId)!;
    const r = ratings.find((x) => x.skillId === c.skillId);
    const ov = targets.find((t) => t.skillId === c.skillId);
    return {
      skillId: c.skillId, skill: engine.skillLabel(c.skillId), categoryId: s.categoryId,
      category: engine.categoryById.get(s.categoryId)?.name ?? "", categorySort: engine.categoryById.get(s.categoryId)?.sort ?? 0,
      target: c.target, source: c.source, mandatory: c.mandatory, reason: ov?.reason ?? null,
      roleTarget: e.roleId ? engine.targetFor({ ...e, id: `${e.id}#role` }, c.skillId)?.target ?? null : null,
      self: c.selfLevel, validated: c.validatedLevel, category_: c.category, stale: c.stale,
      at: c.at?.toISOString() ?? null, status: c.status, interest: c.interest,
      selfComment: r?.selfComment ?? "", managerComment: r?.managerComment ?? "", evidence: r?.evidence ?? "",
    };
  });
  const next = profile.nextGrade;
  const showName = (sid: string) => engine.skillLabel(sid);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><PersonAvatar name={e.name} src={(await photoUrls()).get(id) ?? null} className="size-10" />{e.name}</span>}
        description={[e.title, unit?.name, e.location].filter(Boolean).join(" · ")}
        crumbs={v.canSeeOrg && unit ? [
          ...[...engine.ancestors(unit.id), unit].filter((u) => v.allUnits || v.unitIds.has(u.id))
            .map((u): { label: string; href?: string } => ({ label: u.name, href: withParams("/", { unit: u.id }) })),
          { label: e.name },
        ] : undefined}
        actions={self ? (engine.isTop(e) ? undefined : <Button asChild><Link href="/assess"><PencilLine />Update my self-assessment</Link></Button>)
          : v.isAdmin && e.active ? <ViewAsButton employeeId={e.id} name={e.name} /> : undefined}
      />
      <KpiTiles items={[
        { label: "Role fit", value: fmtPct(profile.roleFitPct), hint: engine.isTop(e) ? "top of the organisation: no skills required" : `${profile.met} of ${profile.required} required skills on target`, tone: profile.roleFitPct == null ? "default" : profile.roleFitPct >= engine.settings.greenAt ? "good" : profile.roleFitPct >= engine.settings.amberAt ? "warn" : "bad" },
        { label: "Role", value: role?.name ?? "–", hint: grade ? `Grade ${grade.name}` : "No grade" },
        { label: "Manager", value: manager?.name ?? "–", hint: manager?.title ?? "" },
        { label: "Awaiting validation", value: String(profile.cells.filter((c) => c.status === "submitted").length), hint: canManage ? "validate on the Validate page" : "with the manager", href: canManage ? withParams("/validate", { person: id }) : undefined },
        { label: "Stale ratings", value: String(profile.cells.filter((c) => c.stale).length), hint: `older than ${engine.settings.staleMonths} months` },
      ]} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Skills"
          description={canManage ? "Set a different target for this person where their work needs it; the role standard stays as it is." : "Levels: self-assessed, and as validated by the manager. Colour shows the gap to the target."}>
          <PersonSkills rows={rows} levels={levels} employeeId={id} canManage={canManage} />
        </Section>
        <div className="grid content-start gap-5">
          <Section title="Against the role" description="Average level per category: validated, self, and target">
            {profile.byCategory.length >= 3
              ? <SkillRadar data={profile.byCategory.map((c) => ({ name: c.name, target: c.target, level: c.level, self: c.self }))} />
              : <p className="text-sm text-muted-foreground">The chart needs required skills in three or more categories.</p>}
          </Section>
          {next && (
            <Section title={`Ready for ${next.grade.name}?`} description="Skills below the next grade's target">
              {next.missing.length ? (
                <ul className="grid gap-1.5 text-sm">
                  {next.missing.map((m) => (
                    <li key={m.skillId} className="flex items-center justify-between gap-2">
                      <span className="truncate">{showName(m.skillId)}</span>
                      <span className="text-xs text-muted-foreground tabular">{m.level ?? "–"} → {m.target}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm">Meets every target of the next grade.</p>}
            </Section>
          )}
          <Section title="Training plans">
            <TrainingPlans
              employeeId={id}
              canEdit={self || canManage}
              plans={plans.map((p) => ({ id: p.id, skill: showName(p.skillId), title: p.title, link: p.link, targetLevel: p.targetLevel, dueOn: p.dueOn, status: p.status }))}
              gaps={rows.filter((r) => r.target != null && (r.validated ?? -1) < r.target).map((r) => ({ skillId: r.skillId, skill: r.skill, target: r.target! }))}
            />
          </Section>
          {profile.overqualified.length > 0 && (
            <Section title="Well above target" description="Two or more levels over: a mentor, or ready for more">
              <ul className="grid gap-1 text-sm">
                {profile.overqualified.map((c) => (
                  <li key={c.skillId} className="flex justify-between gap-2"><span className="truncate">{showName(c.skillId)}</span><span className="text-xs text-muted-foreground tabular">{c.level} vs {c.target}</span></li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
