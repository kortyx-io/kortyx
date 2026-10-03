// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import {
  createAgent,
  createInMemoryFrameworkAdapter,
  defineOutputContract,
  defineSuite,
  defineWorkflow,
  type ProviderModelRef,
  useReason,
  useStructuredData,
} from "kortyx";
import { z } from "zod";

export const OUTPUT_SUITE = defineSuite({
  id: "e2e-product-outputs",
  name: "Product output contracts",
  cases: [
    {
      id: "multiple-outputs",
      name: "Product list and summary",
      steps: [
        {
          message: "Show products",
          expect: {
            type: "answer",
            outputs: [
              { schemaId: "app.product-list" },
              { schemaId: "app.product-summary", schemaVersion: "1" },
            ],
          },
        },
      ],
    },
    {
      id: "exact-version",
      name: "Product list version two",
      steps: [
        {
          message: "Show products",
          expect: {
            type: "answer",
            outputs: [{ schemaId: "app.product-list", schemaVersion: "2" }],
          },
        },
      ],
    },
    {
      id: "wrong-version",
      name: "Obsolete product list contract",
      steps: [
        {
          message: "Show products",
          expect: {
            type: "answer",
            outputs: [{ schemaId: "app.product-list", schemaVersion: "1" }],
          },
        },
      ],
    },
    {
      id: "missing-output",
      name: "Receipt was never returned",
      steps: [
        {
          message: "Show products",
          expect: {
            type: "answer",
            outputs: [
              { schemaId: "app.product-list" },
              { schemaId: "app.receipt" },
            ],
          },
        },
      ],
    },
    {
      id: "partial-only",
      name: "Unfinished product list",
      steps: [
        {
          message: "Show an unfinished preview",
          expect: {
            type: "answer",
            outputs: [{ schemaId: "app.product-list" }],
          },
        },
      ],
    },
  ],
});

const products = defineOutputContract({
  schemaId: "app.product-list",
  schemaVersion: "2",
  description: "Show matching products.",
  schema: z.object({
    products: z.array(z.object({ name: z.string(), price: z.number() })),
  }),
});
const summary = defineOutputContract({
  schemaId: "app.product-summary",
  schemaVersion: "1",
  description: "Return a brief product summary.",
  schema: z.object({ summary: z.string() }),
});

// Deterministic provider, real useReason output tools and real native agent stream.
// Choose by this invocation's messages, so concurrent sessions cannot share state.
const model: ProviderModelRef = {
  modelId: "catalog-fixture",
  provider: {
    id: "catalog-fixture",
    models: ["catalog-fixture"],
    getModel: () => ({
      invoke: async (messages) =>
        messages.some((message) => message.role === "tool")
          ? {
              content: "",
              toolCalls: [
                {
                  id: "summary",
                  name: "kortyx_return__summary",
                  input: { summary: "One blue backpack, USD 80." },
                },
              ],
            }
          : {
              content: "",
              toolCalls: [
                {
                  id: "products",
                  name: "kortyx_emit__products",
                  input: { products: [{ name: "Blue backpack", price: 80 }] },
                },
              ],
            },
      stream: async function* () {},
    }),
  },
};

export function createOutputAgent() {
  return createAgent({
    frameworkAdapter: createInMemoryFrameworkAdapter(),
    defaultWorkflowId: "catalog",
    workflows: [
      defineWorkflow({
        id: "catalog",
        version: "1",
        nodes: {
          answer: {
            run: async ({ input }: { input: string }) => {
              if (input.includes("unfinished")) {
                useStructuredData({
                  streamId: "preview",
                  dataType: "products",
                  schemaId: "app.product-list",
                  schemaVersion: "2",
                  kind: "set",
                  path: "products",
                  value: [{ name: "Draft backpack" }],
                });
                return { ui: { message: "Preview only." } };
              }
              await useReason({
                model,
                input,
                stream: false,
                outputs: { emit: { products }, return: { summary } },
                toolExecution: { emit: true, maxSteps: 3 },
              });
              return {};
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
}
