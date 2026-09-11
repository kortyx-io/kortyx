import { createAgent } from "kortyx";
import {
  backgroundAnalyticsWorkflow,
  backgroundReviewWorkflow,
} from "@/workflows/background-review.workflow";
import {
  briefApprovalWorkflow,
  briefReviewWorkflow,
} from "@/workflows/brief-review.workflow";
import { checkpointLabWorkflow } from "@/workflows/checkpoint-lab.workflow";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";
import { interruptDemoWorkflow } from "@/workflows/interrupt-demo.workflow";
import { interruptSequentialDemoWorkflow } from "@/workflows/interrupt-sequential-demo.workflow";
import { interruptTextResumeRegressionWorkflow } from "@/workflows/interrupt-text-resume-regression.workflow";
import {
  limitDemoWorkflow,
  limitStepWorkflow,
} from "@/workflows/limit-demo.workflow";
import { mcpLoremDemoWorkflow } from "@/workflows/mcp-lorem-demo.workflow";
import {
  companyResearchWorkflow,
  parallelDemoWorkflow,
  roleAnalysisWorkflow,
} from "@/workflows/parallel-demo.workflow";
import { reasonInterruptStructuredWorkflow } from "@/workflows/reason-interrupt-structured.workflow";
import { reasonStructuredMultiStreamWorkflow } from "@/workflows/reason-structured-multi-stream.workflow";
import { reasonStructuredStreamWorkflow } from "@/workflows/reason-structured-stream.workflow";
import { reasonStructuredWildcardStreamWorkflow } from "@/workflows/reason-structured-wildcard-stream.workflow";
import { threeStepsWorkflow } from "@/workflows/three-steps.workflow";
import { telemetry } from "./telemetry";

export const agent = createAgent({
  telemetry,
  workflows: [
    backgroundReviewWorkflow,
    parallelDemoWorkflow,
    companyResearchWorkflow,
    roleAnalysisWorkflow,
    backgroundAnalyticsWorkflow,
    generalChatWorkflow,
    limitDemoWorkflow,
    limitStepWorkflow,
    briefReviewWorkflow,
    briefApprovalWorkflow,
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
