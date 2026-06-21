import type { useInterruptsQuery } from "@/features/interrupts/hooks/use-interrupts-query";
import { FilterCheckboxGroup } from "@/features/telemetry/components/filter-checkbox-group";
import {
  FilterCheckbox,
  FilterSection,
  FilterText,
  ListFilterPanel,
} from "@/features/telemetry/components/list-filter-panel";
import { TimeRangeFilter } from "@/features/telemetry/components/time-range-filter";

const statuses = [
  "pending",
  "resolved",
  "expired",
  "failed",
  "cancelled",
] as const;
const types = ["choice", "multi-choice", "text"] as const;
const outcomes = [
  "resumed",
  "resume failed",
  "expired before resume",
  "cancelled",
] as const;

export function InterruptsFilterPanel({
  query,
  open,
  onClose,
}: {
  query: ReturnType<typeof useInterruptsQuery>;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <ListFilterPanel
      ariaLabel="Interrupt filters"
      open={open}
      onClose={onClose}
      activeFilterCount={query.activeFilterCount}
      hasActiveFilters={query.hasActiveFilters}
      onClear={query.clearFilters}
    >
      <FilterSection title="Time range">
        <TimeRangeFilter
          idPrefix="interrupts"
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
      <FilterSection title="Interrupt type">
        {types.map((type) => (
          <FilterCheckbox
            key={type}
            label={type}
            checked={query.type.includes(type)}
            onChange={() => query.toggleType(type)}
          />
        ))}
      </FilterSection>
      <FilterSection title="Workflow & identity">
        <FilterText
          id="interrupt-workflow"
          label="Workflow"
          value={query.workflow}
          onChange={(value) => query.setParams({ workflow: value || null })}
          placeholder="Contains…"
        />
        <FilterText
          id="interrupt-node"
          label="Node"
          value={query.node}
          onChange={(value) => query.setParams({ node: value || null })}
          placeholder="Contains…"
        />
        <FilterText
          id="interrupt-session"
          label="Session ID"
          value={query.session}
          onChange={(value) => query.setParams({ session: value || null })}
          placeholder="Contains…"
        />
        <FilterText
          id="interrupt-user"
          label="User ID"
          value={query.user}
          onChange={(value) => query.setParams({ user: value || null })}
          placeholder="Contains…"
        />
        <FilterText
          id="interrupt-tenant"
          label="Tenant ID"
          value={query.tenant}
          onChange={(value) => query.setParams({ tenant: value || null })}
          placeholder="Contains…"
        />
        <FilterText
          id="interrupt-resolver"
          label="Assigned / resolved by"
          value={query.resolver}
          onChange={(value) => query.setParams({ resolver: value || null })}
          placeholder="Contains…"
        />
      </FilterSection>
      <FilterSection title="Pending age (minutes)">
        <FilterText
          id="interrupt-min-age"
          type="number"
          label="Minimum age"
          value={query.minAge || ""}
          onChange={(value) =>
            query.setParams({ minAge: value ? Number(value) : null })
          }
          placeholder="Minutes"
        />
        <FilterText
          id="interrupt-max-age"
          type="number"
          label="Maximum age"
          value={query.maxAge || ""}
          onChange={(value) =>
            query.setParams({ maxAge: value ? Number(value) : null })
          }
          placeholder="Minutes"
        />
      </FilterSection>
      <FilterSection title="Resume outcome">
        {outcomes.map((outcome) => (
          <FilterCheckbox
            key={outcome}
            label={outcome}
            checked={query.outcome.includes(outcome)}
            onChange={() => query.toggleOutcome(outcome)}
          />
        ))}
        <FilterCheckbox
          label="Has error"
          checked={query.error}
          onChange={() => query.setParams({ error: query.error ? null : true })}
        />
      </FilterSection>
    </ListFilterPanel>
  );
}
