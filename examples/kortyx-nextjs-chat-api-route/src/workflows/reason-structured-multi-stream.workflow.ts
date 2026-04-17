import { defineWorkflow } from "kortyx";
import { step1ReasonStructuredMultiStreamNode } from "@/nodes/reason/step1-reason-structured-multi-stream.node";

export const reasonStructuredMultiStreamWorkflow = defineWorkflow({
  id: "reason-structured-multi-stream",
  version: "1.0.0",
  description:
    "Single-node structured streaming demo with multiple text-delta and append fields.",
  nodes: {
    reason: { run: step1ReasonStructuredMultiStreamNode, params: {} },
  },
  edges: [
    ["__start__", "reason"],
    ["reason", "__end__"],
  ],
});
