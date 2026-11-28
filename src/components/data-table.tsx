"use client";
// One table for every list: sortable columns, a search box, faceted filter chips,
// pagination and a CSV export of exactly what is on screen after filtering. A right-click
// on a row offers what can be done with it: open it, show only rows like it, copy it.
// Columns are plain data (kind + key), so server pages pass them without writing
// a client component per table.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  flexRender, getCoreRowModel, getFacetedRowModel, getFacetedUniqueValues, getFilteredRowModel,
  getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
  type ColumnFiltersState, type FilterFn,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, PlusCircle, Check, Search, Copy, ExternalLink, Filter, FilterX, SquareArrowOutUpRight } from "lucide-react";
import { ActionMenu, type MenuAction } from "@/components/action-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";

import { GAP_CLASS, GAP_LABEL, LEVEL_CLASS } from "@/lib/status";
import type { GapCategory } from "@/lib/engine/engine";
import { cn } from "@/lib/utils";
import { LocalTime } from "@/components/local-time";
import { substringFilter } from "@/lib/search";
import { Info } from "@/components/info";
import { Person } from "@/components/person-avatar";
import { RoleChips, type RoleTag } from "@/components/role-chip";

export type ColKind = "text" | "link" | "person" | "number" | "pct" | "date" | "level" | "gap" | "muted" | "badge" | "roles";
export interface ColSpec {
  key: string;
  header: string;
  kind?: ColKind;
  /** for kind=link and kind=person: the row field holding the href */
  hrefKey?: string;
  /** for kind=person: the row field holding the photo URL (initials without one) */
  photoKey?: string;
  /** for kind=roles: the row field holding the roles as { name, tint }; the column's own value is their names, for sorting, filtering and the CSV */
  chipsKey?: string;
  align?: "left" | "right" | "center";
  facet?: boolean;
  sortable?: boolean;
  className?: string;
  /** what the column shows: the (i) in its header */
  info?: string;
}
type Row = Record<string, unknown>;

const multiFilter: FilterFn<Row> = (row, id, value: string[]) => !value?.length || value.includes(String(row.getValue(id) ?? ""));

function renderCell(c: ColSpec, row: Row) {
  const v = row[c.key];
  switch (c.kind) {
    case "person": {
      // a name always comes with its picture
      const name = String(v ?? "");
      if (!name) return <span className="text-muted-foreground">–</span>;
      return <Person name={name} href={c.hrefKey ? (row[c.hrefKey] as string | undefined) : undefined} src={c.photoKey ? (row[c.photoKey] as string | null | undefined) : undefined} />;
    }
    case "link": {
      const href = c.hrefKey ? (row[c.hrefKey] as string | undefined) : undefined;
      return href ? <Link href={href} className="font-medium hover:underline">{String(v ?? "")}</Link> : <span>{String(v ?? "")}</span>;
    }
    case "pct":
      return v == null ? <span className="text-muted-foreground">–</span> : <span className="tabular">{String(v)}%</span>;
    case "number":
      return v == null ? <span className="text-muted-foreground">–</span> : <span className="tabular">{String(v)}</span>;
    case "date":
      return v ? <LocalTime value={String(v)} options={{ day: "numeric", month: "short", year: "numeric" }} className="tabular text-muted-foreground" /> : <span className="text-muted-foreground">–</span>;
    case "level":
      return v == null || v === "" ? <span className="text-muted-foreground">–</span>
        : <span className={cn("inline-flex size-6 items-center justify-center rounded text-xs font-medium tabular", LEVEL_CLASS[Number(v)] ?? "")}>{String(v)}</span>;
    case "gap": {
      const g = v as GapCategory;
      return g ? <span className={cn("inline-flex rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", GAP_CLASS[g])}>{GAP_LABEL[g]}</span> : null;
    }
    case "roles": {
      const tags = (c.chipsKey ? row[c.chipsKey] : null) as RoleTag[] | null | undefined;
      return tags?.length ? <RoleChips roles={tags} /> : <span className="text-muted-foreground">{String(v || "–")}</span>;
    }
    case "badge":
      return v ? <span className="inline-flex rounded-md border px-1.5 py-0.5 text-xs whitespace-nowrap">{String(v)}</span> : null;
    case "muted":
      return <span className="text-muted-foreground">{String(v ?? "")}</span>;
    default:
      return <span>{v == null ? "" : String(v)}</span>;
  }
}

function Facet({ title, column }: { title: string; column: import("@tanstack/react-table").Column<Row, unknown> }) {
  const counts = column.getFacetedUniqueValues();
  const selected = new Set((column.getFilterValue() as string[]) ?? []);
  const values = [...counts.keys()].map(String).filter((x) => x !== "" && x !== "null" && x !== "undefined").sort();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 border-dashed", selected.size && "border-solid border-primary/50 bg-accent")}>
          <PlusCircle className="size-3.5" />{title}
          {selected.size > 0 && (<><Separator orientation="vertical" className="mx-1 h-4" /><span className="text-xs">{selected.size === 1 ? [...selected][0] : `${selected.size} selected`}</span></>)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command filter={substringFilter}>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup>
              {values.map((val) => (
                <CommandItem key={val} onSelect={() => {
                  const next = new Set(selected);
                  if (next.has(val)) next.delete(val); else next.add(val);
                  column.setFilterValue(next.size ? [...next] : undefined);
                }}>
                  <span className={cn("flex size-4 items-center justify-center rounded-sm border", selected.has(val) ? "border-primary bg-primary text-primary-foreground" : "opacity-60")}>
                    {selected.has(val) && <Check className="size-3" />}
                  </span>
                  <span className="flex-1 truncate">{val}</span>
                  <span className="text-xs text-muted-foreground tabular">{counts.get(val) ?? counts.get(Number(val))}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup><CommandItem onSelect={() => column.setFilterValue(undefined)} className="justify-center text-center">Clear</CommandItem></CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function toCsv(columns: ColSpec[], rows: Row[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.header)).join(","), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(","))].join("\n");
}

export function DataTable({
  columns, rows, searchKeys, searchPlaceholder = "Search…", pageSize = 25, initialSort, emptyText = "Nothing to show.",
  csvName, toolbar, dense, actions, rowMenu, search: showSearch = true,
}: {
  columns: ColSpec[];
  rows: Row[];
  searchKeys?: string[];
  searchPlaceholder?: string;
  pageSize?: number;
  initialSort?: { key: string; desc?: boolean };
  emptyText?: string;
  csvName?: string;
  toolbar?: React.ReactNode;
  dense?: boolean;
  /** extra cell at the end of each row (edit / delete buttons) */
  actions?: (row: Row) => React.ReactNode;
  /** more right-click actions for a row, shown first (from a client component) */
  rowMenu?: (row: Row) => MenuAction[];
  /** its own search box; off where the page already searches */
  search?: boolean;
}) {
  // the table's sort, search, column filters and page live in the address (`<name>.sort`,
  // `.q`, `.<column>`, `.p`), so a refresh or a shared link shows the same list. Tables
  // without a name keep them in memory only.
  const urlKey = csvName ? csvName.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null;
  const params = useSearchParams();
  const fromUrl = (k: string) => (urlKey ? params.get(`${urlKey}.${k}`) : null);
  const defaultSort = initialSort ? `${initialSort.desc ? "-" : ""}${initialSort.key}` : "";
  const [sorting, setSorting] = useState<SortingState>(() => {
    const s = fromUrl("sort") ?? defaultSort;
    return s && s !== "none" ? [{ id: s.replace(/^-/, ""), desc: s.startsWith("-") }] : [];
  });
  const [filters, setFilters] = useState<ColumnFiltersState>(() => (urlKey ? columns.filter((c) => c.facet).flatMap((c) => {
    const v = params.getAll(`${urlKey}.${c.key}`);
    return v.length ? [{ id: c.key, value: v }] : [];
  }) : []));
  const [search, setSearch] = useState(() => fromUrl("q") ?? "");
  const [pagination, setPagination] = useState(() => ({ pageIndex: Math.max(0, Number(fromUrl("p") ?? 1) - 1) || 0, pageSize }));

  const defs = useMemo<ColumnDef<Row>[]>(() => columns.map((c) => ({
    id: c.key,
    accessorFn: (r) => r[c.key] as never,
    header: c.header,
    enableSorting: c.sortable !== false,
    filterFn: multiFilter,
    sortUndefined: "last",
    cell: (ctx) => renderCell(c, ctx.row.original),
  })), [columns]);

  const keys = searchKeys ?? columns.filter((c) => !c.kind || c.kind === "text" || c.kind === "link" || c.kind === "person" || c.kind === "muted").map((c) => c.key);
  const table = useReactTable({
    data: rows,
    columns: defs,
    state: { sorting, columnFilters: filters, globalFilter: search, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnFiltersChange: setFilters,
    onGlobalFilterChange: setSearch,
    globalFilterFn: (row, _id, value: string) => {
      const q = String(value).toLowerCase().trim();
      if (!q) return true;
      return keys.some((k) => String(row.original[k] ?? "").toLowerCase().includes(q));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // a page number from an old link that is past the end: the last page instead of an empty one
  const pageCount = table.getPageCount();
  useEffect(() => {
    if (pageCount && pagination.pageIndex >= pageCount) setPagination((p) => ({ ...p, pageIndex: pageCount - 1 }));
  }, [pageCount, pagination.pageIndex]);

  // write the state back into the address, without a round trip to the server
  useEffect(() => {
    if (!urlKey) return;
    const u = new URL(window.location.href);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith(`${urlKey}.`)) u.searchParams.delete(k);
    const s = sorting[0] ? `${sorting[0].desc ? "-" : ""}${sorting[0].id}` : "none";
    if (s !== (defaultSort || "none")) u.searchParams.set(`${urlKey}.sort`, s);
    if (search.trim()) u.searchParams.set(`${urlKey}.q`, search);
    for (const f of filters) for (const v of (f.value as string[]) ?? []) u.searchParams.append(`${urlKey}.${f.id}`, v);
    if (pagination.pageIndex > 0) u.searchParams.set(`${urlKey}.p`, String(pagination.pageIndex + 1));
    if (u.href !== window.location.href) window.history.replaceState(null, "", u);
  }, [urlKey, defaultSort, sorting, search, filters, pagination.pageIndex]);

  // what a right-click on a row offers: open what it links to, narrow the list to rows like it, copy
  const linkCol = columns.find((c) => c.hrefKey && (c.kind === "link" || c.kind === "person"));
  const menuFor = (row: Row): { title: string; actions: MenuAction[] } => {
    const title = String(row[(linkCol ?? columns[0]!).key] ?? "");
    const href = linkCol?.hrefKey ? (row[linkCol.hrefKey] as string | undefined) : undefined;
    const out: MenuAction[] = [...(rowMenu?.(row) ?? [])];
    if (href) {
      out.push({ key: "open", label: `Open ${title}`, icon: ExternalLink, href, separator: out.length > 0 });
      out.push({ key: "tab", label: "Open in a new tab", icon: SquareArrowOutUpRight, href, newTab: true });
    }
    columns.filter((c) => c.facet).forEach((c, i) => {
      const value = String(row[c.key] ?? "");
      if (!value) return;
      const col = table.getColumn(c.key)!;
      const on = ((col.getFilterValue() as string[] | undefined) ?? []).includes(value);
      out.push({ key: `only:${c.key}`, label: on ? `Show every ${c.header.toLowerCase()} again` : `Show only ${c.header.toLowerCase()}: ${value}`, icon: on ? FilterX : Filter, separator: i === 0 && out.length > 0,
        onSelect: () => { col.setFilterValue(on ? undefined : [value]); table.setPageIndex(0); } });
    });
    out.push({ key: "copy", label: `Copy “${title}”`, icon: Copy, copy: title, separator: out.length > 0 });
    out.push({ key: "copy-row", label: "Copy the whole row", icon: Copy, copy: columns.map((c) => (row[c.key] == null ? "" : String(row[c.key]))).join("\t") });
    return { title, actions: out };
  };

  const filtered = table.getFilteredRowModel().rows;
  const download = () => {
    const blob = new Blob([toCsv(columns, filtered.map((r) => r.original))], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${csvName ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {showSearch && (
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); table.setPageIndex(0); }} placeholder={searchPlaceholder} className="h-8 w-56 pl-8" aria-label="Search" />
          </div>
        )}
        {/* without a search box of its own the page's filters come first, then the column filters */}
        {!showSearch && toolbar}
        {columns.filter((c) => c.facet).map((c) => <Facet key={c.key} title={c.header} column={table.getColumn(c.key)!} />)}
        {showSearch && toolbar}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular">{filtered.length} of {rows.length}</span>
          {csvName && <Button variant="ghost" size="sm" className="h-8" onClick={download}><Download className="size-3.5" />CSV</Button>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const spec = columns.find((c) => c.key === h.column.id)!;
                  const sorted = h.column.getIsSorted();
                  return (
                    <TableHead key={h.id} className={cn("h-9 text-xs", spec.align === "right" && "text-right", spec.align === "center" && "text-center", spec.className)}>
                      {h.column.getCanSort() ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 hover:text-foreground", spec.align === "right" && "flex-row-reverse")}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-30" />}
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                      {spec.info && <Info className="ml-1" label={`About ${spec.header}`}>{spec.info}</Info>}
                    </TableHead>
                  );
                })}
                {actions && <TableHead className="h-9 w-px" />}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((r) => (
              <ActionMenu key={r.id} {...menuFor(r.original)}>
              <TableRow>
                {r.getVisibleCells().map((cell) => {
                  const spec = columns.find((c) => c.key === cell.column.id)!;
                  return (
                    <TableCell key={cell.id} className={cn(dense ? "py-1.5" : "py-2", spec.align === "right" && "text-right", spec.align === "center" && "text-center", spec.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
                {actions && <TableCell className="py-1 text-right whitespace-nowrap">{actions(r.original)}</TableCell>}
              </TableRow>
              </ActionMenu>
            )) : (
              <TableRow><TableCell colSpan={columns.length + (actions ? 1 : 0)} className="h-20 text-center text-sm text-muted-foreground">{emptyText}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="tabular">Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
          <Button variant="outline" size="sm" className="h-7" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
          <Button variant="outline" size="sm" className="h-7" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
        </div>
      )}
    </div>
  );
}
