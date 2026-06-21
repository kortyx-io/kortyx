import type { useSessionsQuery } from "@/features/sessions/hooks/use-sessions-query";
import { FilterCheckboxGroup } from "@/features/telemetry/components/filter-checkbox-group";
import {
  FilterCheckbox,
  FilterSection,
  FilterText,
  ListFilterPanel,
} from "@/features/telemetry/components/list-filter-panel";
import { TimeRangeFilter } from "@/features/telemetry/components/time-range-filter";

const statuses = [
  "running",
  "completed",
  "interrupted",
  "failed",
  "cancelled",
] as const;

export function SessionsFilterPanel({
  query,
  open,
  onClose,
}: {
  query: ReturnType<typeof useSessionsQuery>;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <ListFilterPanel
      ariaLabel="Session filters"
      open={open}
      onClose={onClose}
      activeFilterCount={query.activeFilterCount}
      hasActiveFilters={query.hasActiveFilters}
      onClear={query.clearFilters}
    >
      <FilterSection title="Time range">
        <TimeRangeFilter
          idPrefix="sessions"
          range={query.range}
          startedAfter={query.startedAfter}
          startedBefore={query.startedBefore}
          onRangeChange={(range) =>
            query.setParams({ range: range === "24 hours" ? null : range })
          }
          onStartedAfterChange={(startedAfter) =>
            query.setParams({ startedAfter: startedAfter || null })
          }
          onStartedBeforeChange={(startedBefore) =>
            query.setParams({ startedBefore: startedBefore || null })
          }
        />
      </FilterSection>
      <FilterSection title="Status">
        <FilterCheckboxGroup
          items={statuses}
          selected={query.status}
          labels={Object.fromEntries(
            statuses.map((status) => [
              status,
              status[0].toUpperCase() + status.slice(1),
            ]),
          )}
          onChange={(status) => query.setParams({ status })}
        />
      </FilterSection>
      <FilterSection title="Identity & workflow">
        <FilterText
          id="session-workflow"
          label="Workflow / version"
          value={query.workflow}
          onChange={(value) => query.setParams({ workflow: value || null })}
          placeholder="Contains…"
        />
        <FilterText
          id="session-user"
          label="User ID"
          value={query.user}
          onChange={(value) => query.setParams({ user: value || null })}
          placeholder="Contains…"
        />
        <FilterText
          id="session-tenant"
          label="Tenant ID"
          value={query.tenant}
          onChange={(value) => query.setParams({ tenant: value || null })}
          placeholder="Contains…"
        />
        <FilterText
          id="session-tags"
          label="Tags"
          value={query.tags}
          onChange={(value) => query.setParams({ tags: value || null })}
          placeholder="Contains tag…"
        />
      </FilterSection>
      <FilterSection title="Model">
        <FilterText
          id="session-provider"
          label="Provider"
          value={query.provider}
          onChange={(value) => query.setParams({ provider: value || null })}
          placeholder="OpenAI, Anthropic…"
        />
        <FilterText
          id="session-model"
          label="Model"
          value={query.model}
          onChange={(value) => query.setParams({ model: value || null })}
          placeholder="Contains model…"
        />
      </FilterSection>
      <FilterSection title="Flags">
        <FilterCheckbox
          label="Has error"
          checked={query.error}
          onChange={() => query.setParams({ error: query.error ? null : true })}
        />
        <FilterCheckbox
          label="Has interrupt"
          checked={query.interrupt}
          onChange={() =>
            query.setParams({ interrupt: query.interrupt ? null : true })
          }
        />
        <FilterCheckbox
          label="Has checkpoint"
          checked={query.checkpoint}
          onChange={() =>
            query.setParams({ checkpoint: query.checkpoint ? null : true })
          }
        />
        <FilterCheckbox
          label="Has fork / branch"
          checked={query.fork}
          onChange={() => query.setParams({ fork: query.fork ? null : true })}
        />
      </FilterSection>
      <FilterSection title="Aggregate ranges">
        <FilterText
          id="session-min-cost"
          type="number"
          label="Minimum cost"
          value={query.minCost || ""}
          onChange={(value) =>
            query.setParams({ minCost: value ? Number(value) : null })
          }
          placeholder="$0.00"
        />
        <FilterText
          id="session-max-cost"
          type="number"
          label="Maximum cost"
          value={query.maxCost || ""}
          onChange={(value) =>
            query.setParams({ maxCost: value ? Number(value) : null })
          }
          placeholder="$0.00"
        />
        <FilterText
          id="session-min-tokens"
          type="number"
          label="Minimum tokens"
          value={query.minTokens || ""}
          onChange={(value) =>
            query.setParams({ minTokens: value ? Number(value) : null })
          }
          placeholder="Tokens"
        />
        <FilterText
          id="session-min-duration"
          type="number"
          label="Minimum duration"
          value={query.minDuration || ""}
          onChange={(value) =>
            query.setParams({ minDuration: value ? Number(value) : null })
          }
          placeholder="Seconds"
        />
        <FilterText
          id="session-max-tokens"
          type="number"
          label="Maximum tokens"
          value={query.maxTokens || ""}
          onChange={(value) =>
            query.setParams({ maxTokens: value ? Number(value) : null })
          }
          placeholder="Tokens"
        />
        <FilterText
          id="session-max-duration"
          type="number"
          label="Maximum duration"
          value={query.maxDuration || ""}
          onChange={(value) =>
            query.setParams({ maxDuration: value ? Number(value) : null })
          }
          placeholder="Seconds"
        />
      </FilterSection>
    </ListFilterPanel>
  );
}
