import { createAgent } from "kortyx";
import { checkpointLabWorkflow } from "@/workflows/checkpoint-lab.workflow";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";
import { interruptDemoWorkflow } from "@/workflows/interrupt-demo.workflow";
import { interruptSequentialDemoWorkflow } from "@/workflows/interrupt-sequential-demo.workflow";
import { interruptTextResumeRegressionWorkflow } from "@/workflows/interrupt-text-resume-regression.workflow";
import { mcpLoremDemoWorkflow } from "@/workflows/mcp-lorem-demo.workflow";
import { reasonInterruptStructuredWorkflow } from "@/workflows/reason-interrupt-structured.workflow";
import { reasonStructuredMultiStreamWorkflow } from "@/workflows/reason-structured-multi-stream.workflow";
import { reasonStructuredStreamWorkflow } from "@/workflows/reason-structured-stream.workflow";
import { reasonStructuredWildcardStreamWorkflow } from "@/workflows/reason-structured-wildcard-stream.workflow";
import { threeStepsWorkflow } from "@/workflows/three-steps.workflow";

export const agent = createAgent({
  workflows: [
    generalChatWorkflow,
    checkpointLabWorkflow,
    threeStepsWorkflow,
    interruptDemoWorkflow,
    interruptSequentialDemoWorkflow,
    interruptTextResumeRegressionWorkflow,
    mcpLoremDemoWorkflow,
    reasonInterruptStructuredWorkflow,
    reasonStructuredMultiStreamWorkflow,
    reasonStructuredStreamWorkflow,
    reasonStructuredWildcardStreamWorkflow,
  ],
  defaultWorkflowId: "general-chat",
});
