"use client";
// Six buttons, 0 to 5: one tap sets a level, a second tap on the same one clears it. Each
// button names its level on hover and to screen readers; the role's target is underlined.
import { cn } from "@/lib/utils";

export interface Level { level: number; name: string; description: string }

export function LevelPicker({ value, onChange, levels, label, target, compare }: {
  value: number | null;
  onChange: (n: number | null) => void;
  levels: Level[];
  label: string;
  /** the role's target: underlined */
  target?: number | null;
  /** another level to show faintly, e.g. what the person said (when a manager confirms) */
  compare?: number | null;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-1">
      {levels.map((l) => {
        const on = value === l.level;
        return (
          <button key={l.level} type="button" role="radio" aria-checked={on} title={`${l.level} ${l.name}: ${l.description}`}
            aria-label={`${l.level} ${l.name}`}
            onClick={() => onChange(on ? null : l.level)}
            className={cn("relative flex size-9 items-center justify-center rounded-md border text-sm font-medium tabular transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
              !on && compare === l.level && "border-dashed border-primary/70",
              target === l.level && !on && "border-primary/60")}>
            {l.level}
            {target === l.level && <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded bg-primary" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
