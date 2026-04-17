import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";
import { interruptDemoWorkflow } from "@/workflows/interrupt-demo.workflow";
import { interruptSequentialDemoWorkflow } from "@/workflows/interrupt-sequential-demo.workflow";
import { reasonInterruptStructuredWorkflow } from "@/workflows/reason-interrupt-structured.workflow";
import { reasonStructuredMultiStreamWorkflow } from "@/workflows/reason-structured-multi-stream.workflow";
import { reasonStructuredStreamWorkflow } from "@/workflows/reason-structured-stream.workflow";
import { threeStepsWorkflow } from "@/workflows/three-steps.workflow";

export const agent = createAgent({
  workflows: [
    generalChatWorkflow,
    threeStepsWorkflow,
    interruptDemoWorkflow,
    interruptSequentialDemoWorkflow,
    reasonInterruptStructuredWorkflow,
    reasonStructuredMultiStreamWorkflow,
    reasonStructuredStreamWorkflow,
  ],
  defaultWorkflowId: "general-chat",
});
