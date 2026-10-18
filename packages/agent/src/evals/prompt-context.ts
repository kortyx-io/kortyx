import { AsyncLocalStorage } from "node:async_hooks";
import type { PromptSnapshot, PromptUsageReceipt } from "@kortyx/prompts";
// Process-private context. Public request JSON and chat context cannot install an override.
export const promptEvaluationContext = new AsyncLocalStorage<{
  snapshot: PromptSnapshot;
  onUsage: (receipt: PromptUsageReceipt) => void;
}>();
