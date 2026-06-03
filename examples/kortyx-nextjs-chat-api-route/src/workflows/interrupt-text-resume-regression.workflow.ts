import { defineWorkflow } from "kortyx";
import { step1AskTextResumeRegressionNode } from "@/nodes/interrupt/step1-ask-text-resume-regression.node";

export const interruptTextResumeRegressionWorkflow = defineWorkflow({
  id: "interrupt-text-resume-regression",
  version: "1.0.0",
  description:
    "Workflow for verifying that resolved text interrupts do not capture later chat sends.",
  nodes: {
    askText: { run: step1AskTextResumeRegressionNode, params: {} },
  },
  edges: [
    ["__start__", "askText"],
    ["askText", "__end__"],
  ],
});
