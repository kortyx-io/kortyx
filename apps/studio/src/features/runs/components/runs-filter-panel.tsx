"use client";
import { X } from "lucide-react";
import { useState } from "react";
import { FilterAutocomplete } from "@/components/data-table/filter-autocomplete";
import type { DataTableFilterPanel } from "@/components/data-table/types";
import { useFilterValues } from "@/components/data-table/use-filter-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useRunsQuery } from "@/features/runs/hooks/use-runs-query";
import { providers, statuses, statusMeta } from "@/features/runs/lib/constants";
import { FilterCheckbox } from "@/features/telemetry/components/list-filter-panel";
import { TimeRangeFilter } from "@/features/telemetry/components/time-range-filter";
import { adaptQuery, changeBound, readBound } from "../lib/filter-panel-query";
import type { Run } from "../schema";

type RunsFilterPanelProps = {
  query: ReturnType<typeof useRunsQuery>;
  panel?: DataTableFilterPanel<Run>;
  open: boolean;
  onClose: () => void;
};

export function RunsFilterPanel({
  query: source,
  panel,
  open,
  onClose,
}: RunsFilterPanelProps) {
  const query = panel ? adaptQuery(source, panel) : source;
  const providerSuggestions = useFilterValues("runs", "provider", "", open);
  const providerItems = [...providers, ...providerSuggestions.values].filter(
    (value, index, all) =>
      all.findIndex((item) => item.toLowerCase() === value.toLowerCase()) ===
      index,
  );
  const numericValue = (field: string, value: number) =>
    panel
      ? panel.filters.rules.some(
          (rule) =>
            rule.field === field &&
            ["gte", "gt", "between", "is"].includes(rule.operator),
        )
        ? value
        : ""
      : value || "";
  const {
    includeChildren,
    selectedStatuses,
    selectedProviders,
    toolOnly,
    toolName,
    toolOutcome,
    toolMode,
    minCost,
    minDuration,
    minTokens,
    model,
    path,
    result,
    session,
    startedAfter,
    startedBefore,
    timeRange,
    workflow,
    activeFilterCount,
    hasActiveFilters,
    setParams,
    toggleStatus,
    toggleProvider,
    clearFilters,
  } = query;

  return (
    <aside
      aria-label="Filters"
      aria-hidden={!open}
      inert={!open}
      className="flex h-full w-72 flex-col overflow-hidden rounded-xl border bg-background shadow-sm transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Filters</h2>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-foreground px-1.5 text-[10px] leading-4 text-background">
              {activeFilterCount}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close filters"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <ScrollArea type="hover" className="min-h-0 flex-1">
        <div className="p-4">
          <FilterSection title="Time range">
            <TimeRangeFilter
              idPrefix="runs"
              range={timeRange}
              startedAfter={startedAfter}
              startedBefore={startedBefore}
              onChange={(value) =>
                setParams({
                  range: value.range === "24 hours" ? null : value.range,
                  startedAfter: value.startedAfter || null,
                  startedBefore: value.startedBefore || null,
                })
              }
            />
          </FilterSection>

          <FilterSection title="Execution">
            <FilterCheckbox
              label="Include child workflows"
              checked={includeChildren}
              onChange={() =>
                setParams({ includeChildren: !includeChildren || null })
              }
            />
          </FilterSection>

          {panel && (
            <div className="border-b py-2 [&>div>p]:hidden [&>div]:mb-0">
              {panel.matchControl}
            </div>
          )}
          <FilterSection title="Run status">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="mb-1 ml-2"
              onClick={() =>
                setParams({
                  status:
                    selectedStatuses.length === statuses.length
                      ? []
                      : [...statuses],
                })
              }
            >
              {selectedStatuses.length === statuses.length
                ? "Deselect all"
                : "Select all"}
            </Button>
            {statuses.map((status) => (
              <FilterCheckbox
                key={status}
                label={statusMeta[status].label}
                checked={selectedStatuses.includes(status)}
                onChange={() => toggleStatus(status)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Provider">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="mb-1 ml-2"
              onClick={() =>
                setParams({
                  provider:
                    selectedProviders.length === providerItems.length
                      ? null
                      : [...providerItems],
                })
              }
            >
              {selectedProviders.length === providerItems.length
                ? "Deselect all"
                : "Select all"}
            </Button>
            {providerItems.map((item) => (
              <FilterCheckbox
                key={item}
                label={item}
                checked={selectedProviders.some(
                  (value) => value.toLowerCase() === item.toLowerCase(),
                )}
                onChange={() => toggleProvider(item)}
              />
            ))}
          </FilterSection>

          {panel && panel.renderField("feedback")}
          <FilterSection title="Column values">
            <TextFilter
              id="workflow-filter"
              label="Workflow"
              value={workflow}
              onChange={(value) => setParams({ workflow: value || null })}
              placeholder="Contains…"
            />
            <TextFilter
              id="path-filter"
              label="Path"
              value={path}
              onChange={(value) => setParams({ path: value || null })}
              placeholder="Contains node…"
            />
            <TextFilter
              id="session-filter"
              label="Session"
              value={session}
              onChange={(value) => setParams({ session: value || null })}
              placeholder="Contains ID…"
            />
            <TextFilter
              id="model-filter"
              label="Model"
              value={model}
              onChange={(value) => setParams({ model: value || null })}
              placeholder="Contains model…"
            />
            <TextFilter
              id="result-filter"
              label="Result"
              value={result}
              onChange={(value) => setParams({ result: value || null })}
              placeholder="Contains result…"
            />
          </FilterSection>

          <FilterSection title="Tools">
            <TextFilter
              id="tool-name-filter"
              label="Tool name"
              value={toolName}
              onChange={(value) => setParams({ toolName: value || null })}
              placeholder="Exact tool name…"
            />
            <div className="mt-3 text-xs font-medium text-muted-foreground">
              <span>Tool outcome</span>
              <Select
                value={toolOutcome || "__all__"}
                onValueChange={(value) =>
                  setParams({ toolOutcome: value === "__all__" ? null : value })
                }
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Tool outcome"
                  className="mt-1.5 w-full text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All outcomes</SelectItem>
                  {[
                    ["success", "Succeeded"],
                    ["denied", "Denied"],
                    ["fault", "Fault"],
                    ["cancelled", "Cancelled"],
                    ["reused", "Cached reuse"],
                  ].map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 text-xs font-medium text-muted-foreground">
              <span>Called by</span>
              <Select
                value={toolMode || "__all__"}
                onValueChange={(value) =>
                  setParams({ toolMode: value === "__all__" ? null : value })
                }
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Called by"
                  className="mt-1.5 w-full text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All callers</SelectItem>
                  <SelectItem value="direct">Workflow code</SelectItem>
                  <SelectItem value="model">Model</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </FilterSection>

          <FilterSection title="Options">
            <FilterCheckbox
              label="Has tool call"
              checked={toolOnly}
              onChange={() => setParams({ tool: toolOnly ? null : true })}
            />
          </FilterSection>

          <FilterSection title="Numeric columns">
            <label
              htmlFor="minimum-duration"
              className="block text-xs font-medium text-muted-foreground"
            >
              Minimum duration
              <Input
                aria-label="Minimum duration"
                id="minimum-duration"
                type="number"
                min="0"
                step="1"
                value={numericValue("durationMs", minDuration)}
                onChange={(event) =>
                  setParams({
                    minDuration: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                placeholder="seconds"
                className="mt-1.5"
              />
            </label>
            <label
              htmlFor="minimum-tokens"
              className="mt-3 block text-xs font-medium text-muted-foreground"
            >
              Minimum tokens
              <Input
                aria-label="Minimum tokens"
                id="minimum-tokens"
                type="number"
                min="0"
                step="1"
                value={numericValue("tokens", minTokens)}
                onChange={(event) =>
                  setParams({
                    minTokens: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                placeholder="tokens"
                className="mt-1.5"
              />
            </label>
            <label
              htmlFor="minimum-cost"
              className="mt-3 block text-xs font-medium text-muted-foreground"
            >
              Minimum cost
              <Input
                aria-label="Minimum cost"
                id="minimum-cost"
                type="number"
                min="0"
                step="0.001"
                value={numericValue("cost", minCost)}
                onChange={(event) =>
                  setParams({
                    minCost: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                placeholder="$0.00"
                className="mt-1.5"
              />
            </label>
          </FilterSection>
          {panel && (
            <>
              <FilterSection title="Maximum values">
                {[
                  ["durationMs", "Maximum duration", "seconds"],
                  ["tokens", "Maximum tokens", "tokens"],
                  ["cost", "Maximum cost", "$0.00"],
                ].map(([key, label, placeholder]) => (
                  <label
                    key={key}
                    htmlFor={`maximum-${key}`}
                    className="mt-3 block first:mt-0 text-xs font-medium text-muted-foreground"
                  >
                    {label}
                    <Input
                      aria-label={label}
                      id={`maximum-${key}`}
                      className="mt-1.5"
                      type="number"
                      step="any"
                      placeholder={placeholder}
                      value={readBound(panel, key!, true) ?? ""}
                      onChange={(event) =>
                        changeBound(
                          panel,
                          key!,
                          true,
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value),
                        )
                      }
                    />
                  </label>
                ))}
              </FilterSection>
              <FilterSection title="Additional columns">
                {panel.fields
                  .filter(
                    (field) =>
                      ![
                        "status",
                        "provider",
                        "feedback",
                        "workflowIds",
                        "path",
                        "sessionId",
                        "models",
                        "result",
                        "toolName",
                        "toolOutcome",
                        "toolMode",
                        "hasTool",
                        "durationMs",
                        "tokens",
                        "cost",
                      ].includes(field.key),
                  )
                  .map((field) => (
                    <div key={field.key}>{panel.renderField(field.key)}</div>
                  ))}
              </FilterSection>
              {panel.error && (
                <p role="alert" className="mt-3 text-xs text-destructive">
                  {panel.error}
                </p>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <div className="flex h-14 shrink-0 items-center border-t p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          disabled={
            panel
              ? !panel.invalid &&
                !panel.filters.rules.length &&
                !hasActiveFilters
              : !hasActiveFilters
          }
          onClick={panel?.onClear ?? clearFilters}
        >
          <X /> Clear filters
        </Button>
      </div>
    </aside>
  );
}

function TextFilter({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  const field: Record<string, string> = {
    "workflow-filter": "workflowIds",
    "path-filter": "path",
    "session-filter": "sessionId",
    "model-filter": "models",
    "result-filter": "result",
    "tool-name-filter": "toolName",
  };
  const suggestions = useFilterValues(
    "runs",
    field[id] ?? "id",
    value,
    focused,
  );
  return (
    <label
      htmlFor={id}
      data-filter-field={field[id]}
      className="mt-3 block first:mt-0 text-xs font-medium text-muted-foreground"
    >
      {label}
      <FilterAutocomplete
        id={id}
        label={label}
        options={suggestions.values}
        onFocus={() => setFocused(true)}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="mt-1.5"
      />
      {suggestions.unavailable && (
        <span className="mt-1 block text-[11px]">
          Suggestions unavailable. You can still enter a value.
        </span>
      )}
    </label>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b py-4 first:pt-0 last:border-b-0">
      <h3 className="mb-2 px-2 text-xs font-medium text-muted-foreground">
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}
