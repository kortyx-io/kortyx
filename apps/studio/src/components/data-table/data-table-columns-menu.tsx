"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp, Columns3, GripVertical, Pin } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle, type HelpDefinition } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useDataTable } from "./data-table-context";

export function DataTableColumnsMenu({
  label = "Columns",
  help,
  placeholder = "Find a column…",
}: {
  label?: string;
  help?: HelpDefinition;
  placeholder?: string;
}) {
  const {
    columnsByKey,
    orderedColumnKeys,
    hidden,
    moveColumn,
    showAllColumns,
    resetLayout,
  } = useDataTable();
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const filtered = orderedColumnKeys.filter((key) =>
    columnsByKey[key].label.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Popover onOpenChange={() => setSearch("")}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label={label}
          title={label}
          className="relative"
        >
          <Columns3 />
          {hidden.length > 0 && (
            <span className="absolute -right-2 -top-1.5 rounded-full bg-foreground px-1 text-[10px] leading-4 text-background">
              {orderedColumnKeys.length - hidden.length}/
              {orderedColumnKeys.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-2"
        aria-labelledby={titleId}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <h2 id={titleId} className="text-sm font-medium">
            Visible columns
          </h2>
          {help && <HelpCircle help={help} />}
        </div>
        <Input
          ref={searchRef}
          aria-label="Find a column"
          placeholder={placeholder}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="mb-2 h-8"
        />
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={({ active, over }) => {
            if (over) moveColumn(String(active.id), String(over.id));
          }}
        >
          <SortableContext
            items={filtered}
            strategy={verticalListSortingStrategy}
          >
            <ul
              className="max-h-72 overflow-y-auto overscroll-contain"
              aria-label="Column order"
            >
              {filtered.map((key) => (
                <ColumnRow key={key} columnKey={key} />
              ))}
              {filtered.length === 0 && (
                <li className="p-2 text-sm text-muted-foreground">
                  No matching columns.
                </li>
              )}
            </ul>
          </SortableContext>
        </DndContext>
        <Separator className="my-2" />
        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="xs" onClick={showAllColumns}>
            Show all
          </Button>
          <Button variant="ghost" size="xs" onClick={resetLayout}>
            Reset layout
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ColumnRow({ columnKey }: { columnKey: string }) {
  const {
    columnsByKey,
    orderedColumnKeys,
    hidden,
    pinned,
    toggleColumnVisibility,
    moveColumn,
  } = useDataTable();
  const column = columnsByKey[columnKey];
  const index = orderedColumnKeys.indexOf(columnKey);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnKey });
  return (
    <li
      ref={setNodeRef}
      data-column-option={columnKey}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
        position: "relative",
        zIndex: isDragging ? 1 : undefined,
      }}
      className="group flex items-center gap-1 rounded-md bg-popover px-1 py-1"
    >
      <Button
        ref={setActivatorNodeRef}
        variant="ghost"
        size="icon-xs"
        className="touch-none cursor-grab"
        {...attributes}
        {...listeners}
        aria-label={`Drag ${column.label} column`}
      >
        <GripVertical />
      </Button>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!hidden.includes(columnKey)}
          onChange={() => toggleColumnVisibility(columnKey)}
          disabled={
            !hidden.includes(columnKey) &&
            hidden.length === orderedColumnKeys.length - 1
          }
        />
        <span className="truncate">{column.label}</span>
      </label>
      {pinned[columnKey] && (
        <span title={`Pinned ${pinned[columnKey]}`}>
          <Pin
            className="size-3 text-muted-foreground"
            aria-label={`Pinned ${pinned[columnKey]}`}
          />
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Move ${column.label} left`}
        disabled={index === 0}
        onClick={() => moveColumn(columnKey, orderedColumnKeys[index - 1])}
      >
        <ArrowUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Move ${column.label} right`}
        disabled={index === orderedColumnKeys.length - 1}
        onClick={() => moveColumn(columnKey, orderedColumnKeys[index + 1])}
      >
        <ArrowDown />
      </Button>
    </li>
  );
}
