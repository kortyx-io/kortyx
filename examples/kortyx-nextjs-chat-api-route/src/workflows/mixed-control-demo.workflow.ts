import { randomUUID } from "node:crypto";
import { google } from "@kortyx/google";
import { openai } from "@kortyx/openai";
import {
  defineInterruptContract,
  defineOutputContract,
  defineWorkflow,
  type KortyxInvokeResult,
  type KortyxPromptMessage,
  type ProviderModelRef,
  useNodeState,
  useReason,
  useStructuredData,
} from "kortyx";
import { z } from "zod";

const card = defineOutputContract({
  description:
    "Show a review card using evidence and any completed human response.",
  schemaId: "reason-demo.output-card",
  schemaVersion: "1",
  schema: z.object({
    title: z.string(),
    body: z.string(),
    highlights: z.array(z.string()),
  }),
  stream: {
    fields: { title: "set", body: "text-delta", highlights: "append" },
  },
});
const completed = defineOutputContract({
  description:
    "Return the evidence code and both human decisions in the final recommendation.",
  schemaId: "reason-demo.output-completed",
  schemaVersion: "1",
  schema: z.object({ summary: z.string(), recommendedAction: z.string() }),
  stream: {
    fields: { summary: "text-delta", recommendedAction: "text-delta" },
  },
});
const review = defineInterruptContract({
  description:
    "Ask a review question with kind set to the literal string choice. Request two independent decisions: rollout, then notifications.",
  schemaId: "mixed-demo.review",
  schemaVersion: "1",
  requestSchema: z.object({
    kind: z.literal("choice"),
    question: z.string(),
    options: z.array(z.object({ id: z.string(), label: z.string() })).min(2),
  }),
  responseSchema: z.string(),
});

const fixtureResponse = (
  messages: KortyxPromptMessage[],
): KortyxInvokeResult => {
  const generation = messages
    .at(-1)
    ?.content.match(/Generate output contract "([^"]+)"/);
  const evidence = messages.find(
    (message) => message.role === "tool" && message.name === "read_evaluation",
  );
  const decisions = messages
    .filter(
      (message) =>
        message.role === "tool" &&
        message.name === "kortyx_request_input__review" &&
        !message.content.includes("has not completed yet"),
    )
    .map((message) => message.content);
  if (generation) {
    const code = evidence
      ? (JSON.parse(evidence.content) as { evidenceCode: string }).evidenceCode
      : "pending";
    return {
      content: JSON.stringify(
        generation[1] === "completed"
          ? {
              summary: `Evidence ${code}; decisions: ${decisions.join(", ")}.`,
              recommendedAction: "Follow the two recorded decisions.",
            }
          : {
              title: decisions.length ? "Review update" : "Evaluation evidence",
              body: `Evidence ${code}. ${decisions.length ? `First decision: ${decisions[0]}.` : "Ready for review."}`,
              highlights: [
                "Evidence loaded",
                ...(decisions.length ? ["First response recorded"] : []),
              ],
            },
      ),
    };
  }
  return {
    content: "I’ll show the evidence and collect two decisions.",
    toolCalls: [
      {
        id: "return",
        name: "kortyx_stream_return__completed",
        input: {
          instruction: "Summarize the evidence code and both decisions.",
        },
      },
      { id: "read", name: "read_evaluation", input: {} },
      {
        id: "card-1",
        name: "kortyx_stream_emit__card",
        input: { instruction: "Show the evaluation evidence." },
      },
      { id: "record", name: "record_check", input: {} },
      {
        id: "review-1",
        name: "kortyx_request_input__review",
        input: {
          kind: "choice",
          question: "Approve the rollout?",
          options: [
            { id: "approve", label: "Approve rollout" },
            { id: "defer", label: "Defer rollout" },
          ],
        },
      },
      {
        id: "card-2",
        name: "kortyx_stream_emit__card",
        input: { instruction: "Show the evidence and first decision." },
      },
      {
        id: "review-2",
        name: "kortyx_request_input__review",
        input: {
          kind: "choice",
          question: "Notify the team?",
          options: [
            { id: "notify", label: "Notify team" },
            { id: "silent", label: "Keep quiet" },
          ],
        },
      },
    ],
  };
};
const fixture: ProviderModelRef = {
  modelId: "mixed-fixture",
  provider: {
    id: "mixed-fixture",
    models: ["mixed-fixture"],
    getModel: () => ({
      supportsToolStreaming: true,
      invoke: async (messages) => fixtureResponse(messages),
      stream: async function* (messages) {
        const result = fixtureResponse(messages);
        for (let i = 0; i < result.content.length; i += 24) {
          yield { type: "text-delta", delta: result.content.slice(i, i + 24) };
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        yield {
          type: "finish",
          ...(result.toolCalls ? { toolCalls: result.toolCalls } : {}),
          finishReason: { unified: result.toolCalls ? "tool-calls" : "stop" },
        };
      },
    }),
  },
};

// Diagnostics for this synthetic example only; no external systems are mutated.
const traceModel = (model: ProviderModelRef): ProviderModelRef => ({
  modelId: model.modelId,
  ...(model.options ? { options: model.options } : {}),
  provider: {
    ...model.provider,
    getModel: (id, options) => {
      const resolved = model.provider.getModel(id, options);
      return {
        ...resolved,
        invoke: async (messages) => {
          const result = await resolved.invoke(messages);
          console.info(
            "[mixed-demo]",
            JSON.stringify({
              provider: model.provider.id,
              calls: result.toolCalls?.map((call) => call.name) ?? [],
            }),
          );
          return result;
        },
        stream: async function* (messages) {
          for await (const part of await resolved.stream(messages)) {
            if (typeof part === "object" && part.type === "finish")
              console.info(
                "[mixed-demo]",
                JSON.stringify({
                  provider: model.provider.id,
                  calls: part.toolCalls?.map((call) => call.name) ?? [],
                }),
              );
            yield part;
          }
        },
      };
    },
  },
});

export const mixedControlDemoWorkflow = defineWorkflow({
  id: "mixed-control-demo",
  version: "1.0.0",
  description:
    "Mixed tools, streamed outputs, and two interrupts in a single model turn.",
  nodes: {
    reason: {
      run: async ({ input }) => {
        const request = String(input ?? "");
        const [savedCounts, setCounts] = useNodeState({ reads: 0, writes: 0 });
        const counts = { ...savedCounts };
        const model = request.includes("/fixture")
          ? fixture
          : request.includes("/openai")
            ? openai("gpt-4.1-mini")
            : google("gemini-2.5-flash");
        const result = await useReason({
          id: "mixed-control-demo",
          model: traceModel(model),
          stream: true,
          system:
            "You are exercising a local synthetic demo. In your FIRST model turn, request ALL seven calls together: terminal completed output, read_evaluation, a card emission, record_check, a rollout review interrupt, a second card emission, and a notification review interrupt. Use both output and interrupt control tools alongside the domain tools in that SAME turn. These independent operations may be queued together. Do not invent the evidence code; the runtime generates output values using the completed results. Emit exactly two cards and request exactly two reviews. The record_check tool changes only a local demonstration counter. Review options should be approve/defer for rollout and notify/silent for notification. Do not repeat completed calls.",
          input: request,
          tools: [
            {
              name: "read_evaluation",
              description:
                "Read synthetic evidence including a fresh code that must appear in the final answer.",
              inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
              },
              execute: async () => {
                counts.reads += 1;
                setCounts({ ...counts });
                return {
                  evidenceCode: `EVIDENCE-${randomUUID().slice(0, 8)}`,
                  status: "Ready for review",
                };
              },
            },
            {
              name: "record_check",
              description:
                "Increment a local demonstration counter once. No external side effects.",
              inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
              },
              execute: async () => {
                counts.writes += 1;
                setCounts({ ...counts });
                return { recorded: true, executionCount: counts.writes };
              },
            },
          ],
          outputs: { emit: { card }, return: { completed }, maxEmissions: 2 },
          interrupts: { contracts: { review }, maxRequests: 2 },
          toolExecution: {
            maxSteps: request.includes("/budget") ? 1 : 10,
            emit: true,
          },
        });
        const verification = {
          provider: model.provider.id,
          executions: counts,
          modelTurns: result.steps
            ?.filter((step) => step.kind !== "output")
            .map((step) => step.toolCalls.map((call) => call.name)),
          decisions: result.interruptHistory?.map((entry) => entry.response),
          emissions: result.emissions?.length,
          returned: result.returned?.data,
        };
        console.info("[mixed-demo.complete]", JSON.stringify(verification));
        useStructuredData({
          dataType: "mixed-demo.verification",
          data: verification,
        });
        return {
          data: verification,
          ui: {
            message: `Mixed-call demo complete. Reads: ${counts.reads}; local writes: ${counts.writes}; cards: ${result.emissions?.length}; decisions: ${result.interruptHistory?.map((entry) => entry.response).join(", ")}.`,
          },
        };
      },
    },
  },
  edges: [
    ["__start__", "reason"],
    ["reason", "__end__"],
  ],
});
