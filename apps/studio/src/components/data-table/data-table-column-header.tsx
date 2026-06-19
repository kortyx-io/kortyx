"use client";

import { useSortable } from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useDataTable } from "@/components/data-table/data-table-context";
import type { DataTableColumn } from "@/components/data-table/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type DataTableColumnHeaderProps<T, S extends string> = {
  column: DataTableColumn<T, S>;
  isLast: boolean;
  active?: S;
  direction?: "asc" | "desc";
  onSort?: (key: S) => void;
  onSetSortDirection?: (key: S, direction: "asc" | "desc") => void;
  onClearSort?: () => void;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
};

export function DataTableColumnHeader<T, S extends string>({
  column,
  isLast,
  active,
  direction,
  onSort,
  onSetSortDirection,
  onClearSort,
  menuOpen,
  onMenuOpenChange,
}: DataTableColumnHeaderProps<T, S>) {
  const {
    pinned,
    isColumnDraggable,
    getPinnedColumnStyle,
    startColumnResize,
    toggleColumnVisibility,
    resetColumnWidth,
    resetLayout,
    pinColumn,
    unpinColumn,
  } = useDataTable<T, S>();

  const { key, label, sortKey, headerClassName } = column;
  const canDrag = isColumnDraggable(key);
  const pin = pinned[key];
  const stickyStyle = getPinnedColumnStyle(key);
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: key, disabled: !canDrag });
  const SortIcon = direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      ref={setNodeRef}
      data-column={key}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
        ...stickyStyle,
      }}
      className={cn(
        "group relative px-3 py-3 after:pointer-events-none after:absolute after:top-2 after:right-0 after:bottom-2 after:w-px after:bg-border",
        isLast && "after:hidden",
        pin && "sticky z-40 bg-muted",
        isDragging && "z-50",
        headerClassName,
      )}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onMenuOpenChange(true);
      }}
    >
      <div
        {...(canDrag ? attributes : {})}
        {...(canDrag ? listeners : {})}
        className={cn(
          "mr-6 min-w-0 overflow-hidden",
          canDrag && "cursor-grab touch-none active:cursor-grabbing",
        )}
        title={canDrag ? `Drag ${label} column to reorder` : undefined}
      >
        {sortKey ? (
          <button
            type="button"
            onClick={() => onSort?.(sortKey)}
            className="flex max-w-full min-w-0 items-center gap-1 hover:text-foreground"
          >
            <span className="truncate">{label}</span>
            {active === sortKey ? (
              <SortIcon className="size-3 shrink-0" />
            ) : (
              <ArrowUpDown className="size-3 shrink-0 text-muted-foreground/60" />
            )}
          </button>
        ) : (
          <span className="whitespace-nowrap">{label}</span>
        )}
      </div>
      <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${label} column menu`}
            className="absolute top-1/2 right-3 z-10 -translate-y-1/2 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100 focus:opacity-100"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={6}
          className="w-44 text-xs"
        >
          {pin ? (
            <button
              type="button"
              onClick={() => {
                unpinColumn(key);
                onMenuOpenChange(false);
              }}
              className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
            >
              Unpin column
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  pinColumn(key, "left");
                  onMenuOpenChange(false);
                }}
                className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
              >
                Pin left
              </button>
              <button
                type="button"
                onClick={() => {
                  pinColumn(key, "right");
                  onMenuOpenChange(false);
                }}
                className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
              >
                Pin right
              </button>
            </>
          )}
          <DropdownMenuSeparator />
          {sortKey && onSetSortDirection && (
            <>
              <button
                type="button"
                onClick={() => {
                  onSetSortDirection(sortKey, "asc");
                  onMenuOpenChange(false);
                }}
                className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
              >
                Sort ascending
              </button>
              <button
                type="button"
                onClick={() => {
                  onSetSortDirection(sortKey, "desc");
                  onMenuOpenChange(false);
                }}
                className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
              >
                Sort descending
              </button>
              {onClearSort && (
                <button
                  type="button"
                  onClick={() => {
                    onClearSort();
                    onMenuOpenChange(false);
                  }}
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                >
                  Clear sort
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => {
              resetColumnWidth(key);
              onMenuOpenChange(false);
            }}
            className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
          >
            Reset width
          </button>
          <button
            type="button"
            onClick={() => {
              toggleColumnVisibility(key);
              onMenuOpenChange(false);
            }}
            className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
          >
            Hide column
          </button>
          <button
            type="button"
            onClick={() => {
              resetLayout();
              onMenuOpenChange(false);
            }}
            className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
          >
            Reset table layout
          </button>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        aria-label={`Resize ${label} column`}
        title={`Resize ${label} column`}
        onPointerDown={(event) => {
          event.stopPropagation();
          startColumnResize(key, event);
        }}
        onClick={(event) => event.preventDefault()}
        className="absolute top-0 right-0 z-10 h-full w-2 cursor-col-resize touch-none focus-visible:border-r focus-visible:border-ring focus-visible:outline-none"
      />
    </th>
  );
}
