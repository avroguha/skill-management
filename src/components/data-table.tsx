"use client";
// One table for every list: sortable columns, a search box, faceted filter chips,
// pagination and a CSV export of exactly what is on screen after filtering.
// Columns are plain data (kind + key), so server pages pass them without writing
// a client component per table.
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  flexRender, getCoreRowModel, getFacetedRowModel, getFacetedUniqueValues, getFilteredRowModel,
  getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
  type ColumnFiltersState, type FilterFn,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, PlusCircle, Check, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";

import { GAP_CLASS, GAP_LABEL, LEVEL_CLASS } from "@/lib/status";
import type { GapCategory } from "@/lib/engine/engine";
import { cn } from "@/lib/utils";
import { substringFilter } from "@/lib/search";

export type ColKind = "text" | "link" | "number" | "pct" | "date" | "level" | "gap" | "muted" | "badge";
export interface ColSpec {
  key: string;
  header: string;
  kind?: ColKind;
  /** for kind=link: the row field holding the href */
  hrefKey?: string;
  align?: "left" | "right" | "center";
  facet?: boolean;
  sortable?: boolean;
  className?: string;
}
type Row = Record<string, unknown>;

const multiFilter: FilterFn<Row> = (row, id, value: string[]) => !value?.length || value.includes(String(row.getValue(id) ?? ""));

function renderCell(c: ColSpec, row: Row) {
  const v = row[c.key];
  switch (c.kind) {
    case "link": {
      const href = c.hrefKey ? (row[c.hrefKey] as string | undefined) : undefined;
      return href ? <Link href={href} className="font-medium hover:underline">{String(v ?? "")}</Link> : <span>{String(v ?? "")}</span>;
    }
    case "pct":
      return v == null ? <span className="text-muted-foreground">–</span> : <span className="tabular">{String(v)}%</span>;
    case "number":
      return v == null ? <span className="text-muted-foreground">–</span> : <span className="tabular">{String(v)}</span>;
    case "date":
      return v ? <span className="tabular text-muted-foreground">{new Date(String(v)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span> : <span className="text-muted-foreground">–</span>;
    case "level":
      return v == null || v === "" ? <span className="text-muted-foreground">–</span>
        : <span className={cn("inline-flex size-6 items-center justify-center rounded text-xs font-medium tabular", LEVEL_CLASS[Number(v)] ?? "")}>{String(v)}</span>;
    case "gap": {
      const g = v as GapCategory;
      return g ? <span className={cn("inline-flex rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", GAP_CLASS[g])}>{GAP_LABEL[g]}</span> : null;
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
  csvName, toolbar, dense, actions,
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
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [{ id: initialSort.key, desc: !!initialSort.desc }] : []);
  const [filters, setFilters] = useState<ColumnFiltersState>([]);
  const [search, setSearch] = useState("");

  const defs = useMemo<ColumnDef<Row>[]>(() => columns.map((c) => ({
    id: c.key,
    accessorFn: (r) => r[c.key] as never,
    header: c.header,
    enableSorting: c.sortable !== false,
    filterFn: multiFilter,
    sortUndefined: "last",
    cell: (ctx) => renderCell(c, ctx.row.original),
  })), [columns]);

  const keys = searchKeys ?? columns.filter((c) => !c.kind || c.kind === "text" || c.kind === "link" || c.kind === "muted").map((c) => c.key);
  const table = useReactTable({
    data: rows,
    columns: defs,
    state: { sorting, columnFilters: filters, globalFilter: search },
    onSortingChange: setSorting,
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
    initialState: { pagination: { pageSize } },
  });

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
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); table.setPageIndex(0); }} placeholder={searchPlaceholder} className="h-8 w-56 pl-8" aria-label="Search" />
        </div>
        {columns.filter((c) => c.facet).map((c) => <Facet key={c.key} title={c.header} column={table.getColumn(c.key)!} />)}
        {toolbar}
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
                    </TableHead>
                  );
                })}
                {actions && <TableHead className="h-9 w-px" />}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((r) => (
              <TableRow key={r.id}>
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
