import { defineWorkflow } from "kortyx";
import { step1ReasonStructuredStreamNode } from "@/nodes/reason/step1-reason-structured-stream.node";

export const reasonStructuredStreamWorkflow = defineWorkflow({
  id: "reason-structured-stream",
  version: "1.0.0",
  description:
    "Single-node structured streaming demo with text and append updates.",
  nodes: {
    reason: { run: step1ReasonStructuredStreamNode, params: {} },
  },
  edges: [
    ["__start__", "reason"],
    ["reason", "__end__"],
  ],
});
