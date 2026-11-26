// The colour of a role: a soft tint, so a role is easy to tell from the next one wherever
// it shows (its section on the team's page, its chip beside a person's name, the Roles page).
// Every colour is a pastel: one lightness and a low strength, only the hue differs, and it
// is laid thinly over the page's own background. Nothing here can be made bright.
//
// A manager may choose a role's colour from this list. A role without one gets the first
// colour its team does not use yet, so the roles of one team never look the same by default.
// Pure (test/role-colors.test.ts).

export const ROLE_TINTS = [
  { key: "sky", name: "Sky", hue: 240 },
  { key: "peach", name: "Peach", hue: 60 },
  { key: "mint", name: "Mint", hue: 165 },
  { key: "lilac", name: "Lilac", hue: 300 },
  { key: "sand", name: "Sand", hue: 90 },
  { key: "rose", name: "Rose", hue: 5 },
  { key: "aqua", name: "Aqua", hue: 205 },
  { key: "sage", name: "Sage", hue: 140 },
  { key: "coral", name: "Coral", hue: 30 },
  { key: "periwinkle", name: "Periwinkle", hue: 270 },
  { key: "orchid", name: "Orchid", hue: 335 },
  { key: "slate", name: "Slate", hue: 250, grey: true },
] as const;

export type TintKey = (typeof ROLE_TINTS)[number]["key"];
const BY_KEY = new Map<string, (typeof ROLE_TINTS)[number]>(ROLE_TINTS.map((t) => [t.key, t]));

export const isTint = (key: unknown): key is TintKey => typeof key === "string" && BY_KEY.has(key);
export const tintName = (key: string): string => BY_KEY.get(key)?.name ?? "";

/** The first colour of the list that none of these roles uses; when all are used, the one used least. */
export function nextTint(used: readonly (string | null | undefined)[]): TintKey {
  const count = new Map<string, number>();
  for (const u of used) if (isTint(u)) count.set(u, (count.get(u) ?? 0) + 1);
  let best: TintKey = ROLE_TINTS[0].key;
  for (const t of ROLE_TINTS) {
    const n = count.get(t.key) ?? 0;
    if (n === 0) return t.key;
    if (n < (count.get(best) ?? 0)) best = t.key;
  }
  return best;
}

/**
 * The colour of each role of one team, in the team's own order: the one chosen for it, else
 * the next colour the team does not use yet.
 */
export function tintsFor(roles: readonly { id: string; color?: string | null }[]): Map<string, TintKey> {
  const out = new Map<string, TintKey>();
  const used: string[] = roles.map((r) => r.color ?? "").filter(isTint);
  for (const r of roles) {
    if (isTint(r.color)) { out.set(r.id, r.color); continue; }
    const t = nextTint(used);
    used.push(t);
    out.set(r.id, t);
  }
  return out;
}

/** The colour itself, for the --tint variable the tint classes in globals.css read. */
export function tintColor(key: string | null | undefined): string {
  const t = BY_KEY.get(key ?? "") ?? ROLE_TINTS[0];
  return `oklch(0.74 ${"grey" in t ? 0.02 : 0.1} ${t.hue})`;
}

/** style={...} for an element that uses the tint classes. */
export function tintStyle(key: string | null | undefined): Record<string, string> {
  return { "--tint": tintColor(key) };
}
