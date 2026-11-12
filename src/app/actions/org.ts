"use server";
// The "i" panel of the org tree: the details of one person and the capability of
// everyone under them. Loaded when the panel opens, not with the tree.
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { actionViewer, canSeeEmployee, getEngine } from "@/lib/server";
import { orgForest, orgCards, type OrgCard } from "@/lib/org-nodes";
import { photoUrls } from "@/lib/photos";

export interface OrgInfo {
  userName: string | null; email: string; manager: string | null; unit: string | null; role: string | null; grade: string | null;
  location: string; source: string; userType: string; syncedAt: string | null;
  direct: number; total: number; onTargetPct: number | null; assessedPct: number | null;
  weakest: { skill: string; met: number; required: number }[];
  shortNeeds: { skill: string; have: number; need: number; unit: string }[];
}

export async function orgInfo(id: string): Promise<{ ok: true; info: OrgInfo } | { ok: false; error: string }> {
  try {
    const v = await actionViewer({ read: true });
    if (!canSeeEmployee(v, id)) return { ok: false, error: "Not allowed." };
    const engine = await getEngine();
    const db = await getDb();
    const [row] = await db.select().from(schema.employee).where(eq(schema.employee.id, id));
    if (!row) return { ok: false, error: "Not found." };
    const [roles, grades] = await Promise.all([
      db.select().from(schema.jobRole).orderBy(asc(schema.jobRole.name)),
      db.select().from(schema.grade),
    ]);

    // everyone under this person through the manager chain, and them
    const kids = new Map<string, string[]>();
    for (const e of engine.empById.values()) {
      if (!e.active || !e.managerId) continue;
      kids.set(e.managerId, [...(kids.get(e.managerId) ?? []), e.id]);
    }
    const subtree: string[] = [];
    const stack = [id];
    const seen = new Set<string>();
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      subtree.push(x);
      stack.push(...(kids.get(x) ?? []));
    }
    const emps = subtree.map((x) => engine.empById.get(x)!).filter((e) => e?.active);
    const agg = engine.aggregate(emps);

    // weakest skills below: lowest share on target, among skills two or more people need
    const per = new Map<string, { met: number; required: number }>();
    for (const e of emps) for (const sid of engine.requiredSkillIds(e)) {
      const c = engine.cell(e, sid);
      const p = per.get(sid) ?? { met: 0, required: 0 };
      p.required += 1;
      if (c.met) p.met += 1;
      per.set(sid, p);
    }
    const weakest = [...per.entries()].filter(([, p]) => p.required >= 2)
      .sort((a, b) => a[1].met / a[1].required - b[1].met / b[1].required || b[1].required - a[1].required)
      .slice(0, 4).map(([sid, p]) => ({ skill: engine.skillLabel(sid), ...p }));

    const shortNeeds = engine.managedUnitIds(id).flatMap((u) => engine.shortNeeds(u))
      .filter((c) => c.shortfall > 0).slice(0, 5)
      .map((c) => ({ skill: engine.skillLabel(c.skillId), have: c.count, need: c.headcount, unit: engine.unitById.get(c.unitId)?.name ?? "" }));

    const e = engine.empById.get(id)!;
    return {
      ok: true,
      info: {
        userName: row.userName, email: row.email,
        manager: e.managerId ? engine.empById.get(e.managerId)?.name ?? null : null,
        unit: e.unitId ? engine.unitById.get(e.unitId)?.name ?? null : null,
        role: roles.find((r) => r.id === row.roleId)?.name ?? null,
        grade: grades.find((g) => g.id === row.gradeId)?.name ?? null,
        location: row.location, source: row.source, userType: row.userType,
        syncedAt: row.syncedAt?.toISOString() ?? null,
        direct: kids.get(id)?.length ?? 0, total: emps.length - 1,
        onTargetPct: agg.pct, assessedPct: agg.required ? Math.round((agg.assessed / agg.required) * 100) : null,
        weakest, shortNeeds,
      },
    };
  } catch (err) { return { ok: false, error: (err as Error).message }; }
}

/** Find people in the org chart the viewer may see (the chart holds only what is open). */
export async function findInOrg(query: string): Promise<{ id: string; name: string; title: string; level: number }[]> {
  const v = await actionViewer({ read: true });
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const engine = await getEngine();
  const f = orgForest(engine, v);
  const out: { id: string; name: string; title: string; level: number }[] = [];
  for (const id of f.visible) {
    const e = engine.empById.get(id)!;
    if (!`${e.name} ${e.title} ${e.email}`.toLowerCase().includes(q)) continue;
    out.push({ id, name: e.name, title: e.title, level: f.depth.get(id) ?? 0 });
    if (out.length >= 12) break;
  }
  return out;
}

/** The people reporting to one person, as cards, when their card is expanded. */
export async function orgChildren(id: string): Promise<{ ok: true; nodes: OrgCard[] } | { ok: false; error: string }> {
  try {
    const v = await actionViewer({ read: true });
    if (!canSeeEmployee(v, id)) return { ok: false, error: "Not allowed." };
    const engine = await getEngine();
    const f = orgForest(engine, v);
    const kids = f.kids.get(id) ?? [];
    const nodes = orgCards(engine, f, kids, await photoUrls(), new Set(kids))
      .map((n) => ({ ...n, more: n.direct > 0 || undefined }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, nodes };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
