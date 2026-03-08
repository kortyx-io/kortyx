import { defineWorkflow } from "kortyx";
import { step1ParseInputNode } from "@/nodes/flow/step1-parse-input.node";
import { step2EnrichNode } from "@/nodes/flow/step2-enrich.node";
import { step2TodoCheckNode } from "@/nodes/flow/step2-todo-check.node";
import { step3FinalNode } from "@/nodes/flow/step3-final.node";

// Hooks demo:
// - useWorkflowState: shared `todos` + `checked` across nodes for this run
// - useNodeState: node-local `idx` to loop over todos (resets when leaving node)
export const threeStepsWorkflow = defineWorkflow({
  id: "three-steps",
  version: "1.0.0",
  description: "Workflow demonstrating useWorkflowState + useNodeState (loop).",
  nodes: {
    parse: { run: step1ParseInputNode, params: {} },
    todo: { run: step2TodoCheckNode, params: {} },
    enrich: { run: step2EnrichNode, params: {} },
    final: { run: step3FinalNode, params: {} },
  },
  edges: [
    ["__start__", "parse"],
    ["parse", "todo"],
    ["todo", "todo", { when: "more" }],
    ["todo", "enrich", { when: "done" }],
    ["enrich", "final"],
    ["final", "__end__"],
  ],
});
