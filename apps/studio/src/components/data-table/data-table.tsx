"use client";

import { DndContext } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { useDataTable } from "@/components/data-table/data-table-context";
import type { DataTablePagination } from "@/components/data-table/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DataTableProps<T, S extends string> = {
  data: T[];
  getRowKey: (item: T) => string;
  onRowClick?: (item: T, event: React.MouseEvent<HTMLTableRowElement>) => void;
  rowClassName?: (item: T) => string | undefined;
  sort?: S;
  direction?: "asc" | "desc";
  onSort?: (key: S) => void;
  onSetSortDirection?: (key: S, direction: "asc" | "desc") => void;
  onClearSort?: () => void;
  loading?: boolean;
  skeletonRows?: number;
  emptyState?: ReactNode;
  pagination?: DataTablePagination;
  /** Toolbar/header region rendered above the grid (filters, search, etc.). */
  header?: ReactNode;
  /** sessionStorage key for save/restore of scroll position across navigation. */
  scrollRestoreKey?: string;
  className?: string;
};

const CELL_BASE = "border-b px-3 py-3.5 align-middle";

export function DataTable<T, S extends string>({
  data,
  getRowKey,
  onRowClick,
  rowClassName,
  sort,
  direction,
  onSort,
  onSetSortDirection,
  onClearSort,
  loading = false,
  skeletonRows = 8,
  emptyState,
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
  } = useDataTable<T, S>();

  const [openColumnMenu, setOpenColumnMenu] = useState<string | null>(null);
  const skeletonKeys = useMemo(
    () => Array.from({ length: skeletonRows }, () => crypto.randomUUID()),
    [skeletonRows],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: restore scroll once on mount.
  useEffect(() => {
    if (!scrollRestoreKey) return;
    const saved = sessionStorage.getItem(scrollRestoreKey);
    if (saved) {
      scrollerRef.current?.scrollTo({ top: Number(saved) });
      sessionStorage.removeItem(scrollRestoreKey);
    }
  }, [scrollRestoreKey]);

  function handleRowClick(
    item: T,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) {
    if (scrollRestoreKey) {
      sessionStorage.setItem(
        scrollRestoreKey,
        String(scrollerRef.current?.scrollTop ?? 0),
      );
    }
    onRowClick?.(item, event);
  }

  const pageRows = pagination
    ? data.slice(pagination.cursor, pagination.cursor + pagination.pageSize)
    : data;
  const isEmpty = !loading && data.length === 0;

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border bg-background shadow-sm",
        className,
      )}
    >
      {header}
      <ScrollArea
        type="hover"
        viewportRef={scrollerRef}
        className="min-h-0 flex-1"
      >
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
              className="w-full table-fixed border-separate border-spacing-0 text-left text-sm"
              style={{ minWidth: tableWidth }}
            >
              <colgroup>
                {visibleColumnOrder.map((column) => (
                  <col key={column} style={{ width: widths[column] }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-30 bg-muted text-xs font-medium text-muted-foreground shadow-[0_1px_0_0_var(--border)]">
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
              <tbody>
                {loading
                  ? skeletonKeys.map((rowKey) => (
                      <tr key={rowKey} className="border-b">
                        {visibleColumnOrder.map((column) => (
                          <td
                            key={column}
                            className={cn(
                              CELL_BASE,
                              columnsByKey[column].cellClassName,
                            )}
                          >
                            <Skeleton className="h-5 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : pageRows.map((item) => (
                      <tr
                        key={getRowKey(item)}
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
                                  "sticky z-10 bg-muted group-hover:bg-accent",
                                motion && !pin && "relative z-10",
                              )}
                              style={{
                                ...motion?.style,
                                ...getPinnedColumnStyle(column),
                              }}
                            >
                              {definition.render(item)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
        {isEmpty && emptyState}
      </ScrollArea>
      {pagination && (
        <DataTablePaginationFooter
          pagination={pagination}
          onBeforeChange={() => scrollerRef.current?.scrollTo({ top: 0 })}
        />
      )}
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
    <div className="flex h-14 shrink-0 items-center justify-between border-t bg-background px-4 text-xs text-muted-foreground">
      <span>
        {totalCount > 0
          ? `Showing ${firstVisible}–${lastVisible} of ${totalCount}`
          : "No results"}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 whitespace-nowrap">
          Rows per page
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) => {
              onBeforeChange();
              onPageSizeChange(Number(event.target.value));
            }}
            className="h-8 rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/50"
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrevious}
          onClick={() => {
            onBeforeChange();
            onCursorChange(Math.max(0, cursor - pageSize));
          }}
        >
          <ChevronLeft /> Previous
        </Button>
        <span className="shrink-0 font-mono whitespace-nowrap tabular-nums">
          {currentPage}/{totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => {
            onBeforeChange();
            onCursorChange(cursor + pageSize);
          }}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
