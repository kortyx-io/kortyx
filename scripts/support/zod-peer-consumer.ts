import assert from "node:assert/strict";
import { jevOutputSchema } from "@kortyx/openrouter";
import {
  createAgent,
  defineInterruptContract,
  defineOutputContract,
  defineWorkflow,
  useReason,
} from "kortyx";
import { z } from "zod";

const input = z.object({ name: z.string().min(1) }).strict();
const output = z.object({ greeting: z.string() }).strict();
const greeting = defineOutputContract({
  description: "Return a greeting",
  schemaId: "compat.greeting",
  schemaVersion: "1",
  schema: output,
});
const ask = defineInterruptContract({
  description: "Ask for a name",
  schemaId: "compat.name",
  schemaVersion: "1",
  requestSchema: z.object({ question: z.string() }),
  responseSchema: input,
});
const workflow = defineWorkflow({
  id: "zod-compat",
  version: "1",
  inputSchema: input,
  outputSchema: output,
  nodes: {
    run: {
      run: async ({ input: value }: { input: z.output<typeof input> }) => {
        const provider = {
          id: "compat",
          models: ["compat"],
          getModel: () => ({
            invoke: async () => ({
              content: "",
              toolCalls: [
                {
                  id: "return",
                  name: "kortyx_return__greeting",
                  input: { greeting: `Hello ${value.name}` },
                },
              ],
            }),
            stream: async function* () {
              yield { type: "text-delta" as const, delta: "" };
            },
          }),
        };
        const result = await useReason({
          model: { provider, modelId: "compat" },
          input: value.name,
          stream: false,
          outputs: { return: { greeting } },
        });
        return { data: result.returned?.data };
      },
    },
  },
  edges: [
    ["__start__", "run"],
    ["run", "__end__"],
  ],
});

async function main() {
  const agent = createAgent({ workflows: [workflow] });
  const result = await agent.execute({ workflow, input: { name: "Ada" } });
  assert.equal(result.status, "completed");
  if (result.status !== "completed") throw new Error("Expected completion");
  const text: string = result.data.greeting;
  assert.equal(text, "Hello Ada");
  assert.equal(greeting.schema.safeParse({ greeting: 42 }).success, false);
  assert.equal(ask.responseSchema.safeParse({ name: "" }).success, false);
  await assert.rejects(() => agent.execute({ workflow, input: { name: "" } }), {
    code: "INVALID_INPUT",
  });
  const checkInputTypes = () => {
    // @ts-expect-error Workflow inputs retain the application's schema types.
    void agent.execute({ workflow, input: { name: 42 } });
  };
  void checkInputTypes;
  const score = jevOutputSchema({
    score: { type: "score", instructions: "Score", criteria: ["Low", "High"] },
  });
  assert.equal(score.safeParse({ score: 0.5 }).success, true);
  assert.equal(score.safeParse({ score: "invalid" }).success, false);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
