import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";
import { interruptDemoWorkflow } from "@/workflows/interrupt-demo.workflow";
import { threeStepsWorkflow } from "@/workflows/three-steps.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow, threeStepsWorkflow, interruptDemoWorkflow],
  ai: {
    provider: "google",
    apiKey:
      process.env.GOOGLE_API_KEY ??
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
      process.env.KORTYX_GOOGLE_API_KEY ??
      process.env.KORTYX_GEMINI_API_KEY,
  },
  session: {
    id: "anonymous-session",
  },
  memory: {
    namespace: "kortyx-nextjs-chat",
    ttlMs: 1000 * 60 * 60,
  },
  fallbackWorkflowId: "general-chat",
});
