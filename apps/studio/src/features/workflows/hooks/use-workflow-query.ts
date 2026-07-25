"use client";

import {
  STUDIO_TIME_RANGES,
  type StudioTimeRange,
} from "@kortyx/telemetry-contracts";
import { type Options, parseAsString, parseAsStringLiteral } from "nuqs";
import { useEffect, useRef } from "react";
import { useStudioQueryStates } from "@/lib/nuqs";
import {
  DEFAULT_WORKFLOW_ID,
  type WorkflowSelection,
  workflowHealthFilters,
  workflowMetrics,
  workflowViewModes,
} from "../lib/view-state";

const parsers = {
  q: parseAsString.withDefault(""),
  health: parseAsStringLiteral(workflowHealthFilters).withDefault("all"),
  mode: parseAsStringLiteral(workflowViewModes).withDefault("system"),
  metric: parseAsStringLiteral(workflowMetrics).withDefault("volume"),
  range: parseAsStringLiteral(STUDIO_TIME_RANGES).withDefault("24 hours"),
  startedAfter: parseAsString.withDefault(""),
  startedBefore: parseAsString.withDefault(""),
  version: parseAsString.withDefault(""),
  workflow: parseAsString
    .withDefault(DEFAULT_WORKFLOW_ID)
    .withOptions({ clearOnDefault: false }),
  node: parseAsString.withDefault(""),
  transition: parseAsString.withDefault(""),
};

function sourceWorkflowFromTransitionId(transitionId: string): string | null {
  const sourceWorkflowId = transitionId.split(":")[0];
  return sourceWorkflowId || null;
}

export function useWorkflowQuery() {
  const [params, setQueryStates] = useStudioQueryStates(parsers);
  const didCanonicalizeWorkflow = useRef(false);
  const selection: WorkflowSelection = params.transition
    ? { type: "transition", id: params.transition }
    : params.node
      ? { type: "node", workflowId: params.workflow, id: params.node }
      : { type: "workflow", id: params.workflow };

  useEffect(() => {
    if (didCanonicalizeWorkflow.current) return;
    didCanonicalizeWorkflow.current = true;
    if (typeof window === "undefined") return;
    const hasWorkflow = new URLSearchParams(window.location.search).has(
      "workflow",
    );
    if (!hasWorkflow) {
      void setQueryStates(
        { workflow: params.workflow },
        { history: "replace", shallow: true },
      );
    }
  }, [params.workflow, setQueryStates]);

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
          sourceWorkflowFromTransitionId(next.id) ?? params.workflow;
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
