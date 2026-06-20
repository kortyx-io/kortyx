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
    provider,
    toolOnly,
    minCost,
    minDuration,
    timeRange,
    activeFilterCount,
    setParams,
    toggleStatus,
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
                type="radio"
                name="provider"
                checked={!provider}
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
                  type="radio"
                  name="provider"
                  checked={provider === item}
                  onChange={() => setParams({ provider: item })}
                  className="accent-primary"
                />
                {item}
              </label>
            ))}
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

          <FilterSection title="Thresholds">
            <label
              htmlFor="minimum-cost"
              className="block text-xs font-medium text-muted-foreground"
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
            <label
              htmlFor="minimum-duration"
              className="mt-3 block text-xs font-medium text-muted-foreground"
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
          </FilterSection>
        </div>
      </ScrollArea>

      <div className="flex h-14 shrink-0 items-center border-t p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          disabled={activeFilterCount === 0}
          onClick={clearFilters}
        >
          <X /> Clear filters
        </Button>
      </div>
    </aside>
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
