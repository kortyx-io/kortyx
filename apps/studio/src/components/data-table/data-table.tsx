"use client";

import { DndContext } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import type { StudioTableResource } from "@kortyx/telemetry-contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useState } from "react";
import {
  clampScrollViewport,
  syncHorizontalScroll,
} from "@/components/data-table/clamp-scroll-viewport";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { useDataTable } from "@/components/data-table/data-table-context";
import type { DataTablePagination } from "@/components/data-table/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DataTableFilterControls } from "./data-table-filters";
import type { DataTableFilter, DataTableFilterPanel } from "./types";
import { useTableFilters } from "./use-table-filters";

type DataTableProps<T, S extends string> = {
  tableId: string;
  filterResource?: StudioTableResource | "prompts" | "evaluations";
  filterScope?: ReactNode;
  filterPanel?: (context: DataTableFilterPanel<T>) => ReactNode;
  onClearLegacyFilters?: () => void;
  data: T[];
  getRowKey: (item: T) => string;
  onRowClick?: (item: T, event: React.MouseEvent<HTMLTableRowElement>) => void;
  rowClassName?: (item: T) => string | undefined;
  sort?: S;
  direction?: "asc" | "desc";
  onSort?: (key: S) => void;
  onSetSortDirection?: (key: S, direction: "asc" | "desc") => void;
  onClearSort?: () => void;
  emptyState?: ReactNode;
  /** Optional layout for empty content inside the table's scrolling area. */
  emptyStateClassName?: string;
  pagination?: DataTablePagination;
  /** Toolbar/header region rendered above the grid (filters, search, etc.). */
  header?: ReactNode | ((controls: ReactNode) => ReactNode);
  /** sessionStorage key for save/restore of scroll position across navigation. */
  scrollRestoreKey?: string;
  className?: string;
};

const CELL_BASE = "max-w-0 overflow-hidden border-b px-3 py-3.5 align-middle";

export function DataTable<T, S extends string>({
  tableId,
  filterResource,
  filterScope,
  filterPanel,
  onClearLegacyFilters,
  data,
  getRowKey,
  onRowClick,
  rowClassName,
  sort,
  direction,
  onSort,
  onSetSortDirection,
  onClearSort,
  emptyState,
  emptyStateClassName,
  pagination,
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
    scrollerRef,
    headerScrollerRef,
  } = useDataTable<T, S>();

  const fields = Object.values(columnsByKey)
    .flatMap((column) =>
      column.filter === false
        ? []
        : Array.isArray(column.filter)
          ? column.filter
          : [column.filter],
    )
    .filter(
      (field, index, all): field is DataTableFilter<T> =>
        Boolean(field) &&
        all.findIndex((other) => other?.key === field?.key) === index,
    );
  const filtering = useTableFilters({
    tableId,
    fields,
    resource: filterResource,
  });
  const filteredData = filterResource ? data : data.filter(filtering.matches);
  const [filterContainer, setFilterContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [openColumnMenu, setOpenColumnMenu] = useState<string | null>(null);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
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

  function handleBodyScroll() {
    syncHorizontalScroll(scrollerRef.current, headerScrollerRef.current);
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
        className={cn(
          "flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-sm",
          className,
        )}
      >
        {typeof header === "function" ? null : header}
        <DataTableFilterControls
          tableId={tableId}
          panelContainer={filterContainer}
          renderPanel={filterPanel}
          renderControls={typeof header === "function" ? header : undefined}
          fields={fields}
          data={data}
          resource={filterResource}
          state={filtering}
          extra={filterScope}
          onClearLegacy={onClearLegacyFilters}
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
            className="data-table-header-scroll shrink-0 overflow-x-auto overflow-y-hidden"
          >
            <div style={tableStyle}>
              <DndContext
                id="data-table-columns"
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
          <div
            ref={scrollerRef}
            onScroll={handleBodyScroll}
            className="data-table-body-scroll min-h-0 flex-1 overflow-auto"
          >
            <div style={tableStyle}>
              <table
                className="table-fixed border-separate border-spacing-0 text-left text-sm"
                style={tableStyle}
              >
                {colGroup}
                <tbody>
                  {pageRows.map((item) => (
                    <tr
                      key={getRowKey(item)}
                      data-row-key={getRowKey(item)}
                      onClick={
                        onRowClick
                          ? (event) => handleRowClick(item, event)
                          : undefined
                      }
                      className={cn(
                        "group border-b transition-colors",
                        onRowClick && "cursor-pointer hover:bg-muted/55",
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
                            title={definition.cellTitle?.(item)}
                            className={cn(
                              CELL_BASE,
                              definition.cellClassName,
                              pin &&
                                "sticky z-10 bg-background group-hover:bg-accent",
                              motion && !pin && "relative z-10",
                            )}
                            style={{
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
            {isEmpty && (
              <div className={cn("sticky left-0 w-full", emptyStateClassName)}>
                {emptyState}
              </div>
            )}
          </div>
        </div>
        {pagination && (
          <DataTablePaginationFooter
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
  pagination,
  onBeforeChange,
}: {
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
    <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t bg-background px-4 py-2 text-xs text-muted-foreground">
      <span>
        {totalCount > 0
          ? `Showing ${firstVisible}–${lastVisible} of ${totalCount}`
          : "No results"}
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
          variant="outline"
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
          {currentPage}/{totalPages}
        </span>
        <Button
          variant="outline"
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
