"use client";
// Building a chart: what to measure, how to group and split it, which hierarchy, filters and
// the chart type, with a live preview worked out on the server from live data.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save, ChevronsUpDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { previewChart, saveChart } from "@/app/actions/charts";
import { MEASURES, DIMENSIONS, CHART_TYPES, checkSpec, type ChartSpec, type ChartResult, type Measure, type Dimension, type ChartType } from "@/lib/charts/query";
import { substringFilter } from "@/lib/search";
import { ChartCard } from "./chart-card";

type Opt = { id: string; name: string };
export interface ScopeOption { kind: "leader" | "unit"; id: string; label: string; detail: string; group: string }
export interface BuilderOptions {
  scopes: ScopeOption[];
  categories: Opt[];
  skills: (Opt & { categoryId: string; category: string })[];
  roles: Opt[];
  grades: Opt[];
  levels: { level: number; name: string }[];
  thresholds: { greenAt: number; amberAt: number };
}

const PRESETS: { label: string; spec: Partial<ChartSpec>; name: string }[] = [
  { label: "On target by team", name: "On target by team", spec: { measure: "on_target", groupBy: "team", splitBy: "none", type: "bar" } },
  { label: "Team × category heatmap", name: "Capability by team and category", spec: { measure: "on_target", groupBy: "team", splitBy: "category", type: "heatmap" } },
  { label: "Bench depth by category", name: "Bench depth by category", spec: { measure: "ratings", groupBy: "category", splitBy: "level", type: "stacked" } },
  { label: "Skills below target", name: "Skills most often below target", spec: { measure: "below_target", groupBy: "skill", splitBy: "none", type: "hbar", limit: 12 } },
  { label: "Experts per skill", name: "People at level 4+ per skill", spec: { measure: "holders", minLevel: 4, groupBy: "skill", splitBy: "none", type: "hbar", limit: 15 } },
  { label: "People by grade", name: "People by grade", spec: { measure: "people", groupBy: "grade", splitBy: "none", type: "pie" } },
  { label: "Trend", name: "On target, month by month", spec: { measure: "on_target", groupBy: "month", splitBy: "none", type: "line" } },
  { label: "Single number", name: "On target", spec: { measure: "on_target", groupBy: "category", splitBy: "none", type: "kpi" } },
];

const ANY = "__any";

export function ChartBuilder({ initial, options }: { initial: { id?: string; name: string; description: string; spec: ChartSpec }; options: BuilderOptions }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [spec, setSpec] = useState<ChartSpec>(initial.spec);
  const [result, setResult] = useState<ChartResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, startSave] = useTransition();
  const [scopeOpen, setScopeOpen] = useState(false);
  const seq = useRef(0);
  const set = <K extends keyof ChartSpec>(k: K, val: ChartSpec[K]) => setSpec((s) => ({ ...s, [k]: val }));
  const setFilter = (k: keyof ChartSpec["filters"], val: string) => setSpec((s) => ({ ...s, filters: { ...s.filters, [k]: val === ANY ? null : val } }));
  const problem = checkSpec(spec);

  useEffect(() => {
    if (problem) { setResult(null); setError(problem); return; }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await previewChart(spec);
      if (n !== seq.current) return;
      setLoading(false);
      if (r.ok) { setResult(r.result); setError(null); } else { setResult(null); setError(r.error); }
    }, 250);
    return () => clearTimeout(t);
  }, [spec, problem]);

  const scope = options.scopes.find((s) => s.kind === spec.scope.kind && s.id === spec.scope.id);
  const skills = useMemo(() => options.skills.filter((s) => !spec.filters.categoryId || s.categoryId === spec.filters.categoryId), [options.skills, spec.filters.categoryId]);
  const groups = [...new Set(options.scopes.map((s) => s.group))];

  const save = (asNew: boolean) => startSave(async () => {
    const r = await saveChart({ id: asNew ? undefined : initial.id, name: asNew && initial.id ? `${name} (copy)` : name, description, spec });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? "Saved");
    router.push("/charts");
  });

  const field = (label: string, control: React.ReactNode, hint?: string) => (
    <div className="grid gap-1.5"><Label>{label}</Label>{control}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
  );
  const select = (value: string, onChange: (v: string) => void, items: { value: string; label: string; disabled?: boolean }[], aria: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={aria}><SelectValue /></SelectTrigger>
      <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value} disabled={i.disabled}>{i.label}</SelectItem>)}</SelectContent>
    </Select>
  );
  const dimItems = (Object.keys(DIMENSIONS) as Dimension[]).map((d) => ({ value: d, label: DIMENSIONS[d].label }));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <div className="grid content-start gap-4 rounded-lg border bg-card p-4">
        <div className="grid gap-1.5">
          <Label>Start from</Label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p.label} size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                setSpec((s) => ({ ...s, splitBy: "none", minLevel: 3, limit: 15, ...p.spec }));
                if (!name.trim() || PRESETS.some((x) => x.name === name)) setName(p.name);
              }}>{p.label}</Button>
            ))}
          </div>
        </div>
        {field("Name", <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cloud skills by team" />)}
        {field("Hierarchy",
          <Popover open={scopeOpen} onOpenChange={setScopeOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-between font-normal" aria-label="Hierarchy">
                <span className="truncate">{scope ? scope.label : "Choose…"}</span><ChevronsUpDown className="opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
              <Command filter={substringFilter}>
                <CommandInput placeholder="Find a leader or unit…" />
                <CommandList>
                  <CommandEmpty>Nothing matches.</CommandEmpty>
                  {groups.map((g) => (
                    <CommandGroup key={g} heading={g}>
                      {options.scopes.filter((s) => s.group === g).map((s) => (
                        <CommandItem key={`${s.kind}:${s.id}`} value={`${s.label} ${s.detail} ${s.kind}`} onSelect={() => { set("scope", { kind: s.kind, id: s.id }); setScopeOpen(false); }}>
                          <span className="flex-1 truncate">{s.label}</span><span className="truncate text-xs text-muted-foreground">{s.detail}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>,
          "A leader brings everyone below them; a unit brings the units under it.")}
        {field("Show", select(spec.measure, (v) => set("measure", v as Measure), (Object.keys(MEASURES) as Measure[]).map((m) => ({ value: m, label: MEASURES[m].label })), "Measure"),
          MEASURES[spec.measure].hint)}
        {spec.measure === "holders" && field("At level", select(String(spec.minLevel), (v) => set("minLevel", Number(v)),
          options.levels.filter((l) => l.level > 0).map((l) => ({ value: String(l.level), label: `${l.level} ${l.name} or above` })), "At level"))}
        <div className="grid grid-cols-2 gap-3">
          {field("Group by", select(spec.groupBy, (v) => set("groupBy", v as Dimension), dimItems, "Group by"))}
          {field("Split by", select(spec.splitBy, (v) => set("splitBy", v as Dimension | "none"), [{ value: "none", label: "Nothing" }, ...dimItems.filter((d) => d.value !== "month")], "Split by"))}
        </div>
        {field("Chart type", select(spec.type, (v) => set("type", v as ChartType), (Object.keys(CHART_TYPES) as ChartType[]).map((t) => ({ value: t, label: CHART_TYPES[t].label })), "Chart type"))}
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium">Only</legend>
          <div className="grid grid-cols-2 gap-3">
            {select(spec.filters.categoryId ?? ANY, (v) => { setFilter("categoryId", v); setFilter("skillId", ANY); }, [{ value: ANY, label: "Any category" }, ...options.categories.map((c) => ({ value: c.id, label: c.name }))], "Category")}
            {select(spec.filters.skillId ?? ANY, (v) => setFilter("skillId", v), [{ value: ANY, label: "Any skill" }, ...skills.map((s) => ({ value: s.id, label: s.name }))], "Skill")}
            {select(spec.filters.roleId ?? ANY, (v) => setFilter("roleId", v), [{ value: ANY, label: "Any role" }, ...options.roles.map((r) => ({ value: r.id, label: r.name }))], "Role")}
            {select(spec.filters.gradeId ?? ANY, (v) => setFilter("gradeId", v), [{ value: ANY, label: "Any grade" }, ...options.grades.map((g) => ({ value: g.id, label: g.name }))], "Grade")}
          </div>
        </fieldset>
        <div className="grid grid-cols-3 gap-3">
          {field("Levels", select(spec.basis, (v) => set("basis", v as "validated" | "self"), [{ value: "validated", label: "Validated" }, { value: "self", label: "Self" }], "Levels"))}
          {field("Show at most", <Input type="number" min={1} max={60} value={spec.limit} onChange={(e) => set("limit", Number(e.target.value) || 15)} aria-label="Show at most" />)}
          {field("Order", select(spec.sort, (v) => set("sort", v as "value" | "label"), [{ value: "value", label: "Biggest" }, { value: "label", label: "A–Z" }], "Order"))}
        </div>
        {field("Description (optional)", <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the chart is for" />)}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save(false)} disabled={saving || !!problem || name.trim().length < 2}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save</Button>
          {initial.id && <Button variant="outline" onClick={() => save(true)} disabled={saving || !!problem}><Copy />Save as a copy</Button>}
          <Button variant="ghost" asChild><Link href="/charts">Cancel</Link></Button>
        </div>
      </div>

      <div className="grid min-w-0 content-start gap-2">
        {result ? (
          <ChartCard title={name.trim() || "Untitled chart"} description={description} type={spec.type} result={result}
            splitByLevel={spec.splitBy === "level"} thresholds={options.thresholds} height={380}
            className={loading ? "opacity-70 transition-opacity" : undefined} />
        ) : (
          <div className="grid min-h-80 place-items-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {loading ? <Loader2 className="animate-spin" /> : error ?? "Choose a hierarchy to see the chart."}
          </div>
        )}
        {result && error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">Worked out from live data every time it is shown: saving keeps the settings, never a copy of the numbers.</p>
      </div>
    </div>
  );
}
