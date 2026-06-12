import "server-only";

import { createAgent } from "kortyx";
import { WORKFLOW_IDS } from "@/lib/protocol";
import { briefQueryWorkflow } from "@/workflows/brief-query-workflow";
import { canvasCreationWorkflow } from "@/workflows/canvas-creation-workflow";
import { canvasSaveWorkflow } from "@/workflows/canvas-save-workflow";
import { generalChatWorkflow } from "@/workflows/general-chat-workflow";
import { updateDiscoveryCanvasWorkflow } from "@/workflows/update-canvas-workflow";

export const agent = createAgent({
  workflows: [
    generalChatWorkflow,
    canvasCreationWorkflow,
    canvasSaveWorkflow,
    briefQueryWorkflow,
    updateDiscoveryCanvasWorkflow,
  ],
  defaultWorkflowId: WORKFLOW_IDS.generalChat,
});
