"use client";

import { Check, Ellipsis, LayoutPanelTop, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SavedListView } from "@/features/telemetry/lib/table-preferences";
import { cn } from "@/lib/utils";

function areViewsEqual(
  first: Pick<SavedListView<unknown>, "query" | "layout">,
  second: Pick<SavedListView<unknown>, "query" | "layout">,
) {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function ListViewsMenu<Q>({
  currentQuery,
  standardQuery,
  views,
  onApplyQuery,
  onViewsChange,
}: {
  currentQuery: Q;
  standardQuery: Q;
  views: SavedListView<Q>[];
  onApplyQuery: (query: Q) => void;
  onViewsChange: (views: SavedListView<Q>[]) => void;
}) {
  const { columns, defaultOrder, widths, order, hidden, pinned, applyLayout } =
    useDataTable();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | "save" | null>(null);
  const [optionsViewId, setOptionsViewId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dismissOptionsOnNextClickRef = useRef(false);

  useEffect(() => {
    if (!editingId) return;
    const frame = requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editingId]);

  const current = {
    query: currentQuery,
    layout: { widths, order, hidden, pinned },
  };
  const standardView: SavedListView<Q> = {
    id: "standard",
    name: "Standard",
    query: standardQuery,
    layout: {
      widths: Object.fromEntries(
        columns.map((column) => [column.key, column.defaultWidth]),
      ),
      order: defaultOrder,
      hidden: [],
      pinned: {},
    },
  };

  function updateViews(next: SavedListView<Q>[]) {
    onViewsChange(next);
  }

  function saveCurrentView(name: string) {
    updateViews([
      ...views,
      {
        id: crypto.randomUUID(),
        name,
        ...current,
      },
    ]);
  }

  function applyView(view: SavedListView<Q>) {
    onApplyQuery(view.query);
    applyLayout(view.layout);
  }

  function beginSave() {
    setName(`View ${views.length + 1}`);
    setEditingId("save");
  }

  function beginRename(view: SavedListView<Q>) {
    setName(view.name);
    setEditingId(view.id);
  }

  function shouldOnlyDismissOptions() {
    return dismissOptionsOnNextClickRef.current;
  }

  function submitName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || !editingId) return;

    if (editingId === "save") saveCurrentView(nextName);
    else {
      updateViews(
        views.map((view) =>
          view.id === editingId ? { ...view, name: nextName } : view,
        ),
      );
    }
    setEditingId(null);
    setOptionsViewId(null);
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && dismissOptionsOnNextClickRef.current) return;
        setOpen(nextOpen);
        if (!nextOpen) {
          setEditingId(null);
          setOptionsViewId(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Views">
          <LayoutPanelTop />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-60 space-y-px p-2 [&_[role=menuitem]]:cursor-pointer [&_button]:cursor-pointer"
        onPointerDownCapture={(event) => {
          if (
            !optionsViewId ||
            (event.target as HTMLElement).closest(
              "[data-view-options-panel], [data-view-options-trigger]",
            )
          ) {
            return;
          }
          dismissOptionsOnNextClickRef.current = true;
          setOptionsViewId(null);
        }}
        onClick={() => {
          dismissOptionsOnNextClickRef.current = false;
        }}
      >
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        {editingId ? (
          <form
            className="space-y-2 px-1 py-1"
            onSubmit={submitName}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <label
              htmlFor="runs-view-name"
              className="text-xs font-medium text-muted-foreground"
            >
              {editingId === "save" ? "View name" : "Rename view"}
            </label>
            <input
              ref={nameInputRef}
              id="runs-view-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/50"
            />
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setEditingId(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="xs" disabled={!name.trim()}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <>
            <DropdownMenuItem
              onSelect={(event) => {
                if (shouldOnlyDismissOptions()) {
                  event.preventDefault();
                  return;
                }
                applyView(standardView);
              }}
              className={cn(
                areViewsEqual(standardView, current) && "bg-accent font-medium",
              )}
            >
              <Check
                className={cn(
                  "size-4",
                  !areViewsEqual(standardView, current) && "invisible",
                )}
              />
              <span className="min-w-0 flex-1 truncate">Standard</span>
            </DropdownMenuItem>
            {views.map((view) => {
              const active = areViewsEqual(view, current);
              return (
                <div
                  key={view.id}
                  role="menuitem"
                  tabIndex={0}
                  onClick={() => {
                    if (!shouldOnlyDismissOptions()) applyView(view);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (!shouldOnlyDismissOptions()) applyView(view);
                    }
                  }}
                  className={cn(
                    "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                    active && "bg-accent font-medium",
                  )}
                >
                  <Check className={cn("size-4", !active && "invisible")} />
                  <span className="min-w-0 flex-1 truncate">{view.name}</span>
                  <button
                    type="button"
                    aria-label={`View options for ${view.name}`}
                    aria-expanded={optionsViewId === view.id}
                    data-view-options-trigger
                    className="-mr-1 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOptionsViewId((current) =>
                        current === view.id ? null : view.id,
                      );
                    }}
                  >
                    <Ellipsis className="size-3.5" />
                  </button>
                  {optionsViewId === view.id && (
                    <div
                      role="menu"
                      data-view-options-panel
                      className="absolute top-0 right-0 z-10 w-36 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOptionsViewId(null);
                          beginRename(view);
                        }}
                      >
                        <Pencil className="size-4" /> Rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOptionsViewId(null);
                          updateViews(
                            views.filter((item) => item.id !== view.id),
                          );
                        }}
                      >
                        <Trash2 className="size-4" /> Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                if (shouldOnlyDismissOptions()) {
                  event.preventDefault();
                  return;
                }
                event.preventDefault();
                beginSave();
              }}
            >
              <LayoutPanelTop /> Save current view
            </DropdownMenuItem>
            {views.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Save a view to reuse this table setup.
              </p>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
