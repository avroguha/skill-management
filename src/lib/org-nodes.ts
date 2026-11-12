// Org chart cards: who reports to whom among the people a viewer may see, with each person's
// level below the top and the share of required skill ratings on target for them and
// everyone below. The roll-ups cover the whole tree, so they are worked out once per data
// version and viewer scope, and cards are then handed out a level at a time.
import { pct, type Engine } from "@/lib/engine/engine";
import type { Viewer } from "@/lib/server";

export interface OrgCard {
  id: string; name: string; title: string; managerId: string | null; level: number;
  direct: number; total: number; onTargetPct: number | null; photo: string | null;
  /** has people below who were not sent: the chart asks for them when opened */
  more?: boolean;
}

interface Forest {
  visible: Set<string>;
  kids: Map<string, string[]>;
  tops: string[];
  depth: Map<string, number>;
  sums: Map<string, { required: number; met: number; total: number }>;
}

const memo = new WeakMap<Engine, Map<string, Forest>>();

export function orgForest(engine: Engine, v: Viewer): Forest {
  const key = v.allUnits ? "*" : `${v.userId}|${v.employee?.id ?? ""}`;
  let byScope = memo.get(engine);
  if (!byScope) { byScope = new Map(); memo.set(engine, byScope); }
  const hit = byScope.get(key);
  if (hit) return hit;

  const active = [...engine.empById.values()].filter((e) => e.active);
  const activeIds = new Set(active.map((e) => e.id));
  const visible = new Set(active.filter((e) => v.allUnits || v.employeeIds.has(e.id)).map((e) => e.id));
  const kids = new Map<string, string[]>();
  for (const id of visible) {
    const m = engine.empById.get(id)!.managerId;
    if (!m || !visible.has(m)) continue;
    const list = kids.get(m);
    if (list) list.push(id); else kids.set(m, [id]);
  }
  const tops = [...visible].filter((id) => { const m = engine.empById.get(id)!.managerId; return !m || !visible.has(m); });

  // level: how far below the top of the whole organisation (through active managers)
  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known != null) return known;
    const chain: string[] = [];
    const seen = new Set<string>();
    let cur: string | null | undefined = id;
    let base = -1;
    while (cur && activeIds.has(cur) && !seen.has(cur)) {
      const k = depth.get(cur);
      if (k != null) { base = k; break; }
      seen.add(cur); chain.push(cur);
      cur = engine.empById.get(cur)?.managerId;
    }
    for (let i = chain.length - 1; i >= 0; i--) depth.set(chain[i], ++base);
    return depth.get(id)!;
  };
  for (const id of visible) depthOf(id);

  // roll-ups bottom up, without recursion (deep chains)
  const sums = new Map<string, { required: number; met: number; total: number }>();
  const order: string[] = [];
  const seen = new Set<string>();
  const stack = [...tops];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id); order.push(id);
    for (const k of kids.get(id) ?? []) stack.push(k);
  }
  for (const id of visible) if (!seen.has(id)) order.push(id); // a loop in the manager chain
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const self = engine.aggregate([engine.empById.get(id)!]);
    const acc = { required: self.required, met: self.met, total: 0 };
    for (const k of kids.get(id) ?? []) {
      const s = sums.get(k);
      if (!s) continue;
      acc.required += s.required; acc.met += s.met; acc.total += s.total + 1;
    }
    sums.set(id, acc);
  }

  const f: Forest = { visible, kids, tops, depth, sums };
  byScope.set(key, f);
  return f;
}

/** Cards for these people; `asTop` ones are drawn without a manager line. */
export function orgCards(engine: Engine, f: Forest, ids: string[], photos: Map<string, string>, loaded: Set<string>, asTop: Set<string> = new Set()): OrgCard[] {
  return ids.filter((id) => f.visible.has(id)).map((id) => {
    const e = engine.empById.get(id)!;
    const s = f.sums.get(id) ?? { required: 0, met: 0, total: 0 };
    const kids = f.kids.get(id) ?? [];
    return {
      id, name: e.name, title: e.title, managerId: asTop.has(id) ? null : e.managerId,
      level: f.depth.get(id) ?? 0, direct: kids.length, total: s.total,
      onTargetPct: pct(s.met, s.required), photo: photos.get(id) ?? null,
      ...(kids.length && !kids.every((k) => loaded.has(k)) ? { more: true } : {}),
    };
  });
}
