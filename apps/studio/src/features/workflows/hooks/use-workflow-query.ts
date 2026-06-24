"use client";

import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import {
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
  workflow: parseAsString.withDefault("general-chat"),
  node: parseAsString.withDefault(""),
  transition: parseAsString.withDefault(""),
};

export function useWorkflowQuery() {
  const [params, setParams] = useQueryStates(parsers);
  const selection: WorkflowSelection = params.transition
    ? { type: "transition", id: params.transition }
    : params.node
      ? { type: "node", workflowId: params.workflow, id: params.node }
      : { type: "workflow", id: params.workflow };

  function setSelection(next: WorkflowSelection) {
    switch (next.type) {
      case "workflow":
        return setParams({
          workflow: next.id,
          node: null,
          transition: null,
        });
      case "node":
        return setParams({
          workflow: next.workflowId,
          node: next.id,
          transition: null,
        });
      case "transition":
        return setParams({ transition: next.id, node: null });
    }
  }

  return { params, selection, setParams, setSelection };
}
