import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { useRunsQuery } from "@/features/runs/hooks/use-runs-query";
import {
  providers,
  statuses,
  statusMeta,
  timeRanges,
} from "@/features/runs/lib/constants";
import { cn } from "@/lib/utils";

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
            <div className="relative px-2">
              <select
                aria-label="Time range"
                value={timeRange}
                onChange={(event) =>
                  setParams({
                    range:
                      event.target.value === "24 hours"
                        ? null
                        : event.target.value,
                  })
                }
                className="h-9 w-full appearance-none rounded-md border bg-background pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              >
                {timeRanges.map((range) => (
                  <option key={range}>{range}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            {timeRange === "Custom range" && (
              <div className="mt-3 space-y-3 px-2">
                <label
                  htmlFor="started-after"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Started after
                  <Input
                    aria-label="Started after"
                    id="started-after"
                    type="datetime-local"
                    value={startedAfter}
                    onChange={(event) =>
                      setParams({ startedAfter: event.target.value || null })
                    }
                    className="mt-1.5"
                  />
                </label>
                <label
                  htmlFor="started-before"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Started before
                  <Input
                    aria-label="Started before"
                    id="started-before"
                    type="datetime-local"
                    value={startedBefore}
                    onChange={(event) =>
                      setParams({ startedBefore: event.target.value || null })
                    }
                    className="mt-1.5"
                  />
                </label>
              </div>
            )}
          </FilterSection>

          <FilterSection title="Run status">
            {statuses.map((status) => {
              const checked = selectedStatuses.includes(status);
              return (
                <label
                  key={status}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleStatus(status)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-sm border border-input bg-background text-background",
                      checked && "border-primary bg-primary",
                    )}
                  >
                    {checked && <Check className="size-3" />}
                  </span>
                  {statusMeta[status].label}
                </label>
              );
            })}
          </FilterSection>

          <FilterSection title="Provider">
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <input
                type="checkbox"
                checked={selectedProviders.length === 0}
                onChange={() => setParams({ provider: null })}
                className="accent-primary"
              />
              All providers
            </label>
            {providers.map((item) => (
              <label
                key={item}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selectedProviders.includes(item)}
                  onChange={() => toggleProvider(item)}
                  className="accent-primary"
                />
                {item}
              </label>
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
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <input
                type="checkbox"
                checked={toolOnly}
                onChange={() => setParams({ tool: toolOnly ? null : true })}
                className="size-4 accent-primary"
              />
              Has tool call
            </label>
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
