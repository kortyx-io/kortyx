import { defineWorkflow } from "kortyx";
import { outputContractDemoNode } from "@/nodes/reason/output-contract-demo.node";

export const outputContractDemoWorkflow = defineWorkflow({
  id: "output-contract-demo",
  version: "1.0.0",
  description:
    "Realtime model-selected output contracts with multiple emissions and a terminal return.",
  nodes: {
    reason: { run: outputContractDemoNode },
  },
  edges: [
    ["__start__", "reason"],
    ["reason", "__end__"],
  ],
});
