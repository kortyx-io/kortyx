"use client";

import { Columns3 } from "lucide-react";
import { useState } from "react";
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
  const [search, setSearch] = useState("");

  const total = columns.length;
  const visibleCount = total - hidden.length;
  const orderedColumns = defaultOrder.map(
    (key) => columns.find((column) => column.key === key) ?? columns[0],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="default">
          <Columns3 /> {label}
          {hidden.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {visibleCount}/{total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-2">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        <div
          className="px-1 py-1"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={placeholder}
            className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
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
        </div>
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
