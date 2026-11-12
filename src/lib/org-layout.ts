// Org chart layout, as pure geometry (no React, unit-tested).
//
// The pattern the established org-chart tools share (d3-org-chart, BALKAN OrgChart JS,
// GoJS): a top-down tree, each parent centred over its people, connectors that turn at
// rounded right angles with no arrowheads, and a "compact" block for a large team of
// individual contributors - two columns either side of a spine - so a team of eight
// does not stretch the chart sideways.

export interface TreeIn { id: string; children: TreeIn[] }

export interface Placed { id: string; x: number; y: number; depth: number }
export interface Edge { id: string; source: string; target: string; path: string }
export interface Layout { nodes: Placed[]; edges: Edge[]; width: number; height: number }

export const CARD = {
  w: 240,
  /** the whole node, photo included: the photo overlaps the card's top edge */
  h: 128,
  /** horizontal space between siblings */
  gapX: 28,
  /** from a parent's bottom to its people's top */
  gapY: 64,
  /** between the two compact columns (the spine runs down the middle) */
  spine: 56,
  /** between compact rows */
  rowGap: 24,
  /** between separate trees */
  forestGap: 96,
  /** corner radius of the connectors */
  radius: 10,
} as const;

/** Three or more people and none of them leads anyone (in this view): stack them. */
export const isCompact = (kids: TreeIn[]) => kids.length >= 3 && kids.every((k) => k.children.length === 0);

/** A path from (x1,y1) down to y, across to x2, down to y2 - corners rounded. */
export function elbow(x1: number, y1: number, x2: number, y2: number, midY: number, r: number = CARD.radius): string {
  if (Math.abs(x2 - x1) < 0.5) return `M${x1},${y1}V${y2}`;
  const dir = x2 > x1 ? 1 : -1;
  const rr = Math.min(r, Math.abs(x2 - x1) / 2, (midY - y1), (y2 - midY));
  return [
    `M${x1},${y1}`,
    `V${midY - rr}`,
    `Q${x1},${midY} ${x1 + dir * rr},${midY}`,
    `H${x2 - dir * rr}`,
    `Q${x2},${midY} ${x2},${midY + rr}`,
    `V${y2}`,
  ].join(" ");
}

/** Down the spine from (x,y1) to y2, then across to x2 - one rounded corner. */
export function spineTo(x: number, y1: number, x2: number, y2: number, r: number = CARD.radius): string {
  const dir = x2 > x ? 1 : -1;
  const rr = Math.min(r, Math.abs(x2 - x), y2 - y1);
  return `M${x},${y1} V${y2 - rr} Q${x},${y2} ${x + dir * rr},${y2} H${x2}`;
}

type Measured = { node: TreeIn; width: number; kids: Measured[]; compact: boolean };

function measure(n: TreeIn): Measured {
  const kids = n.children.map(measure);
  const compact = isCompact(n.children);
  let width: number = CARD.w;
  if (compact) width = Math.max(CARD.w, 2 * CARD.w + CARD.spine);
  else if (kids.length) width = Math.max(CARD.w, kids.reduce((a, k) => a + k.width, 0) + CARD.gapX * (kids.length - 1));
  return { node: n, width, kids, compact };
}

/** Places a subtree inside [left, left + width] and returns the centre x of its top card. */
function place(m: Measured, left: number, top: number, depth: number, out: Layout): number {
  out.height = Math.max(out.height, top + CARD.h);
  const py = top + CARD.h;
  const childTop = py + CARD.gapY;
  const put = (centre: number) => { out.nodes.push({ id: m.node.id, x: centre - CARD.w / 2, y: top, depth }); return centre; };

  if (!m.kids.length) return put(left + m.width / 2);

  if (!m.compact) {
    // people first, then the parent centred over the first and last of them
    const total = m.kids.reduce((a, k) => a + k.width, 0) + CARD.gapX * (m.kids.length - 1);
    let cursor = left + (m.width - total) / 2;
    const centres: number[] = [];
    for (const k of m.kids) {
      centres.push(place(k, cursor, childTop, depth + 1, out));
      cursor += k.width + CARD.gapX;
    }
    const px = put((centres[0] + centres[centres.length - 1]) / 2);
    m.kids.forEach((k, i) => out.edges.push({
      id: `${m.node.id}>${k.node.id}`, source: m.node.id, target: k.node.id,
      path: elbow(px, py, centres[i], childTop, py + CARD.gapY / 2),
    }));
    return px;
  }

  const px = put(left + m.width / 2);
  {
    // two columns either side of a spine under the parent; fill row by row
    const spineX = px;
    m.kids.forEach((k, i) => {
      const row = Math.floor(i / 2);
      const right = i % 2 === 1;
      const cx = right ? spineX + CARD.spine / 2 : spineX - CARD.spine / 2 - CARD.w;
      const cy = childTop + row * (CARD.h + CARD.rowGap);
      out.nodes.push({ id: k.node.id, x: cx, y: cy, depth: depth + 1 });
      out.height = Math.max(out.height, cy + CARD.h);
      // to the middle of the card body (below the photo overlap)
      const midY = cy + CARD.h / 2 + 14;
      out.edges.push({ id: `${m.node.id}>${k.node.id}`, source: m.node.id, target: k.node.id, path: spineTo(spineX, py, right ? cx : cx + CARD.w, midY) });
    });
  }
  return px;
}

/** Lay out one or more trees side by side. Children are drawn in the order given. */
export function layoutForest(roots: TreeIn[]): Layout {
  const out: Layout = { nodes: [], edges: [], width: 0, height: 0 };
  let left = 0;
  for (const r of roots) {
    const m = measure(r);
    place(m, left, 0, 0, out);
    left += m.width + CARD.forestGap;
  }
  out.width = Math.max(0, left - CARD.forestGap);
  return out;
}
