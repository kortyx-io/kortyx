import { defineWorkflow } from "kortyx";
import { checkpointLabCaptureRequestNode } from "@/nodes/checkpoint-lab/capture-request.node";
import { checkpointLabDraftBriefNode } from "@/nodes/checkpoint-lab/draft-brief.node";
import { checkpointLabSelectDepthNode } from "@/nodes/checkpoint-lab/select-depth.node";
import { checkpointLabSelectTemplateNode } from "@/nodes/checkpoint-lab/select-template.node";

export const checkpointLabWorkflow = defineWorkflow({
  id: "checkpoint-lab",
  version: "1.0.0",
  description:
    "Deterministic checkpoint demo with two interrupts, workflow state, and structured output.",
  nodes: {
    captureRequest: { run: checkpointLabCaptureRequestNode, params: {} },
    selectTemplate: { run: checkpointLabSelectTemplateNode, params: {} },
    selectDepth: { run: checkpointLabSelectDepthNode, params: {} },
    draftBrief: { run: checkpointLabDraftBriefNode, params: {} },
  },
  edges: [
    ["__start__", "captureRequest"],
    ["captureRequest", "selectTemplate"],
    ["selectTemplate", "selectDepth"],
    ["selectDepth", "draftBrief"],
    ["draftBrief", "__end__"],
  ],
});
