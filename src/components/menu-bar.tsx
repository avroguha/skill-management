"use client";
// The top bar's part of the menu: "you are here" (menu entry › sub menu entry) and Find,
// which answers "where do I ...?" in the person's own words. Both read the same menu the
// sidebar is drawn from. The Menu button itself is in components/menu-button.tsx.
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { MENU_ICONS } from "@/components/app-sidebar";
import { locate, type MenuGroup, type Task } from "@/lib/menu";
import { substringFilter } from "@/lib/search";

/** The bars that stay at the top (demo, view-as, the header). Their height differs (the demo bar
 *  wraps on a phone), so it is measured and given to the page as --app-top: whatever sticks
 *  below them (the Save bar of My skills) sticks at that height, never under them. */
export function StickyTop({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--app-top", `${el.offsetHeight}px`);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    set();
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} className="sticky top-0 z-20">{children}</div>;
}

/** Hides what it holds on the page `href` leads to (same path, and every parameter it names). */
export function HideHere({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [p, q = ""] = href.split("?");
  const here = pathname === p && [...new URLSearchParams(q)].every(([k, v]) => params.get(k) === v);
  return here ? null : <>{children}</>;
}

/** Where you are: the menu entry, then the sub menu entry. */
export function MenuTrail({ groups }: { groups: MenuGroup[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const here = locate(groups, pathname, (n) => params.get(n));
  if (!here) return null;
  const Icon = MENU_ICONS[here.item.icon];
  return (
    <nav aria-label="You are here" className="flex min-w-0 items-center gap-1.5 text-sm">
      <Icon className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
      {/* on a phone there is room for one name: the section you are in */}
      {here.sub ? <Link href={here.item.href} className="hidden truncate text-muted-foreground hover:text-foreground sm:inline">{here.item.label}</Link>
        : <span className="truncate font-medium">{here.item.label}</span>}
      {here.sub && <><ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground sm:inline" /><span className="truncate font-medium">{here.sub.label}</span></>}
    </nav>
  );
}

/** Find: type what you want to do (or a page's name) and go there. Ctrl+K opens it. */
export function FindBox({ groups, tasks }: { groups: MenuGroup[]; tasks: Task[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const taskGroups = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) m.set(t.group, [...(m.get(t.group) ?? []), t]);
    return [...m.entries()];
  }, [tasks]);
  const go = (href: string) => { setOpen(false); router.push(href); };
  return (
    <>
      <Button variant="outline" size="sm" className="h-8 shrink-0 justify-start text-muted-foreground lg:w-64" onClick={() => setOpen(true)} aria-label="Find: what do you want to do?">
        <Search /><span className="hidden lg:inline">What do you want to do?</span><span className="hidden sm:inline lg:hidden">Find</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1 text-[10px] lg:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Find" description="Type what you want to do, or the name of a page." className="sm:max-w-xl">
        <Command filter={substringFilter}>
        <CommandInput placeholder="What do you want to do? e.g. remind, confirm, role, backup…" />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>Nothing like that. Try another word, or open Help.</CommandEmpty>
          {taskGroups.map(([label, list]) => (
            <CommandGroup key={label} heading={label}>
              {list.map((t) => (
                <CommandItem key={t.key} value={`${t.text} ${t.words ?? ""} ${label}`} onSelect={() => go(t.href)}>
                  <ChevronRight className="text-muted-foreground" />{t.text}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="Pages">
            {groups.flatMap((g) => g.items).flatMap((item) => {
              const Icon = MENU_ICONS[item.icon];
              return [
                <CommandItem key={item.key} value={`page ${item.label} ${item.hint}`} onSelect={() => go(item.href)}><Icon className="text-muted-foreground" /><span className="shrink-0">{item.label}</span><span className="truncate text-xs text-muted-foreground">{item.hint}</span></CommandItem>,
                ...(item.sub ?? []).map((s) => (
                  <CommandItem key={`${item.key}/${s.key}`} value={`page ${item.label} ${s.label} ${s.hint}`} onSelect={() => go(s.href)}>
                    <Icon className="text-muted-foreground" /><span className="shrink-0">{item.label}</span><ChevronRight className="size-3 text-muted-foreground" /><span className="shrink-0">{s.label}</span><span className="truncate text-xs text-muted-foreground">{s.hint}</span>
                  </CommandItem>
                )),
              ];
            })}
          </CommandGroup>
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
