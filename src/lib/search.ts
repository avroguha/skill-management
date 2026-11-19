// cmdk's default fuzzy match finds "Helm" inside "staKEHoLder Management". Pickers match
// words instead: every word typed is looked for anywhere in the name, in any order, and the
// names that hold more of what was typed come first (src/lib/similar.ts).
import { matchScore } from "./similar.ts";

export function substringFilter(value: string, search: string): number {
  if (value.startsWith("__new__")) return 1; // the "add it" row always shows
  return matchScore(search, value);
}
