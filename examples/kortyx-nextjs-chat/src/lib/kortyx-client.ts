import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgent,
  createInMemoryAdapter,
  createInMemoryWorkflowRegistry,
  getProvider,
  initializeProviders,
} from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";
import { interruptDemoWorkflow } from "@/workflows/interrupt-demo.workflow";
import { threeStepsWorkflow } from "@/workflows/three-steps.workflow";
import rawKortyxConfig from "../../kortyx.config.mjs";

type RuntimeOptions = {
  sessionId: string;
  workflowId?: string;
};

const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const kortyxConfig = {
  ...rawKortyxConfig,
  workflowsDir: resolve(projectRoot, "./src/workflows"),
  fallbackWorkflowId: "general-chat",
};

const workflowRegistry = createInMemoryWorkflowRegistry(
  [generalChatWorkflow, threeStepsWorkflow, interruptDemoWorkflow],
  {
    fallbackId: kortyxConfig.fallbackWorkflowId ?? "general-chat",
  },
);

export function loadRuntimeConfig(options?: RuntimeOptions) {
  const sessionId = options?.sessionId ?? "anonymous-session";

  return {
    session: { id: sessionId },
    ai: {
      googleApiKey:
        process.env.GOOGLE_API_KEY ??
        process.env.GEMINI_API_KEY ??
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
        process.env.KORTYX_GOOGLE_API_KEY ??
        process.env.KORTYX_GEMINI_API_KEY,
    },
  };
}

const memoryAdapter = createInMemoryAdapter({
  namespace: "kortyx-nextjs-chat",
  ttlMs: 1000 * 60 * 60, // 1 hour
});

export const agent = createAgent({
  config: kortyxConfig,
  workflowRegistry,
  loadRuntimeConfig,
  getProvider,
  initializeProviders,
  memoryAdapter,
  fallbackWorkflowId: "general-chat",
});
