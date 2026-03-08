import { defineWorkflow } from "kortyx";
import { step1RouteInterruptNode } from "@/nodes/interrupt/step1-route-interrupt.node";
import { step2AskChoiceNode } from "@/nodes/interrupt/step2-ask-choice.node";
import { step2AskMultiNode } from "@/nodes/interrupt/step2-ask-multi.node";
import { step2AskTextNode } from "@/nodes/interrupt/step2-ask-text.node";
import { step3InterruptFinalNode } from "@/nodes/interrupt/step3-final.node";

export const interruptDemoWorkflow = defineWorkflow({
  id: "interrupt-demo",
  version: "1.0.0",
  description:
    "Workflow demonstrating interrupts + resume (text/choice/multi).",
  nodes: {
    route: { run: step1RouteInterruptNode, params: {} },
    askChoice: { run: step2AskChoiceNode, params: {} },
    askMulti: { run: step2AskMultiNode, params: {} },
    askText: { run: step2AskTextNode, params: {} },
    final: { run: step3InterruptFinalNode, params: {} },
  },
  edges: [
    ["__start__", "route"],
    ["route", "askChoice", { when: "choice" }],
    ["route", "askMulti", { when: "multi" }],
    ["route", "askText", { when: "text" }],
    ["askChoice", "final"],
    ["askMulti", "final"],
    ["askText", "final"],
    ["final", "__end__"],
  ],
});
