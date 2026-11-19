// Finding names as they are typed: a role or a skill that already exists shows up while its
// name (or part of it, or its words in another order, or its initials) is being typed, so
// nobody adds "ITOM ServiceNow" without seeing that "ServiceNow" is there. Pure
// (test/similar.test.ts); used by the name boxes and by every skill picker.

/** A name for comparing: lower case, no accents, punctuation as spaces. */
export function normName(x: string): string {
  return x.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9+#]+/g, " ").trim();
}
/** Two names are the same when they differ only in case, accents, spacing or punctuation. */
export function sameName(a: string, b: string): boolean {
  const x = normName(a).replace(/ /g, "");
  return x !== "" && x === normName(b).replace(/ /g, "");
}

const STOP = new Set(["a", "an", "and", "the", "of", "for", "with", "to", "in", "on", "at", "by"]);
const words = (norm: string) => norm.split(" ").filter((w) => w && !STOP.has(w));

/**
 * How well a typed text finds a name: 0 = not at all, 1 = the same name.
 * Each typed word counts when it is found anywhere in the name (or the name's word in it, or
 * it is the name's initials), in any order; the score is the share of typed words found, so
 * the names matching more of what was typed come first.
 */
export function matchScore(query: string, name: string, aliases: readonly string[] = []): number {
  const q = normName(query);
  if (!q) return 0;
  let best = 0;
  for (const candidate of [name, ...aliases]) {
    const n = normName(candidate);
    if (!n) continue;
    const flat = n.replace(/ /g, "");
    if (q.replace(/ /g, "") === flat) return 1;
    const qw = words(q);
    const nw = words(n);
    if (!qw.length) continue;
    const initials = nw.map((w) => w[0]).join("");
    let hit = 0;
    for (const w of qw) {
      // one or two typed letters only find the start of a word ("it" is not in "site"); longer
      // text is found anywhere. Initials find the long name (SRE, ML).
      const found = (w.length >= 2 && nw.length >= 2 && initials === w)
        || (w.length <= 2 ? nw.some((x) => x.startsWith(w)) : flat.includes(w) || nw.some((x) => x.length >= 4 && w.includes(x)));
      if (found) hit++;
    }
    if (!hit) continue;
    // everything typed was found: rank above partial finds; a name that starts with it, higher
    const share = hit / qw.length;
    const score = share === 1 ? (flat.startsWith(q.replace(/ /g, "")) ? 0.95 : 0.9) : 0.2 + 0.6 * share;
    if (score > best) best = score;
  }
  return best;
}

export interface Named { name: string; aliases?: readonly string[] }
export interface NameMatch<T> { item: T; score: number; same: boolean }

/** The existing names a typed text finds, best first. */
export function findNames<T extends Named>(query: string, items: readonly T[], limit = 8): NameMatch<T>[] {
  const out: NameMatch<T>[] = [];
  for (const item of items) {
    const score = matchScore(query, item.name, item.aliases);
    if (score > 0) out.push({ item, score, same: sameName(query, item.name) });
  }
  out.sort((a, b) => Number(b.same) - Number(a.same) || b.score - a.score || a.item.name.length - b.item.name.length || a.item.name.localeCompare(b.item.name));
  return out.slice(0, limit);
}
