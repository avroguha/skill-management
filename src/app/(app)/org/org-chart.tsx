"use client";
// The org chart as boxes: the top person centred, their direct reports as columns joined
// by a connector, and each column's own reports stacked down a bracket on the left.
// Three levels at a time; clicking a name goes inside (that person becomes the top).
//
// Fluid: each chart measures the space it has. When the columns do not fit (a phone, a
// narrow window, a wide team) the same three levels are drawn as a vertical bracket tree.
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { BAND_CLASS, pctBand } from "@/lib/status";
import { cn } from "@/lib/utils";
import { InfoPanel, type OrgNode } from "./org-tree";

type Thresholds = { greenAt: number; amberAt: number };
type Href = (id: string) => string;

/** Columns are 20rem with a 2rem gap; the chart needs this much room to draw them. */
const REM = 16;
const columnsNeed = (n: number) => (n * 22 - 2) * REM;

function OrgCard({ n, href, thresholds, top = false }: { n: OrgNode; href: Href; thresholds: Thresholds; top?: boolean }) {
  const lead = n.direct > 0;
  const band = pctBand(n.onTargetPct, thresholds);
  return (
    <div className={cn("relative flex w-full min-w-0 items-center", top ? "max-w-72" : "max-w-64")}>
      <div className={cn("absolute left-0 z-10 rounded-full bg-background p-0.5 shadow-sm ring-2", lead ? "ring-org-lead" : "ring-org-member")}>
        <PersonAvatar name={n.name} src={n.photo} className={top ? "size-14 sm:size-16" : "size-12 sm:size-14"} />
      </div>
      <div className={cn("ml-7 min-w-0 flex-1 rounded-md py-2 pr-1.5 text-white shadow-md sm:ml-8", top ? "min-h-[4.5rem] pl-10 sm:pl-12" : "min-h-16 pl-8 sm:pl-10",
        lead ? "bg-org-lead" : "bg-org-member")}>
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <Link href={href(n.id)} className="truncate text-sm font-semibold hover:underline" title="Go inside">{n.name}</Link>
              <span className="shrink-0 rounded bg-white/15 px-1 text-[10px] font-medium tabular" title="Level below the top">L{n.level}</span>
            </div>
            <div className="truncate text-xs text-white/85" title={n.title}>{n.title || "–"}</div>
          </div>
          <InfoPanel id={n.id} name={n.name} className="size-6 shrink-0 text-white hover:bg-white/15 hover:text-white" />
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/85">
          {n.direct > 0 && (
            <Link href={href(n.id)} className="inline-flex min-w-0 items-center gap-0.5 tabular hover:text-white hover:underline" title="Direct reports · everyone below. Go inside">
              <span className="truncate">{n.direct} direct · {n.total}</span><ChevronRight className="size-3 shrink-0" />
            </Link>
          )}
          <span className={cn("ml-auto shrink-0 rounded px-1.5 py-px text-[11px] font-medium tabular", BAND_CLASS[band])}
            title={n.total ? "Required skill ratings on target, them and everyone below" : "Their required skill ratings on target"}>
            {n.onTargetPct == null ? "·" : `${n.onTargetPct}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * People stacked down a bracket, each joined by an arrow. `below` draws what hangs under a
 * person (the next level, in the vertical tree). The bracket of the last person stops at
 * that person's card, so it is drawn on the card's own box rather than on the whole item.
 */
function Stack({ people, href, thresholds, below }: { people: OrgNode[]; href: Href; thresholds: Thresholds; below?: (n: OrgNode) => React.ReactNode }) {
  return (
    <ul className="ml-5 grid grid-cols-[minmax(0,1fr)] gap-3 pt-3 sm:ml-6">
      {people.map((c, i) => {
        const last = i === people.length - 1;
        return (
          <li key={c.id} className="relative min-w-0 pl-6 sm:pl-7">
            {!last && <span aria-hidden className="absolute left-0 -top-3 h-[calc(100%+0.75rem)] w-0.5 bg-org-line" />}
            <div className="relative">
              {last && <span aria-hidden className="absolute -top-3 -left-6 h-[calc(50%+0.75rem)] w-0.5 bg-org-line sm:-left-7" />}
              <span aria-hidden className="absolute top-1/2 -left-6 h-0.5 w-5 -translate-y-1/2 bg-org-line sm:-left-7 sm:w-6" />
              <span aria-hidden className="absolute top-1/2 -left-2 size-0 -translate-y-1/2 border-y-[5px] border-l-[7px] border-y-transparent border-l-org-line" />
              <OrgCard n={c} href={href} thresholds={thresholds} />
            </div>
            {below?.(c)}
          </li>
        );
      })}
    </ul>
  );
}

function OneChart({ root, kids, href, thresholds }: { root: OrgNode; kids: Map<string, OrgNode[]>; href: Href; thresholds: Thresholds }) {
  const cols = kids.get(root.id) ?? [];
  const box = useRef<HTMLElement>(null);
  // the vertical tree fits any width, so it is what the page first shows (also without
  // JavaScript); the columns replace it once the chart knows there is room for them
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setWide(cols.length > 0 && room >= columnsNeed(cols.length));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols.length]);

  return (
    <section ref={box} className="min-w-0 rounded-lg border bg-card p-3 sm:p-6" aria-label={`Organisation under ${root.name}`}>
      <div>
        {wide ? (
          // Columns are a fixed 20rem with the card (16rem) on their left, so card centres sit at
          // 8rem + k x 22rem. The bar runs between the first and last centre; the top card is
          // moved 2rem left so it sits over the bar's middle for any number of columns.
          <div className="mx-auto flex w-max flex-col items-center">
            <div className="flex w-72 -translate-x-8 flex-col items-center">
              <OrgCard n={root} href={href} thresholds={thresholds} top />
              <span aria-hidden className="h-6 w-0.5 bg-org-line" />
            </div>
            <div className="relative flex items-start gap-8">
              {cols.length > 1 && <span aria-hidden className="absolute top-0 right-48 left-32 h-0.5 bg-org-line" />}
              {cols.map((c) => {
                const grand = kids.get(c.id) ?? [];
                return (
                  <div key={c.id} className="relative w-80 pt-6">
                    <span aria-hidden className="absolute top-0 left-32 h-6 w-0.5 -translate-x-1/2 bg-org-line" />
                    <div className="w-64"><OrgCard n={c} href={href} thresholds={thresholds} /></div>
                    {grand.length > 0 && <Stack people={grand} href={href} thresholds={thresholds} />}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // The same three levels as a vertical tree, as narrow as the screen needs.
          <div className="min-w-0">
            <OrgCard n={root} href={href} thresholds={thresholds} top />
            {cols.length > 0 && (
              <Stack people={cols} href={href} thresholds={thresholds}
                below={(c) => { const g = kids.get(c.id) ?? []; return g.length ? <Stack people={g} href={href} thresholds={thresholds} /> : null; }} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function OrgChart({ rootIds, byId, kids, href, thresholds }: {
  rootIds: string[];
  byId: Map<string, OrgNode>;
  kids: Map<string, OrgNode[]>;
  href: Href;
  thresholds: Thresholds;
}) {
  return (
    <div className="grid min-w-0 gap-6">
      {rootIds.map((id) => byId.get(id)).filter((n): n is OrgNode => !!n).map((root) => (
        <OneChart key={root.id} root={root} kids={kids} href={href} thresholds={thresholds} />
      ))}
    </div>
  );
}
