"use client";

import { DndContext } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
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
  emptyState?: ReactNode;
  pagination?: DataTablePagination;
  /** Toolbar/header region rendered above the grid (filters, search, etc.). */
  header?: ReactNode;
  /** sessionStorage key for save/restore of scroll position across navigation. */
  scrollRestoreKey?: string;
  className?: string;
};

const CELL_BASE = "max-w-0 overflow-hidden border-b px-3 py-3.5 align-middle";

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
    headerScrollerRef,
  } = useDataTable<T, S>();

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
      ? data.slice(pagination.cursor, pagination.cursor + pagination.pageSize)
      : data;
  const isEmpty = data.length === 0;

  const colGroup = (
    <colgroup>
      {visibleColumnOrder.map((column) => (
        <col key={column} style={{ width: widths[column] }} />
      ))}
    </colgroup>
  );

  const tableStyle = { width: tableWidth, minWidth: "100%" as const };

  return (
    <div
      data-table-ready={interactive}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border bg-background shadow-sm",
        className,
      )}
    >
      {header}
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
                  style={{ width: tableWidth }}
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
              style={{ width: tableWidth }}
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
          {isEmpty && <div className="sticky left-0 w-full">{emptyState}</div>}
        </div>
      </div>
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
