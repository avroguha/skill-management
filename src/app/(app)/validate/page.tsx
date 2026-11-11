import { redirect } from "next/navigation";
import { asc, eq, inArray, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/heatmap";
import { requireViewer, getEngine, param, type SearchParams } from "@/lib/server";
import { ValidateQueue, type QueuePerson } from "./queue";

export const metadata = { title: "Validate" };

export default async function ValidatePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireViewer();
  if (!v.reportIds.size) redirect("/");
  const engine = await getEngine();
  const db = await getDb();
  const only = param(sp, "person");
  const ids = [...v.reportIds].filter((id) => !only || id === only);
  const levels = await db.select().from(schema.proficiencyLevel).orderBy(asc(schema.proficiencyLevel.level));
  const pending = ids.length
    ? await db.select().from(schema.rating).where(and(inArray(schema.rating.employeeId, ids), eq(schema.rating.status, "submitted")))
    : [];
  const byPerson = new Map<string, typeof pending>();
  for (const r of pending) {
    if (!engine.isRateable(r.skillId)) continue;
    byPerson.set(r.employeeId, [...(byPerson.get(r.employeeId) ?? []), r]);
  }
  const people: QueuePerson[] = [...byPerson.entries()].map(([eid, rs]) => {
    const e = engine.empById.get(eid)!;
    return {
      id: eid, name: e.name, title: e.title, team: engine.unitById.get(e.unitId ?? "")?.name ?? "",
      items: rs.map((r) => ({
        skillId: r.skillId, skill: engine.skillLabel(r.skillId),
        target: engine.targetFor(e, r.skillId)?.target ?? null,
        self: r.selfLevel ?? 0, previous: r.validatedLevel, comment: r.selfComment,
        submitted: r.selfAt?.toISOString() ?? null,
      })).sort((a, b) => a.skill.localeCompare(b.skill)),
    };
  }).filter((p) => p.items.length).sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
  const total = people.reduce((s, p) => s + p.items.length, 0);

  return (
    <>
      <PageHeader title="Validate" description={total ? `${total} rating${total === 1 ? "" : "s"} from ${people.length} ${people.length === 1 ? "person" : "people"} waiting for you` : "Nothing waiting."} />
      {people.length
        ? <ValidateQueue people={people} levels={levels.map((l) => ({ level: l.level, name: l.name, description: l.description }))} />
        : <Empty>No ratings are waiting for validation{only ? " from this person" : ""}.</Empty>}
    </>
  );
}
