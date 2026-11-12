import { redirect } from "next/navigation";
import { asc, eq, inArray, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/heatmap";
import { requireViewer, getEngine, param, type SearchParams } from "@/lib/server";
import { ValidateQueue, type QueuePerson } from "./queue";
import { Pager } from "@/components/pager";

export const metadata = { title: "Validate" };

const PAGE = 25;

export default async function ValidatePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const v = await requireViewer();
  if (!v.reportIds.size) redirect("/");
  const engine = await getEngine();
  const db = await getDb();
  const only = param(sp, "person");
  // who has something waiting: from the in-memory ratings (no query over thousands of ids),
  // then one page of people at a time, whose ratings (with comments) are read from the database
  const waiting = [...v.reportIds].filter((id) => !only || id === only)
    .map((id) => engine.empById.get(id))
    .filter((e): e is NonNullable<typeof e> => !!e && e.active && engine.ratingsOf(e.id).some((r) => r.status === "submitted" && engine.isRateable(r.skillId)))
    .map((e) => ({ e, team: engine.unitById.get(e.unitId ?? "")?.name ?? "" }))
    .sort((a, b) => a.team.localeCompare(b.team) || a.e.name.localeCompare(b.e.name));
  const pages = Math.max(1, Math.ceil(waiting.length / PAGE));
  const pageNo = Math.min(pages, Math.max(1, Number(param(sp, "page")) || 1));
  const slice = waiting.slice((pageNo - 1) * PAGE, pageNo * PAGE);
  const ids = slice.map((x) => x.e.id);
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
  const total = engine.submittedCount(waiting.map((x) => x.e.id));
  const href = (n: number) => `/validate?${new URLSearchParams({ ...(only ? { person: only } : {}), page: String(n) })}`;

  return (
    <>
      <PageHeader title="Validate" description={total ? `${total} rating${total === 1 ? "" : "s"} from ${waiting.length} ${waiting.length === 1 ? "person" : "people"} waiting for you` : "Nothing waiting."} />
      {pages > 1 && <Pager page={pageNo} pages={pages} total={waiting.length} size={PAGE} href={href} noun="people" />}
      {people.length
        ? <ValidateQueue people={people} levels={levels.map((l) => ({ level: l.level, name: l.name, description: l.description }))} />
        : <Empty>No ratings are waiting for validation{only ? " from this person" : ""}.</Empty>}
    </>
  );
}
