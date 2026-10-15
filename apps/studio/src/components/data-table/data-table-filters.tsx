"use client";
import {
  EMPTY_TABLE_FILTERS,
  filterOperators,
  readStudioTableFilters,
  type StudioTableResource,
  type TableFilterRule,
  validateTableFilters,
} from "@kortyx/telemetry-contracts";
import { Filter, LayoutPanelTop, Pencil, Plus, Trash2, X } from "lucide-react";
import { parseAsString } from "nuqs";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useSearchParams } from "@/lib/scoped-navigation";
import { studioFeature } from "@/usage/client";
import { DataTableColumnsMenu } from "./data-table-columns-menu";
import { useDataTable } from "./data-table-context";
import { FilterRuleEditor } from "./data-table-filter-rule";
import { type SavedTableView, validView } from "./saved-table-views";
import type { DataTableFilter, DataTableLayout } from "./types";
import type { useTableFilters } from "./use-table-filters";

export function DataTableFilterControls<T>({
  tableId,
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
  fields: DataTableFilter<T>[];
  data: T[];
  resource?: StudioTableResource | "prompts" | "evaluations";
  state: ReturnType<typeof useTableFilters<T>>;
  onClearLegacy?: () => void;
  extra?: React.ReactNode;
  pagination?: { pageSize: number; onPageSizeChange: (size: number) => void };
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
  const searchKey =
    tableId === "prompt-runs"
      ? "promptrunsSearch"
      : tableId === "prompt-evals"
        ? "promptevalsSearch"
        : "q";
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
    setError("");
    state.setOpen(true);
  }
  const changeRule = (index: number, rule: TableFilterRule) =>
    setDraft((value) => ({
      ...value,
      rules: value.rules.map((r, i) => (i === index ? rule : r)),
    }));
  return (
    <>
      <div
        className="flex shrink-0 items-center justify-end gap-2 border-b bg-background px-4 py-2"
        data-table-controls={tableId}
      >
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
          onClick={openDrawer}
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
                      scope: Object.fromEntries(
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
      <Sheet
        open={state.open}
        onOpenChange={(open) => {
          if (open) openDrawer();
          else state.setOpen(false);
        }}
      >
        <SheetContent
          className="flex w-full flex-col gap-0 p-0 sm:max-w-sm"
          side="right"
        >
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>
              Match all or any conditions within this table.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {extra && <div className="mb-5 border-b pb-5">{extra}</div>}
            <div className="mb-5">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Match conditions
              </p>
              <div className="flex gap-1 rounded-lg border p-1">
                {(["all", "any"] as const).map((match) => (
                  <Button
                    key={match}
                    className="flex-1"
                    size="sm"
                    variant={draft.match === match ? "secondary" : "ghost"}
                    aria-pressed={draft.match === match}
                    onClick={() => setDraft({ ...draft, match })}
                  >
                    Match {match} · {match === "all" ? "AND" : "OR"}
                  </Button>
                ))}
              </div>
            </div>
            {draft.rules.map((rule, index) => (
              <div key={index} className="mb-4 space-y-2 rounded-lg border p-3">
                {index > 0 && (
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {draft.match === "all" ? "AND" : "OR"}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <Select
                    value={rule.field}
                    onValueChange={(field) => {
                      const definition = fields.find((f) => f.key === field)!;
                      changeRule(index, {
                        field,
                        operator: filterOperators(definition.kind)[0]!,
                        values: [],
                      });
                    }}
                  >
                    <SelectTrigger
                      aria-label={`Filter ${index + 1} field`}
                      className="min-w-0 flex-1"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((field) => (
                        <SelectItem key={field.key} value={field.key}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove filter ${index + 1}`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        rules: draft.rules.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <X />
                  </Button>
                </div>
                <FilterRuleEditor
                  rule={rule}
                  field={fields.find((f) => f.key === rule.field)}
                  data={data}
                  resource={resource}
                  index={index}
                  onChange={(r) => changeRule(index, r)}
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={!fields.length || draft.rules.length >= 32}
              onClick={() => {
                const field = fields[0]!;
                setDraft({
                  ...draft,
                  rules: [
                    ...draft.rules,
                    {
                      field: field.key,
                      operator: filterOperators(field.kind)[0]!,
                      values: [],
                    },
                  ],
                });
              }}
            >
              <Plus />
              Add filter
            </Button>
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="flex shrink-0 justify-between gap-2 border-t p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(EMPTY_TABLE_FILTERS);
                state.apply(EMPTY_TABLE_FILTERS);
                onClearLegacy?.();
              }}
            >
              Clear filters
            </Button>
            <Button
              size="sm"
              onClick={() => {
                try {
                  validateTableFilters(draft, fields);
                  state.apply(draft);
                  state.setOpen(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Invalid filter.");
                }
              }}
            >
              Apply filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
