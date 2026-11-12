// The org chart's geometry: nothing overlaps, parents sit over their people, large teams
// of individual contributors stack in two columns, one connector per reporting line.
import test from "node:test";
import assert from "node:assert/strict";
import { layoutForest, isCompact, elbow, CARD, type TreeIn, type Placed } from "../src/lib/org-layout.ts";

const leaf = (id: string): TreeIn => ({ id, children: [] });
const node = (id: string, ...children: TreeIn[]): TreeIn => ({ id, children });

function overlaps(a: Placed, b: Placed) {
  return a.x < b.x + CARD.w && b.x < a.x + CARD.w && a.y < b.y + CARD.h && b.y < a.y + CARD.h;
}
function assertNoOverlap(nodes: Placed[]) {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    assert.ok(!overlaps(nodes[i], nodes[j]), `${nodes[i].id} overlaps ${nodes[j].id}`);
  }
}

const org = node("ceo",
  node("vp1", node("m1", leaf("a"), leaf("b"), leaf("c"), leaf("d"), leaf("e")), node("m2", leaf("f"), leaf("g"))),
  node("vp2", node("m3", leaf("h"), leaf("i"), leaf("j"))),
  leaf("assistant"),
);

test("nothing overlaps, and there is one connector per reporting line", () => {
  const l = layoutForest([org]);
  assert.equal(l.nodes.length, 17);
  assert.equal(l.edges.length, 16);
  assertNoOverlap(l.nodes);
  assert.ok(l.edges.every((e) => e.path.startsWith("M") && !/NaN/.test(e.path)));
});

test("a parent is centred over its people, one level below the other", () => {
  const l = layoutForest([org]);
  const at = (id: string) => l.nodes.find((n) => n.id === id)!;
  const kids = ["vp1", "vp2", "assistant"].map(at);
  const span = (Math.min(...kids.map((k) => k.x)) + Math.max(...kids.map((k) => k.x))) / 2;
  assert.ok(Math.abs(at("ceo").x - span) < 1, "the top card sits over the middle of its people");
  for (const k of kids) assert.equal(k.y, CARD.h + CARD.gapY);
});

test("three or more individual contributors stack in two columns either side of a spine", () => {
  assert.equal(isCompact([leaf("a"), leaf("b")]), false, "two stay side by side");
  assert.equal(isCompact([leaf("a"), leaf("b"), node("c", leaf("d"))]), false, "not when one of them leads people");
  const l = layoutForest([org]);
  const at = (id: string) => l.nodes.find((n) => n.id === id)!;
  const m1 = at("m1");
  const spine = m1.x + CARD.w / 2;
  for (const id of ["a", "c", "e"]) assert.ok(at(id).x + CARD.w <= spine, `${id} is left of the spine`);
  for (const id of ["b", "d"]) assert.ok(at(id).x >= spine, `${id} is right of the spine`);
  assert.equal(at("a").y, at("b").y, "filled row by row");
  assert.ok(at("c").y > at("a").y);
  const block = layoutForest([node("m", leaf("1"), leaf("2"), leaf("3"), leaf("4"), leaf("5"), leaf("6"), leaf("7"), leaf("8"))]);
  assert.equal(block.width, 2 * CARD.w + CARD.spine, "eight people take two card widths, not eight");
});

test("separate trees sit side by side without touching", () => {
  const l = layoutForest([org, node("other", leaf("x"), leaf("y"))]);
  assertNoOverlap(l.nodes);
  const a = l.nodes.filter((n) => n.id !== "other" && n.id !== "x" && n.id !== "y");
  const b = l.nodes.filter((n) => ["other", "x", "y"].includes(n.id));
  assert.ok(Math.min(...b.map((n) => n.x)) >= Math.max(...a.map((n) => n.x + CARD.w)) + CARD.forestGap - 1);
});

test("connectors turn at rounded corners and run straight when aligned", () => {
  assert.equal(elbow(100, 0, 100, 50, 25), "M100,0V50");
  const p = elbow(0, 0, 200, 60, 30, 10);
  assert.match(p, /^M0,0 V20 Q0,30 10,30 H190 Q200,30 200,40 V60$/);
});
