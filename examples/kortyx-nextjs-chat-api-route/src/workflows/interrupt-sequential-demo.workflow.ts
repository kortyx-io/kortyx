import { defineWorkflow } from "kortyx";
import { step1AskSequentialLabelNode } from "@/nodes/interrupt/step1-ask-sequential-label.node";
import { step2AskSequentialChoiceNode } from "@/nodes/interrupt/step2-ask-sequential-choice.node";
import { step3SequentialFinalNode } from "@/nodes/interrupt/step3-sequential-final.node";

export const interruptSequentialDemoWorkflow = defineWorkflow({
  id: "interrupt-sequential-demo",
  version: "1.0.0",
  description:
    "Workflow demonstrating two sequential interrupts across a resume boundary.",
  nodes: {
    askLabel: { run: step1AskSequentialLabelNode, params: {} },
    askChoice: { run: step2AskSequentialChoiceNode, params: {} },
    final: { run: step3SequentialFinalNode, params: {} },
  },
  edges: [
    ["__start__", "askLabel"],
    ["askLabel", "askChoice"],
    ["askChoice", "final"],
    ["final", "__end__"],
  ],
});
