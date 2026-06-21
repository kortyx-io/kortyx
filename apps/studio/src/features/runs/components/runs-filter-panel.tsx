import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { useRunsQuery } from "@/features/runs/hooks/use-runs-query";
import { providers, statuses, statusMeta } from "@/features/runs/lib/constants";
import { FilterCheckbox } from "@/features/telemetry/components/list-filter-panel";
import { TimeRangeFilter } from "@/features/telemetry/components/time-range-filter";

type RunsFilterPanelProps = {
  query: ReturnType<typeof useRunsQuery>;
  open: boolean;
  onClose: () => void;
};

export function RunsFilterPanel({
  query,
  open,
  onClose,
}: RunsFilterPanelProps) {
  const {
    selectedStatuses,
    selectedProviders,
    toolOnly,
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
      aria-label="Run filters"
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
              onRangeChange={(range) =>
                setParams({ range: range === "24 hours" ? null : range })
              }
              onStartedAfterChange={(startedAfter) =>
                setParams({ startedAfter: startedAfter || null })
              }
              onStartedBeforeChange={(startedBefore) =>
                setParams({ startedBefore: startedBefore || null })
              }
            />
          </FilterSection>

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
                    selectedProviders.length === providers.length
                      ? null
                      : [...providers],
                })
              }
            >
              {selectedProviders.length === providers.length
                ? "Deselect all"
                : "Select all"}
            </Button>
            {providers.map((item) => (
              <FilterCheckbox
                key={item}
                label={item}
                checked={selectedProviders.includes(item)}
                onChange={() => toggleProvider(item)}
              />
            ))}
          </FilterSection>

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
                value={minDuration || ""}
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
                value={minTokens || ""}
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
                value={minCost || ""}
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
        </div>
      </ScrollArea>

      <div className="flex h-14 shrink-0 items-center border-t p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          disabled={!hasActiveFilters}
          onClick={clearFilters}
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
  return (
    <label
      htmlFor={id}
      className="mt-3 block first:mt-0 text-xs font-medium text-muted-foreground"
    >
      {label}
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5"
      />
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
