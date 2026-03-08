import { defineWorkflow } from "kortyx";
import { step1ReasonInterruptStructuredNode } from "@/nodes/reason/step1-reason-interrupt-structured.node";

export const reasonInterruptStructuredWorkflow = defineWorkflow({
  id: "reason-interrupt-structured",
  version: "1.0.0",
  description:
    "Workflow demonstrating useReason outputSchema + interrupt + structured stream updates.",
  nodes: {
    reason: { run: step1ReasonInterruptStructuredNode, params: {} },
  },
  edges: [
    ["__start__", "reason"],
    ["reason", "__end__"],
  ],
});
