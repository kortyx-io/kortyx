// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks execute in server workflow nodes.
import { openrouter } from "@kortyx/openrouter";
import { createAgent, defineWorkflow, useReason } from "kortyx";

// Public, read-only fixture. Private applications bind their normal caller context.
const products = [
  { id: "blue-backpack", name: "Blue backpack", price: 49, currency: "EUR" },
];
export const agent = createAgent({
  defaultWorkflowId: "catalog",
  workflows: [
    defineWorkflow({
      id: "catalog",
      version: "1",
      nodes: {
        answer: {
          run: async ({ input }: { input: string }) => {
            const result = await useReason({
              model: openrouter(process.env.WORKFLOW_MODEL ?? "openai/gpt-4o"),
              input,
              system:
                "Answer catalog questions using list_products. Report prices and currencies faithfully; never invent products or prices.",
              tools: [
                {
                  name: "list_products",
                  description: "List all products in the public demo catalog.",
                  inputSchema: {
                    type: "object",
                    properties: {},
                    additionalProperties: false,
                  },
                  execute: async () => ({ products }),
                },
              ],
              toolExecution: { emit: true },
            });
            return {
              data: { text: result.text },
              ui: { message: result.text },
            };
          },
        },
      },
      edges: [
        ["__start__", "answer"],
        ["answer", "__end__"],
      ],
    }),
  ],
});
