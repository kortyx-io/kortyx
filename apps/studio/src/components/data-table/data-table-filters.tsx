"use client";
import {
  EMPTY_TABLE_FILTERS,
  type StudioTableResource,
  type TableFilters,
  validateTableFilters,
} from "@kortyx/telemetry-contracts";
import {
  Filter,
  LayoutPanelTop,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HelpCircle, type HelpDefinition } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { studioFeature } from "@/usage/client";
import { DataTableColumnsMenu } from "./data-table-columns-menu";
import { useDataTable } from "./data-table-context";
import { DataTableFilterField } from "./data-table-filter-field";
import { DataTableScope } from "./data-table-scope";
import { type SavedTableView, validView } from "./saved-table-views";
import {
  CurrentTablePreference,
  useTablePreferenceSnapshot,
} from "./table-persistence";
import type { DataTableFilter, DataTableScopeFilter } from "./types";
import type { useTableFilters } from "./use-table-filters";
import type { useTableScope } from "./use-table-scope";
import type { useTableSearch } from "./use-table-search";

export function DataTableFilterControls<T>({
  help,
  disabled = false,
  tableId,
  searching,
  start,
  panelContainer,
  fields,
  data,
  resource,
  state,
  scopeFields,
  scopeState,
  legacyViews,
  clearQuery,
  pagination,
  sort,
  direction,
  onSetSortDirection,
}: {
  help?: { filters: HelpDefinition; views: HelpDefinition };
  tableId: string;
  disabled?: boolean;
  searching: ReturnType<typeof useTableSearch>;
  start?: ReactNode;
  panelContainer: HTMLDivElement | null;
  fields: DataTableFilter<T>[];
  data: T[];
  resource?: StudioTableResource | "prompts" | "evaluations";
  state: ReturnType<typeof useTableFilters<T>>;
  scopeFields: readonly DataTableScopeFilter[];
  scopeState: ReturnType<typeof useTableScope>;
  legacyViews?: () => SavedTableView[];
  clearQuery: () => void;
  pagination?: {
    pageSize: number;
    onPageSizeChange: (size: number) => void;
    onCursorChange: (cursor: number) => void;
  };
  sort?: string;
  direction?: "asc" | "desc";
  onSetSortDirection?: (key: string, dir: "asc" | "desc") => void;
}) {
  const { filters } = state;
  const [draft, setDraft] = useState(filters);
  const currentDraft = useRef(filters);
  const submitted = useRef(new Set<string>());
  const [error, setError] = useState("");
  const persistence = useContext(CurrentTablePreference);
  const persisted = useTablePreferenceSnapshot(persistence);
  const [localViews, setViews] = useState<SavedTableView[]>([]);
  const views: SavedTableView[] = persisted?.preferences.views ?? localViews;
  const layout = useDataTable();
  const {
    keys: scopeKeys,
    values: scope,
    empty: clearScope,
    change: setScope,
  } = scopeState;
  const changeScope = (patch: Record<string, string | boolean | null>) => {
    void setScope(patch);
    pagination?.onCursorChange(0);
  };
  const storageKey = `kortyx.table.${tableId}.views.v1`;
  useEffect(() => {
    if (persistence) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setViews(
          Array.isArray(parsed) ? parsed.filter(validView).slice(0, 30) : [],
        );
      } else if (legacyViews) {
        const migrated = legacyViews().filter(validView).slice(0, 30);
        setViews(migrated);
        if (migrated.length)
          localStorage.setItem(storageKey, JSON.stringify(migrated));
      }
    } catch {
      setViews([]);
    }
  }, [storageKey, legacyViews, persistence]);
  const saveViews = (next: SavedTableView[]) => {
    if (persistence) {
      const identified = next.map((view) => ({
        ...view,
        id: view.id ?? crypto.randomUUID(),
      }));
      for (const view of views)
        if (view.id && !identified.some((item) => item.id === view.id))
          persistence.mutate({ kind: "deleteView", id: view.id });
      for (const view of identified)
        if (
          JSON.stringify(view) !==
          JSON.stringify(views.find((item) => item.id === view.id))
        )
          persistence.mutate({ kind: "putView", view });
      return;
    }
    setViews(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      setError("Views could not be saved in this browser.");
    }
  };
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<number | null>(null);
  const [viewsOpen, setViewsOpen] = useState(false);
  function openDrawer() {
    setDraft(filters);
    setFieldSearch("");
    setError("");
    state.setOpen(true);
  }
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldSearch, setFieldSearch] = useState("");
  const serialized = JSON.stringify(filters);
  useEffect(() => {
    // A server acknowledgement may arrive after the user edits another bound.
    // Do not replace newer (possibly invalid) input with that older own write.
    const ownWrite = submitted.current.delete(serialized);
    if (ownWrite && JSON.stringify(currentDraft.current) !== serialized) return;
    submitted.current.clear();
    if (pending.current) clearTimeout(pending.current);
    const next: TableFilters = JSON.parse(serialized);
    currentDraft.current = next;
    setDraft(next);
    setError("");
  }, [serialized]);
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );
  const apply = (next: TableFilters) => {
    submitted.current.add(JSON.stringify(next));
    // Keep acknowledgements bounded even if an interrupted route never returns.
    if (submitted.current.size > 10) {
      const oldest = submitted.current.values().next().value;
      if (oldest) submitted.current.delete(oldest);
    }
    state.apply(next);
  };
  const change = (next: TableFilters, immediate = false) => {
    currentDraft.current = next;
    setDraft(next);
    if (pending.current) clearTimeout(pending.current);
    try {
      validateTableFilters(next, fields);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check filter values.");
      return;
    }
    if (immediate) apply(next);
    else pending.current = setTimeout(() => apply(next), 350);
  };
  const groups = Object.entries(
    Object.groupBy(
      fields.filter((field) =>
        field.label.toLowerCase().includes(fieldSearch.toLowerCase()),
      ),
      (field) => field.group ?? "",
    ),
  );
  function cancelPending() {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
  }
  function clearFilters() {
    cancelPending();
    change(EMPTY_TABLE_FILTERS, true);
    changeScope(clearScope);
  }
  const matchControl = (
    <div className="mb-4">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Match conditions
      </p>
      <div className="flex gap-1 rounded-lg border p-1">
        {(["all", "any"] as const).map((match) => (
          <Button
            key={match}
            className="flex-1"
            size="xs"
            variant="ghost"
            aria-pressed={draft.match === match}
            onClick={() => change({ ...draft, match }, true)}
          >
            Match {match} · {match === "all" ? "AND" : "OR"}
          </Button>
        ))}
      </div>
    </div>
  );
  const controls = (
    <div
      className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b bg-background px-5 py-2 pb-3"
      data-table-controls={tableId}
    >
      {start && <div className="flex shrink-0 items-center gap-2">{start}</div>}
      <div className="relative min-w-0 basis-full flex-1 sm:basis-48">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-2 size-4 text-muted-foreground"
        />
        <Input
          type="search"
          disabled={disabled}
          aria-label={searching.label}
          placeholder={searching.placeholder}
          className="h-8 pl-9"
          value={searching.value}
          onChange={(event) => {
            searching.onChange(event.target.value);
          }}
        />
      </div>
      {error && !state.open && (
        <span role="alert" className="mr-auto text-xs text-destructive">
          {error}
        </span>
      )}
      {state.invalid && (
        <span role="alert" className="mr-auto text-xs text-destructive">
          Invalid filters. Open Filters to reset.
        </span>
      )}
      <Button
        variant="secondary"
        size="icon-sm"
        aria-label="Filters"
        aria-expanded={state.open}
        onClick={() => (state.open ? state.setOpen(false) : openDrawer())}
        className="relative"
      >
        <Filter />
        {filters.rules.length > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-foreground px-1 text-[10px] text-background">
            {filters.rules.length}
          </span>
        )}
      </Button>
      <DataTableColumnsMenu help={help?.views} />
      {persisted &&
        (persisted.status === "error" || persisted.status === "conflict") && (
          <div className="flex items-center gap-1 text-xs" role="alert">
            <span title={persisted.error}>Preferences not saved</span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => persistence?.retry()}
            >
              {persisted.status === "conflict" ? "Save my changes" : "Retry"}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => persistence?.reload()}
            >
              Reload preferences
            </Button>
          </div>
        )}
      <DropdownMenu open={viewsOpen} onOpenChange={setViewsOpen}>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Views" variant="secondary" size="icon-sm">
            <LayoutPanelTop />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-2">
          {persisted && (
            <output className="block px-2 py-1 text-xs text-muted-foreground">
              {persisted.status === "local"
                ? (persisted.error ?? "Saved in this browser")
                : persisted.status === "saving"
                  ? "Saving preferences…"
                  : persisted.status === "loading"
                    ? "Refreshing preferences…"
                    : (persisted.error ?? "Preferences saved")}
            </output>
          )}
          {help && (
            <div className="flex items-center justify-between px-2 py-1 text-xs">
              Table views
              <HelpCircle help={help.views} />
            </div>
          )}
          <DropdownMenuItem
            onSelect={() => {
              cancelPending();
              state.apply(EMPTY_TABLE_FILTERS);
              layout.resetLayout();
              void setScope(clearScope);
              searching.onChange("");
              clearQuery();
            }}
          >
            Standard view
          </DropdownMenuItem>
          {views.map((view, index) => (
            <div
              key={view.id ?? `${view.name}-${index}`}
              className="flex items-center gap-1"
            >
              <DropdownMenuItem
                className="min-w-0 flex-1 truncate"
                onSelect={() => {
                  try {
                    validateTableFilters(view.filters, fields);
                  } catch {
                    setError(
                      "This view uses filters that are no longer supported. Delete it and save a new view.",
                    );
                    return;
                  }
                  cancelPending();
                  state.apply(view.filters);
                  layout.applyLayout(view.layout);
                  void setScope({
                    ...clearScope,
                    ...Object.fromEntries(
                      Object.entries(view.scope)
                        .filter(([key]) => scopeKeys.includes(key))
                        .map(([key, value]) => [
                          key,
                          scopeFields.some(
                            (field) =>
                              field.key === key && field.kind === "boolean",
                          )
                            ? value === "true"
                            : value,
                        ]),
                    ),
                  });
                  searching.onChange(view.scope.q ?? "");
                  if (view.sort && onSetSortDirection)
                    onSetSortDirection(view.sort, view.direction ?? "desc");
                  if (view.pageSize)
                    pagination?.onPageSizeChange(view.pageSize);
                }}
              >
                {view.name}
              </DropdownMenuItem>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Rename view ${view.name}`}
                onClick={() => {
                  setRenaming(index);
                  setName(view.name);
                }}
              >
                <Pencil />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Delete view ${view.name}`}
                onClick={() => saveViews(views.filter((_, i) => i !== index))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <form
            className="mt-2 flex gap-1 border-t pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              if (renaming !== null) {
                saveViews(
                  views.map((view, index) =>
                    index === renaming
                      ? { ...view, name: name.trim().slice(0, 80) }
                      : view,
                  ),
                );
                setRenaming(null);
                setName("");
                return;
              }
              if (views.length >= 30) {
                setError("At most 30 views can be saved per table.");
                return;
              }
              try {
                validateTableFilters(draft, fields);
              } catch {
                setError("Check filter values before saving this view.");
                return;
              }
              cancelPending();
              if (JSON.stringify(draft) !== JSON.stringify(filters))
                state.apply(draft);
              saveViews(
                [
                  ...views,
                  {
                    name: name.trim().slice(0, 80),
                    filters: draft,
                    layout: {
                      widths: layout.storedWidths,
                      order: layout.order,
                      hidden: layout.hidden,
                      pinned: layout.pinned,
                    },
                    scope: {
                      ...Object.fromEntries(
                        Object.entries(scope)
                          .filter(
                            (entry): entry is [string, string | boolean] =>
                              entry[1] !== null && entry[1] !== undefined,
                          )
                          .map(([key, value]) => [key, String(value)]),
                      ),
                      q: searching.value,
                    },
                    sort,
                    direction,
                    pageSize: pagination?.pageSize,
                  },
                ].slice(-30),
              );
              setName("");
              setViewsOpen(false);
              studioFeature("studio.saved_view", { action: "save" });
            }}
          >
            <Input
              aria-label="View name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="View name"
              maxLength={80}
            />
            <Button
              type="submit"
              size="sm"
              disabled={
                !name.trim() || (renaming === null && views.length >= 30)
              }
            >
              {renaming === null ? "Save" : "Rename"}
            </Button>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
  return (
    <>
      {controls}
      {state.open &&
        panelContainer &&
        createPortal(
          <aside
            aria-label="Filters"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !event.defaultPrevented) {
                state.setOpen(false);
              }
            }}
            className="relative flex h-full min-h-0 w-72 max-w-full flex-col overflow-hidden rounded-xl border bg-background shadow-sm"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
              <div className="flex items-center gap-1">
                <h2 className="font-semibold">Filters</h2>
                {help && <HelpCircle help={help.filters} />}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close filters"
                onClick={() => state.setOpen(false)}
              >
                <X />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {matchControl}
              {scopeFields.length > 0 && (
                <div className="mb-4 border-b pb-4">
                  <DataTableScope
                    fields={scopeFields}
                    values={scope}
                    onChange={changeScope}
                  />
                </div>
              )}
              <Input
                aria-label="Find a filter"
                placeholder="Find a filter…"
                value={fieldSearch}
                onChange={(event) => setFieldSearch(event.target.value)}
                className="mb-2 h-8"
              />
              {groups.length === 0 && (
                <p className="py-4 text-sm text-muted-foreground">
                  No matching filters.
                </p>
              )}
              {groups.map(([group, groupFields]) => (
                <section key={group}>
                  {group &&
                    !(
                      groupFields?.length === 1 &&
                      groupFields[0].label === group
                    ) && (
                      <h3 className="pt-4 text-xs font-semibold">{group}</h3>
                    )}
                  {groupFields?.map((field) => (
                    <DataTableFilterField
                      key={field.key}
                      field={field}
                      rules={draft.rules.filter(
                        (rule) => rule.field === field.key,
                      )}
                      data={data}
                      resource={resource}
                      onChange={(rules, immediate) =>
                        change(
                          {
                            ...draft,
                            rules: [
                              ...draft.rules.filter(
                                (rule) => rule.field !== field.key,
                              ),
                              ...rules,
                            ],
                          },
                          immediate,
                        )
                      }
                    />
                  ))}
                </section>
              ))}
              {error && (
                <p role="alert" className="mt-3 text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
            <div className="shrink-0 border-t p-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={clearFilters}
              >
                <X /> Clear filters
              </Button>
            </div>
          </aside>,
          panelContainer,
        )}
    </>
  );
}
