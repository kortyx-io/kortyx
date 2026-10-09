// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks execute inside workflow nodes.
import { serve } from "@hono/node-server";
import { openrouter } from "@kortyx/openrouter";
import type { ProviderModelRef } from "@kortyx/providers";
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";
import { Hono } from "hono";
import {
  createAgent,
  createEvalJudge,
  createEvalRouteHandler,
  createEvals,
  createInMemoryFrameworkAdapter,
  createPrompts,
  definePrompt,
  defineWorkflow,
  studioPromptSource,
  usePrompt,
  useReason,
} from "kortyx";
import { z } from "zod";

export const classifyIntent = definePrompt({
  id: "canvas/classify-intent",
  format: "system-user",
  variables: z.object({ message: z.string() }),
  config: z.object({
    modelName: z.enum(["fast", "accurate"]),
    temperature: z.number().min(0).max(2),
  }),
});
// This provider makes the full SDK/Studio transport reproducible without a paid account.
// Set WORKFLOW_MODEL and APP_JUDGE_MODEL to exercise real OpenRouter models instead.
const fixtureModel: ProviderModelRef = {
  modelId: "intent-fixture",
  provider: {
    id: "fixture",
    models: ["intent-fixture"],
    getModel: () => ({
      invoke: async (messages) => {
        const text = String(
          messages.filter((message) => message.role === "user").at(-1)
            ?.content ?? "",
        );
        return {
          content: /buy|pricing|purchase/i.test(text) ? "sales" : "support",
        };
      },
      stream: async function* () {},
    }),
  },
};
const models = {
  fast: process.env.WORKFLOW_MODEL
    ? openrouter(process.env.WORKFLOW_MODEL)
    : fixtureModel,
  accurate: process.env.ACCURATE_MODEL
    ? openrouter(process.env.ACCURATE_MODEL)
    : fixtureModel,
};
const environment = process.env.KORTYX_ENVIRONMENT ?? "production";
const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_API_URL ?? "http://localhost:6400",
  apiKey: process.env.KORTYX_PROMPTS_API_KEY ?? "",
  environment,
  service: { name: "prompt-intent-example" },
  captureContent: { input: false, output: false },
});
const agent = createAgent({
  frameworkAdapter: createInMemoryFrameworkAdapter(),
  telemetry,
  prompts: createPrompts({
    definitions: [classifyIntent],
    source: studioPromptSource({
      apiUrl: process.env.KORTYX_API_URL ?? "http://localhost:6400",
      apiKey: process.env.KORTYX_PROMPTS_API_KEY ?? "",
      environment,
      tag: process.env.KORTYX_PROMPT_TAG ?? "live",
    }),
  }),
  defaultWorkflowId: "intent",
  workflows: [
    defineWorkflow({
      id: "intent",
      version: "1",
      nodes: {
        answer: {
          run: async ({ input }: { input: string }) => {
            const prompt = await usePrompt(classifyIntent, {
              variables: { message: input },
            });
            const result = await useReason({
              prompt,
              model: models[prompt.config.modelName],
              temperature: prompt.config.temperature,
              stream: false,
            });
            return { ui: { message: result.text } };
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
const evals = createEvals({
  agent,
  suites: [
    {
      id: "intent-regression",
      name: "Intent regression",
      cases: [
        {
          id: "support",
          name: "Support request",
          steps: [
            {
              message: "Help me reset my password",
              expect: { type: "answer", criteria: ["Returns support"] },
            },
          ],
        },
        {
          id: "sales",
          name: "Sales request",
          steps: [
            {
              message: "I want to buy a subscription",
              expect: { type: "answer", criteria: ["Returns sales"] },
            },
          ],
        },
      ],
    },
  ],
  judge: process.env.APP_JUDGE_MODEL
    ? createEvalJudge({ model: openrouter(process.env.APP_JUDGE_MODEL) })
    : {
        id: "intent/fixture",
        version: "1",
        location: "app",
        grade: ({ criterion, observation }) => ({
          passed:
            observation.text.trim() ===
            (criterion.text.includes("sales") ? "sales" : "support"),
          reason: "Compared the response with the fixture label.",
          evidence: [observation.text],
        }),
      },
});
const app = new Hono();
const handle = createEvalRouteHandler({
  evals,
  serviceKey:
    process.env.EVAL_SERVICE_KEY ?? "local-prompt-example-service-key-32-chars",
});
app.on(["GET", "POST"], "/api/evals", (c) => handle(c.req.raw));
app.post("/api/chat", async (c) => {
  const { message } = z
    .object({ message: z.string() })
    .parse(await c.req.json());
  const stream = await agent.streamChat([{ role: "user", content: message }], {
    sessionId: crypto.randomUUID(),
  });
  const events: unknown[] = [];
  for await (const event of stream) events.push(event);
  await telemetry.flush();
  return c.json({ events });
});
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 6500) });
