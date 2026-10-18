"use client";
import type { StudioTimeRange } from "@kortyx/telemetry-contracts";
import { useId } from "react";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { studioHelp } from "@/lib/studio-help";
import { TimeRangeFilter } from "./time-range-filter";
export function OperationalFilterScope({
  query,
}: {
  query: {
    range?: StudioTimeRange;
    timeRange?: StudioTimeRange;
    startedAfter: string;
    startedBefore: string;
    env?: string;
    environment?: string;
    includeChildren?: boolean;
    setParams: (values: {
      range?: StudioTimeRange | null;
      startedAfter?: string | null;
      startedBefore?: string | null;
      env?: string | null;
      includeChildren?: boolean | null;
    }) => unknown;
  };
}) {
  const environmentId = useId();
  return (
    <div className="space-y-4">
      <TimeRangeFilter
        range={query.range ?? query.timeRange ?? "24 hours"}
        startedAfter={query.startedAfter}
        startedBefore={query.startedBefore}
        onChange={(value) =>
          query.setParams({
            range: value.range === "24 hours" ? null : value.range,
            startedAfter: value.startedAfter || null,
            startedBefore: value.startedBefore || null,
          })
        }
      />
      <label htmlFor={environmentId} className="block text-xs font-medium">
        Environment
        <Input
          id={environmentId}
          aria-label="Environment"
          className="mt-2"
          value={
            (query.env ?? query.environment) === "All environments"
              ? ""
              : (query.env ?? query.environment ?? "")
          }
          placeholder="All environments"
          onChange={(event) =>
            query.setParams({ env: event.target.value || null })
          }
        />
      </label>
      {query.includeChildren !== undefined && (
        <div className="flex items-center gap-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={query.includeChildren}
              onChange={() =>
                query.setParams({
                  includeChildren: !query.includeChildren || null,
                })
              }
            />
            Include child workflows
          </label>
          <HelpCircle help={studioHelp.children} />
        </div>
      )}
    </div>
  );
}
