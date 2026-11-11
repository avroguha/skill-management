"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Plus, Send, Save, Loader2, MessageSquare, Check, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { saveSelfAssessment } from "@/app/actions/assessment";
import { suggestSkill } from "@/app/actions/team";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { LEVEL_CLASS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { substringFilter } from "@/lib/search";

export interface AssessRow {
  skillId: string; skill: string; category: string; categorySort: number; required: boolean; target: number | null;
  level: number | null; comment: string; interest: boolean; status: string | null; validated: number | null; managerComment: string; teamNeed?: string | null;
}
type Level = { level: number; name: string; description: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
  submitted: { label: "With manager", cls: "bg-accent text-accent-foreground" },
  validated: { label: "Validated", cls: "bg-status-meets text-status-meets-fg" },
  returned: { label: "Sent back", cls: "bg-status-minor text-status-minor-fg" },
};

export function AssessForm({ rows: initial, catalogue, levels, categories, drafts }: {
  rows: AssessRow[]; catalogue: { id: string; name: string; category: string }[]; levels: Level[];
  categories: { id: string; name: string }[]; drafts: string[];
}) {
  const [query, setQuery] = useState("");
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  // after a save the server sends fresh rows (real statuses); take them
  useEffect(() => { setRows(initial); }, [initial]);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [extra, setExtra] = useState(catalogue);

  const update = (id: string, patch: Partial<AssessRow>) => {
    setRows((rs) => rs.map((r) => (r.skillId === id ? { ...r, ...patch } : r)));
    setDirty((d) => new Set(d).add(id));
  };
  const groups = useMemo(() => [...new Map(rows.map((r) => [r.category, r.categorySort])).entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c), [rows]);
  const todo = rows.filter((r) => r.required && r.level == null).length;

  const send = (submit: boolean) => start(async () => {
    const res = await saveSelfAssessment(rows.map((r) => ({ skillId: r.skillId, level: r.level, comment: r.comment, interest: r.interest })), submit);
    if (res.ok) {
      toast.success(res.message ?? "Saved");
      setDirty(new Set());
      router.refresh();
    } else toast.error(res.error);
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="text-sm">
            {todo ? <span><b className="tabular">{todo}</b> required skill{todo === 1 ? "" : "s"} not rated yet</span> : <span>Every required skill has a rating.</span>}
            {dirty.size > 0 && <span className="ml-2 text-xs text-muted-foreground">· {dirty.size} unsaved change{dirty.size === 1 ? "" : "s"}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => send(false)} disabled={pending || !dirty.size}><Save />Save draft</Button>
            <Button size="sm" onClick={() => send(true)} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Send />}Submit for validation</Button>
          </div>
        </div>
        <div className="divide-y">
          {groups.map((g) => (
            <div key={g} className="px-4 py-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g}</div>
              <ul className="grid gap-2">
                {rows.filter((r) => r.category === g).sort((a, b) => Number(b.required) - Number(a.required) || a.skill.localeCompare(b.skill)).map((r) => (
                  <li key={r.skillId} className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="min-w-48 flex-1">
                        <div className="text-sm font-medium">{r.skill}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.required ? `Your role expects ${r.target} ${levels[r.target ?? 0]?.name}` : r.teamNeed ? r.teamNeed : "Not required by your role"}
                          {r.required && r.teamNeed && ` · ${r.teamNeed}`}
                          {r.validated != null && ` · manager validated ${r.validated}`}
                        </div>
                      </div>
                      <div role="radiogroup" aria-label={`${r.skill} level`} className="flex gap-1">
                        {levels.map((l) => (
                          <Tooltip key={l.level}>
                            <TooltipTrigger asChild>
                              <button type="button" role="radio" aria-checked={r.level === l.level}
                                onClick={() => update(r.skillId, { level: r.level === l.level ? null : l.level })}
                                className={cn("size-8 rounded-md border text-xs font-medium tabular transition-colors",
                                  r.level === l.level ? cn(LEVEL_CLASS[l.level], "border-transparent ring-2 ring-primary/40") : "hover:bg-muted",
                                  r.target === l.level && r.level !== l.level && "border-primary/50 border-dashed")}>
                                {l.level}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-60 text-xs"><b>{l.level} {l.name}.</b> {l.description}</TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" aria-pressed={r.interest} onClick={() => update(r.skillId, { interest: !r.interest })}>
                            <Star className={cn("size-4", r.interest ? "fill-chart-3 text-chart-3" : "text-muted-foreground")} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">I want to grow this skill</TooltipContent>
                      </Tooltip>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(open === r.skillId ? null : r.skillId)} aria-label="Comment">
                        <MessageSquare className={cn("size-4", r.comment ? "text-foreground" : "text-muted-foreground")} />
                      </Button>
                      <span className={cn("w-24 rounded px-1.5 py-0.5 text-center text-xs", STATUS[r.status ?? ""]?.cls ?? "text-muted-foreground")}>
                        {STATUS[r.status ?? ""]?.label ?? "Not rated"}
                      </span>
                    </div>
                    {r.status === "returned" && r.managerComment && (
                      <p className="flex items-center gap-1.5 rounded-md bg-status-minor/40 px-2 py-1 text-xs"><Undo2 className="size-3.5" />Your manager: {r.managerComment}</p>
                    )}
                    {open === r.skillId && (
                      <Input autoFocus value={r.comment} onChange={(e) => update(r.skillId, { comment: e.target.value })}
                        placeholder="What you have done with it: projects, certificates, how recently" className="h-8 text-sm" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t px-4 py-3">
          <Popover open={adding} onOpenChange={setAdding}>
            <PopoverTrigger asChild><Button variant="outline" size="sm"><Plus />Add a skill you have</Button></PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <Command filter={substringFilter}>
                <CommandInput placeholder="Find a skill…" value={query} onValueChange={setQuery} />
                <CommandList>
                  <CommandEmpty>Not in the catalogue.</CommandEmpty>
                  {query.trim().length >= 2 && !extra.some((s) => s.name.toLowerCase() === query.trim().toLowerCase()) && (
                    <CommandGroup forceMount>
                      {drafts.some((d) => d.toLowerCase() === query.trim().toLowerCase())
                        ? <div className="px-2 py-1.5 text-xs text-muted-foreground">“{query.trim()}” is already suggested and waiting for an administrator.</div>
                        : (
                          <CommandItem forceMount value={`__new__ ${query}`} onSelect={() => { setSuggesting(query.trim()); setAdding(false); }}>
                            <Plus />Suggest “{query.trim()}” as a new skill
                          </CommandItem>
                        )}
                    </CommandGroup>
                  )}
                  <CommandGroup>
                    {extra.map((s) => (
                      <CommandItem key={s.id} value={`${s.name} ${s.category}`} onSelect={() => {
                        const cat = rows.find((r) => r.category === s.category);
                        setRows((rs) => [...rs, { skillId: s.id, skill: s.name, category: s.category, categorySort: cat?.categorySort ?? 99, required: false, target: null, level: null, comment: "", interest: false, status: null, validated: null, managerComment: "" }]);
                        setExtra((x) => x.filter((y) => y.id !== s.id));
                        setAdding(false);
                      }}>
                        <span className="flex-1 truncate">{s.name}</span><span className="text-xs text-muted-foreground">{s.category}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {suggesting != null && <SuggestDialog name={suggesting} categories={categories} onClose={() => setSuggesting(null)} />}
      <aside className="h-fit rounded-lg border bg-card p-4 xl:sticky xl:top-16">
        <h2 className="mb-2 text-sm font-semibold">How to rate</h2>
        <p className="mb-3 text-xs text-muted-foreground">Rate what you can do on your own today, not what you did once years ago. Your manager validates it; both levels are kept. A dashed box marks your role&apos;s target.</p>
        <ol className="grid gap-2">
          {levels.map((l) => (
            <li key={l.level} className="flex gap-2">
              <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded text-xs font-semibold tabular", LEVEL_CLASS[l.level])}>{l.level}</span>
              <div className="text-xs"><b>{l.name}.</b> <span className="text-muted-foreground">{l.description}</span></div>
            </li>
          ))}
        </ol>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3.5" />Unchanged, validated ratings are not sent again.</p>
      </aside>
    </div>
  );
}

function SuggestDialog({ name: initial, categories, onClose }: { name: string; categories: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Suggest a skill</DialogTitle>
          <DialogDescription>It goes to an administrator, who adds it to the catalogue. You can rate it once it is there.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="sg-name">Skill</Label><Input id="sg-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="sg-desc">What it is (optional)</Label><Input id="sg-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button disabled={pending || name.trim().length < 2} onClick={() => start(async () => {
            const r = await suggestSkill({ name, categoryId, description });
            if (r.ok) { toast.success(r.message ?? "Suggested"); onClose(); router.refresh(); } else toast.error(r.error);
          })}>{pending && <Loader2 className="animate-spin" />}Send suggestion</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
