"use client";

import { Columns3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDataTable } from "@/components/data-table/data-table-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type DataTableColumnsMenuProps = {
  label?: string;
  placeholder?: string;
};

export function DataTableColumnsMenu({
  label = "Columns",
  placeholder = "Find a column…",
}: DataTableColumnsMenuProps) {
  const {
    columns,
    defaultOrder,
    hidden,
    toggleColumnVisibility,
    showAllColumns,
    resetLayout,
  } = useDataTable();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const total = columns.length;
  const visibleCount = total - hidden.length;
  const orderedColumns = defaultOrder.map(
    (key) => columns.find((column) => column.key === key) ?? columns[0],
  );

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={label}
              className="relative"
            >
              <Columns3 />
              {hidden.length > 0 && (
                <span className="absolute -top-1.5 -right-2 rounded-full bg-foreground px-1 text-[10px] leading-4 text-background">
                  {visibleCount}/{total}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-60 p-2">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        <div
          role="presentation"
          className="px-1 py-1"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder={placeholder}
            className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
        <ScrollArea className="max-h-64" viewportClassName="max-h-64">
          {orderedColumns
            .filter((column) =>
              column.label.toLowerCase().includes(search.toLowerCase()),
            )
            .map((column) => (
              <DropdownMenuCheckboxItem
                key={column.key}
                checked={!hidden.includes(column.key)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => toggleColumnVisibility(column.key)}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
        </ScrollArea>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <Button variant="ghost" size="xs" onClick={showAllColumns}>
            Show all
          </Button>
          <Button variant="ghost" size="xs" onClick={resetLayout}>
            Reset layout
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
