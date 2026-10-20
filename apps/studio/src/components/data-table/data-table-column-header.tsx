"use client";

import { useSortable } from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useDataTable } from "@/components/data-table/data-table-context";
import type { DataTableColumn } from "@/components/data-table/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfoTooltip } from "@/components/ui/info-tooltip";
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
    getColumnCellMotion,
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
  const { attributes, isDragging, listeners, setNodeRef } = useSortable({
    id: key,
    disabled: !canDrag,
  });
  const motion = getColumnCellMotion(key);
  const SortIcon = direction === "asc" ? ArrowUp : ArrowDown;
  const title = (
    <button
      type="button"
      onClick={() => {
        if (sortKey) onSort?.(sortKey);
      }}
      onKeyDown={(event) => {
        // The surrounding drag handle has its own keyboard activation.
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }}
      className="flex w-full min-w-0 items-center hover:text-foreground"
    >
      <span className="min-w-0 truncate">{label}</span>
      {sortKey &&
        (active === sortKey ? (
          <SortIcon className="size-3 shrink-0" />
        ) : (
          <ArrowUpDown className="size-3 shrink-0 text-muted-foreground/60" />
        ))}
    </button>
  );

  return (
    <th
      ref={setNodeRef}
      data-column={key}
      aria-sort={
        sortKey && active === sortKey
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
      data-column-dragging={isDragging || undefined}
      style={{
        ...motion?.style,
        ...stickyStyle,
      }}
      className={cn(
        "group relative bg-muted px-3 py-3 after:pointer-events-none after:absolute after:top-2 after:right-0 after:bottom-2 after:w-px after:bg-border",
        isLast && "after:hidden",
        pin && "sticky z-40 bg-muted",
        isDragging && "z-50 shadow-lg",
        headerClassName,
      )}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onMenuOpenChange(true);
      }}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-1 group-hover:pr-5 group-focus-within:pr-5",
          menuOpen && "pr-5",
        )}
      >
        <div
          {...(canDrag ? attributes : {})}
          {...(canDrag ? listeners : {})}
          // Help triggers stop bubbling to protect row actions. Activate the
          // drag sensor in capture so explained headers remain draggable.
          onPointerDown={undefined}
          onPointerDownCapture={(event) => {
            if (canDrag) listeners?.onPointerDown?.(event);
          }}
          className={cn(
            "min-w-0 flex-1 overflow-hidden",
            canDrag && "cursor-grab touch-none active:cursor-grabbing",
          )}
        >
          {column.help ? (
            <InfoTooltip
              label={`About ${column.help.label}`}
              documentationUrl={column.help.documentationUrl}
              side="bottom"
              trigger={title}
              triggerAction={sortKey ? "preserve" : "toggle"}
              disabled={isDragging}
            >
              {column.help.description}
            </InfoTooltip>
          ) : sortKey ? (
            title
          ) : (
            <span className="block truncate">{label}</span>
          )}
        </div>
      </div>
      <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon-xs"
            type="button"
            aria-label={`${label} column menu`}
            className={cn(
              "absolute top-1/2 right-1 z-20 -translate-y-1/2",
              "pointer-events-none opacity-0",
              "group-hover:pointer-events-auto group-hover:opacity-100",
              "focus:pointer-events-auto focus:opacity-100",
              menuOpen && "pointer-events-auto opacity-100",
            )}
          >
            <MoreHorizontal />
          </Button>
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
