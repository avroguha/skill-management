// One option in a skill picker: the whole name (skill names are long, e.g.
// "Infrastructure as code › Terraform modules, state and remote back ends"),
// wrapped rather than cut off, with its category underneath.

/** Wide enough for most names on one line, never wider than the screen. */
export const SKILL_PICKER_CLASS = "w-[min(36rem,calc(100vw-2rem))] p-0";
/** Wrapped names take more room: show more of the list at once. */
export const SKILL_LIST_CLASS = "max-h-[min(24rem,60vh)]";

export function SkillOption({ name, category }: { name: string; category: string }) {
  return (
    <span className="grid min-w-0 flex-1 gap-0.5 text-left">
      <span className="leading-snug break-words whitespace-normal">{name}</span>
      <span className="text-xs text-muted-foreground">{category}</span>
    </span>
  );
}
