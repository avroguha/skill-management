// Colour classes for the heatmaps and badges. Management views colour the GAP,
// never the raw level; the raw level scale is used only on a person's own page.
import type { GapCategory, Settings } from "@/lib/engine/engine";

export const GAP_CLASS: Record<GapCategory, string> = {
  meets: "bg-status-meets text-status-meets-fg",
  minor: "bg-status-minor text-status-minor-fg",
  significant: "bg-status-significant text-status-significant-fg",
  critical: "bg-status-critical text-status-critical-fg",
  not_required: "bg-status-none text-status-none-fg",
  unassessed: "hatch text-muted-foreground",
};

export const GAP_LABEL: Record<GapCategory, string> = {
  meets: "Meets or exceeds",
  minor: "1 level below",
  significant: "2 levels below",
  critical: "Critical gap",
  not_required: "Not required",
  unassessed: "Not assessed",
};

export type PctBand = "good" | "watch" | "poor" | "none";

export function pctBand(pct: number | null, s: Pick<Settings, "greenAt" | "amberAt">): PctBand {
  if (pct == null) return "none";
  if (pct >= s.greenAt) return "good";
  if (pct >= s.amberAt) return "watch";
  return "poor";
}

export const BAND_CLASS: Record<PctBand, string> = {
  good: "bg-status-meets text-status-meets-fg",
  watch: "bg-status-minor text-status-minor-fg",
  poor: "bg-status-critical text-status-critical-fg",
  none: "bg-status-none text-status-none-fg",
};

/** The raw 0-5 level as one hue, for a person's own page. */
export const LEVEL_CLASS = [
  "bg-muted text-muted-foreground",
  "bg-primary/10 text-foreground",
  "bg-primary/25 text-foreground",
  "bg-primary/45 text-foreground",
  "bg-primary/70 text-primary-foreground",
  "bg-primary text-primary-foreground",
];

