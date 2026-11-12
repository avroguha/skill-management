"use client";
// One filter toolbar for every view. All state lives in the URL, so every view is
// linkable and the back button works. Filters are chips/buttons in a row, never a form.
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronsUpDown, Network, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { substringFilter } from "@/lib/search";

export interface UnitOption { id: string; name: string; depth: number; kind: string }
export interface Option { id: string; name: string }

export function useSetParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { params, set, pending };
}

export function UnitPicker({ units, value, paramName = "unit" }: { units: UnitOption[]; value: string | null; paramName?: string }) {
  const { set } = useSetParams();
  const [open, setOpen] = useState(false);
  const current = units.find((u) => u.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 max-w-64 justify-between gap-2" aria-label="Organisation unit">
          <Network className="size-3.5 text-muted-foreground" />
          <span className="truncate">{current?.name ?? "Choose a unit"}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command filter={substringFilter}>
          <CommandInput placeholder="Find a unit…" />
          <CommandList>
            <CommandEmpty>No unit found.</CommandEmpty>
            <CommandGroup>
              {units.map((u) => (
                <CommandItem key={u.id} value={`${u.name} ${u.id}`} onSelect={() => { set({ [paramName]: u.id }); setOpen(false); }}>
                  <span style={{ paddingLeft: u.depth * 12 }} className="flex-1 truncate">{u.name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{u.kind}</span>
                  <Check className={cn("size-3.5", u.id === value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SelectFilter({ name, label, options, value, allLabel }: {
  name: string; label: string; options: Option[]; value: string | null; allLabel: string;
}) {
  const { set } = useSetParams();
  return (
    <Select value={value ?? "__all"} onValueChange={(v) => set({ [name]: v === "__all" ? null : v })}>
      <SelectTrigger size="sm" className={cn("h-8 min-w-36", value && "border-primary/50 bg-accent")} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{allLabel}</SelectItem>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function SegmentFilter({ name, value, options, defaultValue }: {
  name: string; value: string; options: { value: string; label: string }[]; defaultValue: string;
}) {
  const { set } = useSetParams();
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={value}
      onValueChange={(v) => v && set({ [name]: v === defaultValue ? null : v })}>
      {options.map((o) => <ToggleGroupItem key={o.value} value={o.value} className="h-8 px-2.5 text-xs">{o.label}</ToggleGroupItem>)}
    </ToggleGroup>
  );
}

export function SwitchFilter({ name, label, value }: { name: string; label: string; value: boolean }) {
  const { set } = useSetParams();
  return (
    <div className="flex items-center gap-2">
      <Switch id={`f-${name}`} checked={value} onCheckedChange={(c) => set({ [name]: c ? "1" : null })} />
      <Label htmlFor={`f-${name}`} className="text-xs font-normal text-muted-foreground">{label}</Label>
    </div>
  );
}

export function ClearFilters({ keys }: { keys: string[] }) {
  const { params, set, pending } = useSetParams();
  const active = keys.some((k) => params.get(k));
  if (pending) return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  if (!active) return null;
  return (
    <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => set(Object.fromEntries(keys.map((k) => [k, null])))}>
      <X className="size-3.5" />Reset
    </Button>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

/** A search box kept in the URL (?q=): the server filters, so it finds people beyond what one page shows. */
export function SearchParamInput({ name = "q", value, placeholder }: { name?: string; value: string | null; placeholder: string }) {
  const { set, pending } = useSetParams();
  const [text, setText] = useState(value ?? "");
  return (
    <form role="search" className="relative" onSubmit={(e) => { e.preventDefault(); set({ [name]: text.trim() || null, page: null }); }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        onBlur={() => { if ((value ?? "") !== text.trim()) set({ [name]: text.trim() || null, page: null }); }}
        className="h-8 w-56 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
      {pending && <Loader2 className="absolute top-2 right-2 size-4 animate-spin text-muted-foreground" />}
    </form>
  );
}
