import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgent,
  createInMemoryAdapter,
  getProvider,
  initializeProviders,
  registerNode,
} from "kortyx";
import { chatNode } from "@/nodes/chat.node";
import rawKortyxConfig from "../../kortyx.config.mjs";

registerNode("chatNode", chatNode);

type RuntimeOptions = {
  sessionId: string;
};

const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const kortyxConfig = {
  ...rawKortyxConfig,
  workflowsDir: resolve(
    projectRoot,
    rawKortyxConfig.workflowsDir ?? "./src/workflows",
  ),
};

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
  loadRuntimeConfig,
  getProvider,
  initializeProviders,
  memoryAdapter,
  fallbackWorkflowId: "general-chat",
});
