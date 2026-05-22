import { defineWorkflow } from "kortyx";
import { step1ReasonStructuredWildcardStreamNode } from "@/nodes/reason/step1-reason-structured-wildcard-stream.node";

export const reasonStructuredWildcardStreamWorkflow = defineWorkflow({
  id: "reason-structured-wildcard-stream",
  version: "1.0.0",
  description:
    "Single-node structured streaming demo with wildcard paths for model-generated record keys.",
  nodes: {
    reason: { run: step1ReasonStructuredWildcardStreamNode, params: {} },
  },
  edges: [
    ["__start__", "reason"],
    ["reason", "__end__"],
  ],
});
