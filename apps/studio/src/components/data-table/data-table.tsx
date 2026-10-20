"use client";

import { DndContext } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import {
  EMPTY_TABLE_FILTERS,
  type StudioTableResource,
} from "@kortyx/telemetry-contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  clampScrollViewport,
  syncHorizontalScroll,
} from "@/components/data-table/clamp-scroll-viewport";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import {
  DataTableProvider,
  useDataTable,
} from "@/components/data-table/data-table-context";
import type { DataTablePagination } from "@/components/data-table/types";
import { Button } from "@/components/ui/button";
import type { HelpDefinition } from "@/components/ui/info-tooltip";
import { ScrollBar } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { columnLayout, columnWidths } from "./column-layout";
import { DataTableFilterControls } from "./data-table-filters";
import type { SavedTableView } from "./saved-table-views";
import {
  CurrentTablePreference,
  useTablePreferenceEntry,
  useTablePreferenceSnapshot,
} from "./table-persistence";
import { sortTableRows } from "./table-rows";
import { matchesTableSearch } from "./table-search";
import type {
  DataTableColumn,
  DataTableFilter,
  DataTableLayout,
  DataTableQueryConfig,
  DataTableScopeFilter,
  DataTableSearch,
} from "./types";
import type { TableFilterCompatibility } from "./use-table-filters";
import { useTableFilters } from "./use-table-filters";
import { useTableQuery } from "./use-table-query";
import { useTableScope } from "./use-table-scope";
import { useTableSearch } from "./use-table-search";

export type DataTableProps<T, S extends string = string> = {
  tableId: string;
  columns: DataTableColumn<T, S>[];
  /** All tables persist layout automatically. Seeds can migrate older preferences. */
  initialLayout?: Partial<DataTableLayout>;
  query?: DataTableQueryConfig<S>;
  totalCount?: number;
  /** Reserve the real column layout while initial records are being fetched. */
  loading?: boolean;
  loadingRowHeight?: number;
  filters?: DataTableFilter<T>[];
  scopeFilters?: readonly DataTableScopeFilter[];
  help?: { filters: HelpDefinition; views: HelpDefinition };
  compatibility?: TableFilterCompatibility;
  legacyViews?: () => SavedTableView[];
  search?: Pick<DataTableSearch, "label" | "placeholder">;
  toolbarStart?: ReactNode;
  filterResource?: StudioTableResource | "prompts" | "evaluations";
  data: T[];
  getRowKey: (item: T) => string;
  onRowClick?: (item: T, event: React.MouseEvent<HTMLTableRowElement>) => void;
  /** Matching rows in display order, before pagination; useful for scoped entity navigation. */
  onFilteredRowsChange?: (rows: T[]) => void;
  rowClassName?: (item: T) => string | undefined;
  rowTone?: (item: T) => "danger" | undefined;
  emptyState?:
    | ReactNode
    | ((actions: {
        clearFilters: () => void;
        hasFilters: boolean;
      }) => ReactNode);
  /** Optional layout for empty content inside the table's scrolling area. */
  emptyStateClassName?: string;
  /** Toolbar/header region rendered above the grid (filters, search, etc.). */
  header?: ReactNode;
  /** sessionStorage key for save/restore of scroll position across navigation. */
  scrollRestoreKey?: string;
  className?: string;
};

const CELL_BASE = "max-w-0 overflow-hidden border-b px-3 py-3.5 align-middle";

export function DataTable<T, S extends string = string>(
  props: DataTableProps<T, S>,
) {
  const entry = useTablePreferenceEntry(props.tableId);
  const persistence = useTablePreferenceSnapshot(entry);
  return (
    <CurrentTablePreference.Provider value={entry}>
      <DataTableProvider
        key={props.tableId}
        columns={props.columns}
        initialLayout={props.initialLayout}
        persistKey={
          entry ? undefined : `kortyx.table.${props.tableId}.layout.v1`
        }
        preferenceLayout={
          persistence?.hydrated
            ? (persistence.preferences.defaults.layout ?? {
                widths: columnWidths(props.columns),
                ...columnLayout(props.columns),
                pinned: {},
              })
            : undefined
        }
        onLayoutChange={
          entry
            ? (layout) => entry.mutate({ kind: "defaults", patch: { layout } })
            : undefined
        }
      >
        <DataTableContent {...props} />
      </DataTableProvider>
    </CurrentTablePreference.Provider>
  );
}

function DataTableContent<T, S extends string>({
  tableId,
  search,
  toolbarStart,
  filterResource,
  columns,
  query: queryConfig,
  totalCount = 0,
  loading = false,
  loadingRowHeight = 61,
  filters: extraFilters = [],
  scopeFilters = [],
  help,
  compatibility,
  legacyViews,
  data,
  getRowKey,
  onRowClick,
  onFilteredRowsChange,
  rowClassName,
  rowTone,
  emptyState,
  emptyStateClassName,
  header,
  scrollRestoreKey,
  className,
}: DataTableProps<T, S>) {
  const {
    columnsByKey,
    visibleColumnOrder,
    tableWidth,
    widths,
    pinned,
    sensors,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragMove,
    onDragCancel,
    onDragEnd,
    getColumnCellMotion,
    getPinnedColumnStyle,
    draggedColumn,
    scrollerRef,
    headerScrollerRef,
  } = useDataTable<T, S>();

  const fields = [
    ...extraFilters,
    ...Object.values(columnsByKey).flatMap((column) =>
      column.filter === false
        ? []
        : Array.isArray(column.filter)
          ? column.filter
          : [column.filter],
    ),
  ]
    .filter(
      (field, index, all): field is DataTableFilter<T> =>
        Boolean(field) &&
        all.findIndex((other) => other?.key === field?.key) === index,
    )
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  const query = useTableQuery(tableId, columns, queryConfig);
  const remote = queryConfig?.mode === "remote";
  const scope = useTableScope(scopeFilters, remote);
  const filtering = useTableFilters({
    fields,
    keys: query.keys,
    server: remote,
    compatibility,
  });
  const searching = useTableSearch({
    ...search,
    value: query.q,
    onChange: query.onSearch,
  });
  const pagination: DataTablePagination = {
    cursor: query.cursor,
    pageSize: query.pageSize,
    pageSizes: query.pageSizes,
    totalCount,
    serverSide: remote,
    onCursorChange: (cursor) => {
      void query.change({ cursor });
    },
    onPageSizeChange: (pageSize) => {
      void query.change({ pageSize });
    },
  };
  const filteredData = sortTableRows(
    data.filter(
      (row) =>
        (remote || filtering.matches(row)) &&
        (remote || matchesTableSearch(row, fields, searching.value)),
    ),
    columns,
    remote ? undefined : query.sort,
    query.dir,
  );
  useEffect(() => {
    onFilteredRowsChange?.(filteredData);
  }, [filteredData, onFilteredRowsChange]);
  const sort = query.sort,
    direction = query.dir;
  const onSort = query.onSort,
    onSetSortDirection = query.setSortDirection,
    onClearSort = query.clearSort;
  const [filterContainer, setFilterContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [openColumnMenu, setOpenColumnMenu] = useState<string | null>(null);
  const [interactive, setInteractive] = useState(false);
  const synchronizedScrollLeft = useRef(0);
  useEffect(() => setInteractive(true), []);
  useEffect(() => {
    const header = headerScrollerRef.current;
    const body = scrollerRef.current;
    if (!header || !body) return;
    // Keep one wheel-scroll owner during a held drag. Native header scrolling
    // can race body scroll notifications and repeatedly pull the gesture back.
    const scrollHeader = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const delta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
      if (!delta) return;
      event.preventDefault();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? body.clientWidth
            : 1;
      body.scrollLeft += delta * unit;
      synchronizedScrollLeft.current = body.scrollLeft;
      syncHorizontalScroll(body, header);
    };
    header.addEventListener("wheel", scrollHeader, { passive: false });
    return () => header.removeEventListener("wheel", scrollHeader);
  }, [headerScrollerRef, scrollerRef]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: restore scroll once on mount.
  useEffect(() => {
    if (!scrollRestoreKey) return;
    const saved = sessionStorage.getItem(scrollRestoreKey);
    if (saved) {
      scrollerRef.current?.scrollTo({ top: Number(saved) });
      sessionStorage.removeItem(scrollRestoreKey);
    }
  }, [scrollRestoreKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the viewport must be reclamped after a persisted resize changes the computed table width.
  useLayoutEffect(() => {
    clampScrollViewport(scrollerRef.current, headerScrollerRef.current);
  }, [tableWidth, scrollerRef, headerScrollerRef]);

  function handleHorizontalScroll(
    source: HTMLDivElement,
    target: HTMLDivElement | null,
  ) {
    // Scroll events arrive asynchronously. Ignore the echoed event from our
    // previous write instead of letting it undo a newer wheel/trackpad gesture.
    if (source.scrollLeft === synchronizedScrollLeft.current) return;
    synchronizedScrollLeft.current = source.scrollLeft;
    syncHorizontalScroll(source, target);
  }

  function handleRowClick(
    item: T,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) {
    // Cell controls own their clicks. Bubbling into the row can navigate twice
    // or leave the page when selecting, copying, or opening a link in a new tab.
    if (
      event.defaultPrevented ||
      (event.target instanceof Element &&
        event.target.closest(
          'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="checkbox"]',
        ))
    )
      return;
    if (scrollRestoreKey) {
      sessionStorage.setItem(
        scrollRestoreKey,
        String(scrollerRef.current?.scrollTop ?? 0),
      );
    }
    onRowClick?.(item, event);
  }

  const pageRows =
    pagination && !pagination.serverSide
      ? filteredData.slice(
          Math.min(
            pagination.cursor,
            Math.max(
              0,
              Math.ceil(filteredData.length / pagination.pageSize) - 1,
            ) * pagination.pageSize,
          ),
          Math.min(
            pagination.cursor,
            Math.max(
              0,
              Math.ceil(filteredData.length / pagination.pageSize) - 1,
            ) * pagination.pageSize,
          ) + pagination.pageSize,
        )
      : filteredData;
  const isEmpty = filteredData.length === 0;

  const colGroup = (
    <colgroup>
      {visibleColumnOrder.map((column) => (
        <col
          key={column}
          style={{ width: `${(widths[column] / tableWidth) * 100}%` }}
        />
      ))}
    </colgroup>
  );

  const tableStyle = { width: tableWidth, minWidth: "100%" as const };

  return (
    <div className={cn("relative flex h-full min-h-0 min-w-0", className)}>
      <div
        data-table-ready={interactive}
        aria-busy={loading}
        inert={loading || undefined}
        data-page-help-records={data.length}
        className={cn(
          "flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-sm",
          className,
        )}
      >
        {header}
        <DataTableFilterControls
          disabled={loading}
          help={help}
          tableId={tableId}
          searching={searching}
          start={toolbarStart}
          panelContainer={filterContainer}
          fields={fields}
          data={data}
          resource={filterResource}
          state={filtering}
          scopeFields={scopeFilters}
          scopeState={scope}
          legacyViews={legacyViews}
          clearQuery={() => {
            void query.change({
              sort: null,
              dir: null,
              pageSize: null,
              cursor: null,
            });
          }}
          pagination={pagination}
          sort={sort}
          direction={direction}
          onSetSortDirection={
            onSetSortDirection as
              | ((key: string, direction: "asc" | "desc") => void)
              | undefined
          }
        />
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={headerScrollerRef}
            onScroll={(event) =>
              handleHorizontalScroll(event.currentTarget, scrollerRef.current)
            }
            className="data-table-header-scroll shrink-0 overflow-x-auto overflow-y-hidden"
          >
            <div className="overflow-clip" style={tableStyle}>
              <DndContext
                id={`data-table-columns-${tableId}`}
                sensors={sensors}
                modifiers={[restrictToHorizontalAxis]}
                collisionDetection={collisionDetection}
                autoScroll={false}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragMove={onDragMove}
                onDragCancel={onDragCancel}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={visibleColumnOrder}
                  strategy={horizontalListSortingStrategy}
                >
                  <table
                    className="table-fixed border-separate border-spacing-0 text-left text-sm"
                    style={tableStyle}
                  >
                    {colGroup}
                    <thead className="bg-muted text-xs font-medium text-muted-foreground shadow-[0_1px_0_0_var(--border)]">
                      <tr>
                        {visibleColumnOrder.map((column, index) => (
                          <DataTableColumnHeader
                            key={column}
                            column={columnsByKey[column]}
                            isLast={index === visibleColumnOrder.length - 1}
                            active={sort}
                            direction={direction}
                            onSort={onSort}
                            onSetSortDirection={onSetSortDirection}
                            onClearSort={onClearSort}
                            menuOpen={openColumnMenu === column}
                            onMenuOpenChange={(open) =>
                              setOpenColumnMenu(open ? column : null)
                            }
                          />
                        ))}
                      </tr>
                    </thead>
                  </table>
                </SortableContext>
              </DndContext>
            </div>
          </div>
          <ScrollAreaPrimitive.Root
            type="auto"
            className="relative min-h-0 flex-1 overflow-hidden"
          >
            <ScrollAreaPrimitive.Viewport
              ref={scrollerRef}
              onScroll={(event) =>
                handleHorizontalScroll(
                  event.currentTarget,
                  headerScrollerRef.current,
                )
              }
              className="data-table-body-scroll size-full [&>div]:!block"
            >
              <div className="overflow-clip" style={tableStyle}>
                <table
                  className="table-fixed border-separate border-spacing-0 text-left text-sm"
                  style={tableStyle}
                >
                  {colGroup}
                  <tbody>
                    {loading
                      ? Array.from({ length: 6 }, (_, index) => (
                          <tr key={`loading-${index}`}>
                            {visibleColumnOrder.map((column) => (
                              <td
                                key={column}
                                className={CELL_BASE}
                                style={{ height: loadingRowHeight }}
                              >
                                <Skeleton className="h-4 w-3/4 max-w-48" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : null}
                    {!loading &&
                      pageRows.map((item) => (
                        <tr
                          key={getRowKey(item)}
                          data-row-key={getRowKey(item)}
                          data-row-tone={rowTone?.(item)}
                          style={
                            {
                              "--table-row-base":
                                rowTone?.(item) === "danger"
                                  ? "color-mix(in oklab, var(--destructive) 2.5%, var(--background))"
                                  : "var(--background)",
                            } as React.CSSProperties
                          }
                          onClick={
                            onRowClick
                              ? (event) => handleRowClick(item, event)
                              : undefined
                          }
                          className={cn(
                            "group border-b [--table-row-bg:var(--table-row-base)] hover:[--table-row-bg:color-mix(in_oklab,var(--muted)_55%,var(--table-row-base))]",
                            onRowClick && "cursor-pointer",
                            rowClassName?.(item),
                          )}
                        >
                          {visibleColumnOrder.map((column) => {
                            const definition = columnsByKey[column];
                            const motion = getColumnCellMotion(column);
                            const pin = pinned[column];
                            return (
                              <td
                                key={column}
                                data-column={column}
                                data-column-dragging={
                                  draggedColumn === column || undefined
                                }
                                title={definition.cellTitle?.(item)}
                                className={cn(
                                  CELL_BASE,
                                  definition.cellClassName,
                                  "transition-colors",
                                  pin && "sticky z-10",
                                  motion && !pin && "relative z-1",
                                  draggedColumn === column && "z-30 shadow-lg",
                                )}
                                style={{
                                  backgroundColor: "var(--table-row-bg)",
                                  ...motion?.style,
                                  ...getPinnedColumnStyle(column),
                                }}
                              >
                                <div className="min-w-0 overflow-hidden">
                                  {definition.render(item)}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {isEmpty && !loading && (
                <div
                  className={cn("sticky left-0 w-full", emptyStateClassName)}
                >
                  {typeof emptyState === "function"
                    ? emptyState({
                        hasFilters: Boolean(
                          query.q ||
                            filtering.filters.rules.length ||
                            scope.hasActiveFilters,
                        ),
                        clearFilters: () => {
                          filtering.apply(EMPTY_TABLE_FILTERS);
                          scope.clear();
                          query.onSearch("");
                        },
                      })
                    : emptyState}
                </div>
              )}
            </ScrollAreaPrimitive.Viewport>
            <ScrollBar className="z-40" />
            <ScrollBar orientation="horizontal" className="z-40" />
            <ScrollAreaPrimitive.Corner />
          </ScrollAreaPrimitive.Root>
        </div>
        {pagination && (
          <DataTablePaginationFooter
            loading={loading}
            pagination={
              pagination.serverSide
                ? pagination
                : {
                    ...pagination,
                    totalCount: filteredData.length,
                    cursor: Math.min(
                      pagination.cursor,
                      Math.max(
                        0,
                        Math.ceil(filteredData.length / pagination.pageSize) -
                          1,
                      ) * pagination.pageSize,
                    ),
                  }
            }
            onBeforeChange={() => scrollerRef.current?.scrollTo({ top: 0 })}
          />
        )}
      </div>
      <div
        ref={setFilterContainer}
        className={cn(
          "h-full min-h-0 shrink-0 overflow-hidden transition-[width,margin] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] max-sm:absolute max-sm:inset-y-0 max-sm:right-0 max-sm:z-30",
          filtering.open ? "ml-2 w-72 max-w-full" : "ml-0 w-0",
        )}
      />
    </div>
  );
}

function DataTablePaginationFooter({
  loading = false,
  pagination,
  onBeforeChange,
}: {
  loading?: boolean;
  pagination: DataTablePagination;
  onBeforeChange: () => void;
}) {
  const {
    cursor,
    pageSize,
    pageSizes,
    totalCount,
    onCursorChange,
    onPageSizeChange,
  } = pagination;
  const firstVisible = totalCount === 0 ? 0 : cursor + 1;
  const lastVisible = Math.min(cursor + pageSize, totalCount);
  const hasPrevious = cursor > 0;
  const hasNext = cursor + pageSize < totalCount;
  const currentPage = Math.floor(cursor / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div
      data-table-footer
      className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t bg-background px-4 py-2 text-xs text-muted-foreground"
    >
      <span>
        {loading ? (
          <Skeleton className="h-4 w-32" />
        ) : totalCount > 0 ? (
          `Showing ${firstVisible}–${lastVisible} of ${totalCount}`
        ) : (
          "No results"
        )}
      </span>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span>Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              onBeforeChange();
              onPageSizeChange(Number(value));
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label="Rows per page"
              className="w-16 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Previous page"
          disabled={!hasPrevious}
          onClick={() => {
            onBeforeChange();
            onCursorChange(Math.max(0, cursor - pageSize));
          }}
        >
          <ChevronLeft /> <span className="hidden sm:inline">Previous</span>
        </Button>
        <span className="shrink-0 font-mono whitespace-nowrap tabular-nums">
          {loading ? (
            <Skeleton className="h-4 w-8" />
          ) : (
            `${currentPage}/${totalPages}`
          )}
        </span>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Next page"
          disabled={!hasNext}
          onClick={() => {
            onBeforeChange();
            onCursorChange(cursor + pageSize);
          }}
        >
          <span className="hidden sm:inline">Next</span> <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
