// "What do you want to do?": everything this person can do, in their own words, each line
// one click from the page where it is done. Grouped like the menu. The same list is behind
// Find in the top bar.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/kpi";
import type { Task } from "@/lib/menu";

export function TaskList({ tasks }: { tasks: Task[] }) {
  if (!tasks.length) return null;
  const groups = new Map<string, Task[]>();
  for (const t of tasks) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  return (
    <Section className="mb-5" title="What do you want to do?"
      info="Everything you can do here, in plain words. Each line opens the page where it is done. The same list is behind the box at the top of every page (Ctrl+K): type a word and pick.">
      <div className="-mb-4 gap-x-8 sm:columns-2 xl:columns-3">
        {[...groups.entries()].map(([label, list]) => (
          <div key={label} className="mb-4 min-w-0 break-inside-avoid">
            <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</h3>
            <ul>
              {list.map((t) => (
                <li key={t.key}>
                  <Link href={t.href} className="-mx-1.5 flex items-start gap-1.5 rounded px-1.5 py-1 text-sm transition-colors hover:bg-accent/60">
                    <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />{t.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
