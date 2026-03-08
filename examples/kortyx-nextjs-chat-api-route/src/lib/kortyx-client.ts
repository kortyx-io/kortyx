import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";
import { interruptDemoWorkflow } from "@/workflows/interrupt-demo.workflow";
import { reasonInterruptStructuredWorkflow } from "@/workflows/reason-interrupt-structured.workflow";
import { threeStepsWorkflow } from "@/workflows/three-steps.workflow";

export const agent = createAgent({
  workflows: [
    generalChatWorkflow,
    threeStepsWorkflow,
    interruptDemoWorkflow,
    reasonInterruptStructuredWorkflow,
  ],
  session: {
    id: "anonymous-session",
  },
  memory: {
    namespace: "kortyx-nextjs-chat",
    ttlMs: 1000 * 60 * 60,
  },
  fallbackWorkflowId: "general-chat",
});
