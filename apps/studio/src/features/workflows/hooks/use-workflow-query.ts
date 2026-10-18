"use client";

import {
  STUDIO_TIME_RANGES,
  type StudioTimeRange,
} from "@kortyx/telemetry-contracts";
import { type Options, parseAsString, parseAsStringLiteral } from "nuqs";
import { useStudioQueryStates } from "@/lib/nuqs";
import {
  type WorkflowSelection,
  workflowHealthFilters,
  workflowMetrics,
  workflowViewModes,
} from "../lib/view-state";
import type { WorkflowSystem } from "../schema";

const parsers = {
  q: parseAsString.withDefault(""),
  health: parseAsStringLiteral(workflowHealthFilters).withDefault("all"),
  mode: parseAsStringLiteral(workflowViewModes).withDefault("system"),
  metric: parseAsStringLiteral(workflowMetrics).withDefault("volume"),
  range: parseAsStringLiteral(STUDIO_TIME_RANGES).withDefault("24 hours"),
  startedAfter: parseAsString.withDefault(""),
  startedBefore: parseAsString.withDefault(""),
  version: parseAsString.withDefault(""),
  workflow: parseAsString.withDefault(""),
  node: parseAsString.withDefault(""),
  transition: parseAsString.withDefault(""),
};

export function useWorkflowQuery(transitions: WorkflowSystem["transitions"]) {
  const [params, setQueryStates] = useStudioQueryStates(parsers);
  const selection: WorkflowSelection = params.transition
    ? { type: "transition", id: params.transition }
    : params.node
      ? { type: "node", workflowId: params.workflow, id: params.node }
      : { type: "workflow", id: params.workflow };

  function setParams(
    changes: Parameters<typeof setQueryStates>[0],
    options?: Options,
  ) {
    return setQueryStates(changes, { shallow: true, ...options });
  }

  function setSelection(next: WorkflowSelection) {
    switch (next.type) {
      case "workflow":
        return setQueryStates(
          {
            workflow: next.id,
            version: params.workflow === next.id ? params.version : null,
            node: null,
            transition: null,
          },
          { shallow: params.workflow === next.id || !params.version },
        );
      case "node":
        return setQueryStates(
          {
            workflow: next.workflowId,
            version:
              params.workflow === next.workflowId ? params.version : null,
            node: next.id,
            transition: null,
          },
          {
            shallow: params.workflow === next.workflowId || !params.version,
          },
        );
      case "transition": {
        const sourceWorkflowId =
          transitions.find((path) => path.id === next.id)?.sourceWorkflowId ??
          params.workflow;
        return setQueryStates(
          {
            transition: next.id,
            node: null,
            workflow: sourceWorkflowId,
            version:
              params.workflow === sourceWorkflowId ? params.version : null,
          },
          {
            shallow: params.workflow === sourceWorkflowId || !params.version,
          },
        );
      }
    }
  }

  function setTimeRange(value: {
    range: StudioTimeRange;
    startedAfter: string;
    startedBefore: string;
  }) {
    return setQueryStates(
      {
        range: value.range === "24 hours" ? null : value.range,
        startedAfter: value.startedAfter || null,
        startedBefore: value.startedBefore || null,
      },
      { shallow: false },
    );
  }

  return { params, selection, setParams, setSelection, setTimeRange };
}
