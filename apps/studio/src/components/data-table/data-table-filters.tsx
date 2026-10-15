"use client";
import {
  EMPTY_TABLE_FILTERS,
  readStudioTableFilters,
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
import { parseAsString } from "nuqs";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useSearchParams } from "@/lib/scoped-navigation";
import { studioFeature } from "@/usage/client";
import { DataTableColumnsMenu } from "./data-table-columns-menu";
import { useDataTable } from "./data-table-context";
import { DataTableFilterField } from "./data-table-filter-field";
import { type SavedTableView, validView } from "./saved-table-views";
import type {
  DataTableFilter,
  DataTableFilterPanel,
  DataTableLayout,
} from "./types";
import type { useTableFilters } from "./use-table-filters";
import type { useTableSearch } from "./use-table-search";

export function DataTableFilterControls<T>({
  tableId,
  searching,
  start,
  panelContainer,
  renderPanel,
  renderControls,
  fields,
  data,
  resource,
  state,
  onClearLegacy,
  extra,
  pagination,
  sort,
  direction,
  onSetSortDirection,
}: {
  tableId: string;
  searching: ReturnType<typeof useTableSearch>;
  start?: ReactNode;
  panelContainer: HTMLDivElement | null;
  renderPanel?: (context: DataTableFilterPanel<T>) => ReactNode;
  renderControls?: (controls: ReactNode) => ReactNode;
  fields: DataTableFilter<T>[];
  data: T[];
  resource?: StudioTableResource | "prompts" | "evaluations";
  state: ReturnType<typeof useTableFilters<T>>;
  onClearLegacy?: () => void;
  extra?: React.ReactNode;
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
  const [error, setError] = useState("");
  const [views, setViews] = useState<SavedTableView[]>([]);
  const layout = useDataTable();
  const search = useSearchParams();
  const searchKey = searching.queryKey;
  const [, setQuery] = useStudioQueryStates(
    {
      q: parseAsString,
      env: parseAsString,
      range: parseAsString,
      startedAfter: parseAsString,
      startedBefore: parseAsString,
      includeChildren: parseAsString,
      archived: parseAsString,
    },
    { shallow: !resource, urlKeys: { q: searchKey } },
  );
  const storageKey = `kortyx.table.${tableId}.views.v1`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setViews(
          Array.isArray(parsed) ? parsed.filter(validView).slice(0, 30) : [],
        );
      } else {
        const cookieNames: Record<string, string> = {
          runs: "kortyx_runs_table_prefs",
          sessions: "kortyx_sessions_table_prefs",
          interrupts: "kortyx_interrupts_table_prefs",
        };
        const rawCookie = document.cookie
          .split("; ")
          .find((entry) => entry.startsWith(`${cookieNames[tableId]}=`))
          ?.split("=")
          .slice(1)
          .join("=");
        if (
          resource &&
          resource !== "prompts" &&
          resource !== "evaluations" &&
          rawCookie
        ) {
          const old = JSON.parse(decodeURIComponent(rawCookie)).views ?? [];
          setViews(
            old.flatMap(
              (view: {
                name: string;
                query: Record<string, unknown>;
                layout: DataTableLayout;
              }) => {
                try {
                  const query = (view.query.filters ?? view.query) as Record<
                    string,
                    unknown
                  >;
                  const pairs = Object.fromEntries(
                    Object.entries(query)
                      .filter(
                        ([, value]) => value !== null && value !== undefined,
                      )
                      .map(([key, value]) => [
                        key,
                        Array.isArray(value) ? value.join(",") : String(value),
                      ]),
                  );
                  return [
                    {
                      name: view.name,
                      filters: readStudioTableFilters(pairs, resource),
                      layout: view.layout,
                      ...(typeof view.query.sort === "string"
                        ? { sort: view.query.sort }
                        : {}),
                      ...(view.query.dir === "asc" || view.query.dir === "desc"
                        ? { direction: view.query.dir }
                        : {}),
                      scope: Object.fromEntries(
                        Object.entries(pairs).filter(([key]) =>
                          [
                            "q",
                            "env",
                            "range",
                            "startedAfter",
                            "startedBefore",
                            "includeChildren",
                            "archived",
                          ].includes(key),
                        ),
                      ),
                    },
                  ];
                } catch {
                  return [];
                }
              },
            ),
          );
        }
      }
    } catch {
      setViews([]);
    }
  }, [storageKey, resource, tableId]);
  const saveViews = (next: SavedTableView[]) => {
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
    setDraft(JSON.parse(serialized));
  }, [serialized]);
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );
  const change = (next: TableFilters, immediate = false) => {
    setDraft(next);
    if (pending.current) clearTimeout(pending.current);
    try {
      validateTableFilters(next, fields);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check filter values.");
      return;
    }
    if (immediate) state.apply(next);
    else pending.current = setTimeout(() => state.apply(next), 350);
  };
  const priority = [
    "status",
    "feedback",
    "workflowIds",
    "workflowId",
    "models",
    "provider",
    "providers",
    "durationMs",
    "duration",
    "tokens",
    "cost",
  ];
  const listedFields = [...fields].sort(
    (a, b) =>
      (priority.includes(a.key) ? priority.indexOf(a.key) : 100) -
      (priority.includes(b.key) ? priority.indexOf(b.key) : 100),
  );
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
            variant={draft.match === match ? "secondary" : "ghost"}
            aria-pressed={draft.match === match}
            onClick={() => change({ ...draft, match }, true)}
          >
            Match {match} · {match === "all" ? "AND" : "OR"}
          </Button>
        ))}
      </div>
    </div>
  );
  const renderField = (key: string) => {
    const field = fields.find((field) => field.key === key);
    return field ? (
      <DataTableFilterField
        key={field.key}
        field={field}
        rules={draft.rules.filter((rule) => rule.field === key)}
        data={data}
        resource={resource}
        onChange={(rules, immediate) =>
          change(
            {
              ...draft,
              rules: [
                ...draft.rules.filter((rule) => rule.field !== key),
                ...rules,
              ],
            },
            immediate,
          )
        }
      />
    ) : null;
  };
  const controls = (
    <div
      className={
        renderControls
          ? "flex w-full min-w-0 flex-wrap items-center gap-2"
          : "flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b bg-background px-4 py-2"
      }
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
          aria-label={searching.label}
          placeholder={searching.placeholder}
          className="h-8 pl-9"
          value={searching.value}
          onChange={(event) => {
            searching.onChange(event.target.value);
            pagination?.onCursorChange(0);
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
        variant="outline"
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
      <DataTableColumnsMenu />
      <DropdownMenu open={viewsOpen} onOpenChange={setViewsOpen}>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Views" variant="outline" size="icon-sm">
            <LayoutPanelTop />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-2">
          <DropdownMenuItem
            onSelect={() => {
              state.apply(EMPTY_TABLE_FILTERS);
              layout.resetLayout();
              void setQuery({
                q: null,
                env: null,
                range: null,
                startedAfter: null,
                startedBefore: null,
                includeChildren: null,
                archived: null,
              });
            }}
          >
            Standard view
          </DropdownMenuItem>
          {views.map((view, index) => (
            <div
              key={`${view.name}-${index}`}
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
                  state.apply(view.filters);
                  layout.applyLayout(view.layout);
                  void setQuery({
                    q: null,
                    env: null,
                    range: null,
                    startedAfter: null,
                    startedBefore: null,
                    includeChildren: null,
                    archived: null,
                    ...view.scope,
                  });
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
              saveViews(
                [
                  ...views,
                  {
                    name: name.trim().slice(0, 80),
                    filters,
                    layout: {
                      widths: layout.widths,
                      order: layout.order,
                      hidden: layout.hidden,
                      pinned: layout.pinned,
                    },
                    scope: {
                      ...Object.fromEntries(
                        [...search.entries()]
                          .filter(([key]) => key !== "q" || searchKey === "q")
                          .map(([key, value]) => [
                            key === searchKey ? "q" : key,
                            value,
                          ])
                          .filter(([key]) =>
                            [
                              "q",
                              "env",
                              "range",
                              "startedAfter",
                              "startedBefore",
                              "includeChildren",
                              "archived",
                            ].includes(key),
                          ),
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
            <Button type="submit" size="sm" disabled={!name.trim()}>
              {renaming === null ? "Save" : "Rename"}
            </Button>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
  return (
    <>
      {renderControls ? renderControls(controls) : controls}
      {state.open &&
        panelContainer &&
        createPortal(
          renderPanel ? (
            renderPanel({
              error,
              invalid: state.invalid,
              filters: draft,
              fields,
              open: state.open,
              onClose: () => state.setOpen(false),
              onClear: () => {
                change(EMPTY_TABLE_FILTERS, true);
                onClearLegacy?.();
              },
              onChange: change,
              renderField,
              matchControl,
            })
          ) : (
            <aside
              aria-label="Filters"
              className="relative flex h-full min-h-0 w-72 max-w-full flex-col overflow-hidden rounded-xl border bg-background shadow-sm"
            >
              <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
                <h2 className="font-semibold">Filters</h2>
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
                {extra && <div className="mb-4 border-b pb-4">{extra}</div>}
                <Input
                  aria-label="Find a filter"
                  placeholder="Find a filter…"
                  value={fieldSearch}
                  onChange={(event) => setFieldSearch(event.target.value)}
                  className="mb-2 h-8"
                />
                {listedFields
                  .filter((field) =>
                    field.label
                      .toLowerCase()
                      .includes(fieldSearch.toLowerCase()),
                  )
                  .map((field) => (
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
                  onClick={() => {
                    change(EMPTY_TABLE_FILTERS, true);
                    onClearLegacy?.();
                  }}
                >
                  <X /> Clear filters
                </Button>
              </div>
            </aside>
          ),
          panelContainer,
        )}
    </>
  );
}
