"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon, BookmarkIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, Columns3Icon, DownloadIcon, FilterIcon, SearchIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteFilterAction, saveFilterAction } from "@/actions/tasks";
import { EmptyState } from "./empty-state";
import { useLocalValue } from "./local-store";
import type { LucideIcon } from "lucide-react";

export type Column<Row> = {
  id: string;
  header: string;
  cell: (row: Row) => React.ReactNode;
  sortKey?: string;
  align?: "left" | "right" | "center";
  width?: string;
  defaultHidden?: boolean;
  /** Always visible and not offered in the column chooser (e.g. the primary name). */
  locked?: boolean;
};

export type FilterDef = {
  key: string;
  label: string;
  type: "select" | "text" | "date" | "boolean";
  options?: { value: string; label: string }[];
  placeholder?: string;
};

export type SavedFilter = { id: string; name: string; filters: Record<string, string>; isDefault: boolean };

type Props<Row extends { id: string }> = {
  tableId: string;
  entity: string;
  columns: Column<Row>[];
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sort?: string;
  dir?: "asc" | "desc";
  q?: string;
  filters?: FilterDef[];
  activeFilters?: Record<string, string>;
  savedFilters?: SavedFilter[];
  searchPlaceholder?: string;
  canExport?: boolean;
  exportPath?: string;
  selectable?: boolean;
  bulkActions?: (selectedIds: string[], clear: () => void) => React.ReactNode;
  rowHref?: (row: Row) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: React.ReactNode;
  toolbarExtra?: React.ReactNode;
};

const PAGE_SIZES = [10, 25, 50, 100];

export function DataTable<Row extends { id: string }>(props: Props<Row>) {
  const { columns, rows, total, page, pageSize, pageCount, sort, dir = "desc", filters = [], activeFilters = {}, savedFilters = [] } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = React.useState(props.q ?? "");
  const defaultHidden = columns.filter((c) => c.defaultHidden).map((c) => c.id);
  const [hidden, setHidden] = useLocalValue<string[]>(`table:${props.tableId}:hidden`, defaultHidden);
  const visibleColumns = columns.filter((c) => c.locked || !hidden.includes(c.id));

  const navigate = React.useCallback(
    (mutate: (params: URLSearchParams) => void, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      if (resetPage) params.delete("page");
      startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if ((props.q ?? "") !== searchDraft) navigate((p) => (searchDraft ? p.set("q", searchDraft) : p.delete("q")));
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const toggleSort = (key: string) => navigate((p) => {
    if (sort === key) p.set("dir", dir === "asc" ? "desc" : "asc");
    else {
      p.set("sort", key);
      p.set("dir", "asc");
    }
  }, false);

  const setFilter = (key: string, value: string) => navigate((p) => (value ? p.set(`f_${key}`, value) : p.delete(`f_${key}`)));
  const clearFilters = () => navigate((p) => {
    for (const k of Array.from(p.keys())) if (k.startsWith("f_")) p.delete(k);
    p.delete("q");
    setSearchDraft("");
  });
  const applySaved = (f: SavedFilter) => navigate((p) => {
    for (const k of Array.from(p.keys())) if (k.startsWith("f_")) p.delete(k);
    for (const [k, v] of Object.entries(f.filters)) p.set(`f_${k}`, v);
  });

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allOnPageSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const activeCount = Object.keys(activeFilters).length + (props.q ? 1 : 0);

  const exportHref = props.exportPath ? `${props.exportPath}?${searchParams.toString()}` : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder={props.searchPlaceholder ?? "Search…"} className="pl-8" aria-label="Search" />
          {searchDraft ? (
            <button type="button" onClick={() => setSearchDraft("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
        {filters.length ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <FilterIcon data-icon="inline-start" />
                Filters
                {activeCount ? <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{activeCount}</span> : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Filters</p>
                {activeCount ? (
                  <Button variant="ghost" size="xs" onClick={clearFilters}>
                    Clear all
                  </Button>
                ) : null}
              </div>
              {filters.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{f.label}</Label>
                  {f.type === "select" || f.type === "boolean" ? (
                    <Select value={activeFilters[f.key] ?? "__any"} onValueChange={(v) => setFilter(f.key, v === "__any" ? "" : v)}>
                      <SelectTrigger className="h-8 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any">Any</SelectItem>
                        {(f.type === "boolean" ? [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] : f.options ?? []).map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input type={f.type === "date" ? "date" : "text"} defaultValue={activeFilters[f.key] ?? ""} placeholder={f.placeholder} className="h-8" onBlur={(e) => e.target.value !== (activeFilters[f.key] ?? "") && setFilter(f.key, e.target.value)} onKeyDown={(e) => e.key === "Enter" && setFilter(f.key, (e.target as HTMLInputElement).value)} />
                  )}
                </div>
              ))}
            </PopoverContent>
          </Popover>
        ) : null}
        <SavedFilters entity={props.entity} saved={savedFilters} current={activeFilters} onApply={applySaved} />
        <div className="ml-auto flex items-center gap-2">
          {props.toolbarExtra}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Choose columns">
                <Columns3Icon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.filter((c) => !c.locked).map((c) => (
                <DropdownMenuCheckboxItem key={c.id} checked={!hidden.includes(c.id)} onCheckedChange={(checked) => setHidden(checked ? hidden.filter((h) => h !== c.id) : [...hidden, c.id])}>
                  {c.header}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setHidden(defaultHidden)}>Reset to default</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {props.canExport && exportHref ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" asChild>
                  <a href={exportHref} download>
                    <DownloadIcon data-icon="inline-start" />
                    Export CSV
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Exports the current filtered view (max 5,000 rows)</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {activeCount ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {props.q ? <Chip label={`Search: “${props.q}”`} onRemove={() => setSearchDraft("")} /> : null}
          {Object.entries(activeFilters).map(([k, v]) => {
            const def = filters.find((f) => f.key === k);
            const label = def?.options?.find((o) => o.value === v)?.label ?? v;
            return <Chip key={k} label={`${def?.label ?? k}: ${label}`} onRemove={() => setFilter(k, "")} />;
          })}
        </div>
      ) : null}

      {props.selectable && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft/60 px-3 py-2 text-sm animate-in fade-in slide-in-from-top-1">
          <span className="font-medium">{selected.size} selected</span>
          <div className="flex flex-wrap items-center gap-2">{props.bulkActions?.(Array.from(selected), () => setSelected(new Set()))}</div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      <div className={cn("surface overflow-hidden transition-opacity", pending && "opacity-60")}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                {props.selectable ? (
                  <TableHead className="w-10">
                    <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="Select all rows on this page" />
                  </TableHead>
                ) : null}
                {visibleColumns.map((c) => (
                  <TableHead key={c.id} style={c.width ? { width: c.width } : undefined} className={cn("whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground", c.align === "right" && "text-right", c.align === "center" && "text-center")}>
                    {c.sortKey ? (
                      <button type="button" onClick={() => toggleSort(c.sortKey!)} className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === c.sortKey && "text-foreground")}>
                        {c.header}
                        {sort === c.sortKey ? dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : <ArrowUpDownIcon className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={visibleColumns.length + (props.selectable ? 1 : 0)} className="p-0">
                    <EmptyState
                      icon={props.emptyIcon}
                      title={activeCount ? "No results match these filters" : props.emptyTitle ?? "Nothing here yet"}
                      description={activeCount ? "Try widening the search or clearing a filter." : props.emptyDescription}
                      action={activeCount ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : props.emptyAction}
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const href = props.rowHref?.(row);
                  return (
                    <TableRow
                      key={row.id}
                      data-state={selected.has(row.id) ? "selected" : undefined}
                      className={cn(href && "cursor-pointer")}
                      onClick={(e) => {
                        if (!href) return;
                        const target = e.target as HTMLElement;
                        if (target.closest("a,button,input,[role=checkbox],[role=menuitem],[data-no-row-link]")) return;
                        router.push(href);
                      }}
                    >
                      {props.selectable ? (
                        <TableCell className="w-10">
                          <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleOne(row.id)} aria-label="Select row" />
                        </TableCell>
                      ) : null}
                      {visibleColumns.map((c) => (
                        <TableCell key={c.id} className={cn("align-middle", c.align === "right" && "text-right", c.align === "center" && "text-center")}>
                          {c.cell(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm text-muted-foreground">
          <div>
            {total === 0 ? "0 results" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()}`}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline">Rows per page</span>
              <Select value={String(pageSize)} onValueChange={(v) => navigate((p) => p.set("pageSize", v))}>
                <SelectTrigger className="h-7 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => navigate((p) => p.delete("page"), false)} aria-label="First page">
                <ChevronsLeftIcon />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => navigate((p) => p.set("page", String(page - 1)), false)} aria-label="Previous page">
                <ChevronLeftIcon />
              </Button>
              <span className="min-w-[80px] text-center tabular-nums">
                Page {page} of {pageCount}
              </span>
              <Button variant="ghost" size="icon-sm" disabled={page >= pageCount} onClick={() => navigate((p) => p.set("page", String(page + 1)), false)} aria-label="Next page">
                <ChevronRightIcon />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={page >= pageCount} onClick={() => navigate((p) => p.set("page", String(pageCount)), false)} aria-label="Last page">
                <ChevronsRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5">
      {label}
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${label}`}>
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

function SavedFilters({ entity, saved, current, onApply }: { entity: string; saved: SavedFilter[]; current: Record<string, string>; onApply: (f: SavedFilter) => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const hasCurrent = Object.keys(current).length > 0;

  const save = () =>
    start(async () => {
      const result = await saveFilterAction({ entity, name, filters: current });
      if (result.ok) {
        toast.success(`Saved view “${name}”`);
        setName("");
        setOpen(false);
        router.refresh();
      } else toast.error(result.error);
    });
  const remove = (id: string) =>
    start(async () => {
      const result = await deleteFilterAction({ id, entity });
      if (result.ok) {
        toast.success("Saved view removed");
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <BookmarkIcon data-icon="inline-start" />
          Views
          {saved.length ? <span className="ml-1 text-xs text-muted-foreground">({saved.length})</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <p className="text-sm font-medium">Saved views</p>
        {saved.length === 0 ? <p className="text-xs text-muted-foreground">No saved views yet. Apply some filters, then save them here.</p> : null}
        <ul className="space-y-1">
          {saved.map((f) => (
            <li key={f.id} className="flex items-center gap-1">
              <button type="button" className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => { onApply(f); setOpen(false); }}>
                {f.isDefault ? <StarIcon className="size-3 text-warning" /> : null}
                <span className="truncate">{f.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{Object.keys(f.filters).length} filters</span>
              </button>
              <Button variant="ghost" size="icon-xs" onClick={() => remove(f.id)} disabled={pending} aria-label={`Delete ${f.name}`}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
        <div className="space-y-1.5 border-t pt-3">
          <Label className="text-xs text-muted-foreground">Save current filters as</Label>
          <div className="flex gap-1.5">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Verified welders in NL" className="h-8" disabled={!hasCurrent} />
            <Button size="sm" onClick={save} disabled={!hasCurrent || !name.trim() || pending}>
              Save
            </Button>
          </div>
          {!hasCurrent ? <p className="text-[11px] text-muted-foreground">Apply at least one filter to save a view.</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="ml-auto h-8 w-8" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="surface overflow-hidden">
        <div className="border-b bg-muted/50 px-3 py-2.5">
          <Skeleton className="h-3 w-full" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b px-3 py-3 last:border-0">
            {Array.from({ length: columns }).map((__, j) => (
              <Skeleton key={j} className={cn("h-4", j === 0 ? "w-48" : "w-24")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
