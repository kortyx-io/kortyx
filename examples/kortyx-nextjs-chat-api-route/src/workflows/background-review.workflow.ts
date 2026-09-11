// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx server workflow hooks.
import { setTimeout } from "node:timers/promises";
import {
  completeResponse,
  defineWorkflow,
  useAbortSignal,
  useInterrupt,
} from "kortyx";
import { z } from "zod";

export const backgroundReviewWorkflow = defineWorkflow({
  id: "background-review",
  version: "1.0.0",
  description:
    "Finish the chat response, then request review through a separate application interface.",
  inputSchema: z.string(),
  outputSchema: z.object({ answer: z.string() }),
  nodes: {
    respond: {
      run: () => ({
        data: { answer: "Your response is ready." },
        ui: {
          message:
            "Your response is ready. Internal review will continue separately.",
        },
      }),
    },
    finishResponse: {
      run: async () => {
        // The preceding node's returned data and UI are already committed.
        await completeResponse();
        return { transitionTo: "background-analytics" };
      },
    },
  },
  edges: [
    ["__start__", "respond"],
    ["respond", "finishResponse"],
    ["finishResponse", "__end__"],
  ],
});

export const backgroundAnalyticsWorkflow = defineWorkflow({
  id: "background-analytics",
  version: "1.0.0",
  description: "Review a completed response without reopening its chat stream.",
  inputSchema: z.string(),
  outputSchema: z.object({ answer: z.string(), decision: z.string() }),
  nodes: {
    analyze: {
      run: async () => {
        // A short visible delay represents internal enrichment. No model key required.
        await setTimeout(1200, undefined, { signal: useAbortSignal() });
        return { data: { reviewed: true } };
      },
    },
    review: {
      run: async () => {
        const decision = await useInterrupt({
          id: "save-use-case",
          request: {
            kind: "choice",
            question: "Save this conversation as a use case?",
            options: [
              { id: "save", label: "Save" },
              { id: "skip", label: "Skip" },
            ],
          },
        });
        // Persist a business record here in a real application, using an idempotency key.
        return { data: { decision: String(decision) } };
      },
    },
  },
  edges: [
    ["__start__", "analyze"],
    ["analyze", "review"],
    ["review", "__end__"],
  ],
});
