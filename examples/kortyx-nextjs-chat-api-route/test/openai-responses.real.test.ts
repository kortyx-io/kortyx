// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createOpenAI } from "@kortyx/openai";
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";
import {
  collectBufferedStream,
  createAgent,
  createInMemoryFrameworkAdapter,
  createRedisFrameworkAdapter,
  defineWorkflow,
  type KortyxExecutableTool,
  type UseReasonResult,
  useReason,
  useWorkflow,
} from "kortyx";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const live =
  process.env.KORTYX_RUN_OPENAI_E2E === "1" ? describe : describe.skip;
const modelId = "gpt-5.6-luna";
const Output = z.object({
  caseId: z.string(),
  score: z.number(),
  explanation: z.string(),
});
const workflow = (
  id: string,
  run: () => Promise<{ data: Record<string, unknown> }>,
) =>
  defineWorkflow({
    id,
    version: "1",
    inputSchema: z.union([z.object({}), z.string()]),
    outputSchema: z.object({}).passthrough(),
    nodes: { run: { run } },
    edges: [
      ["__start__", "run"],
      ["run", "__end__"],
    ],
  });

function fixture() {
  const caseId = randomUUID();
  const requests: Record<string, any>[] = [];
  const wire: Record<string, any>[] = [];
  const executed: string[] = [];
  const provider = createOpenAI({
    fetch: async (url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      const response = await fetch(url, init);
      if (!body.stream) wire.push(await response.clone().json());
      return response;
    },
  });
  const tools: KortyxExecutableTool[] = [
    {
      name: "load_case",
      description:
        "Get the current case identifier. Required before read_score.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => {
        executed.push("load_case");
        return { caseId };
      },
    },
    {
      name: "read_score",
      description:
        "Read the score using the case identifier returned by load_case.",
      inputSchema: {
        type: "object",
        properties: { caseId: { type: "string" } },
        required: ["caseId"],
        additionalProperties: false,
      },
      execute: (input) => {
        expect(input).toEqual({ caseId });
        executed.push("read_score");
        return { score: 37 };
      },
    },
  ];
  return { provider, requests, wire, executed, tools, caseId };
}
const task =
  "Call load_case, then read_score using the exact returned caseId. Do not guess either value. Return caseId, score and a brief explanation of the result as JSON. You must use both tools before the final answer.";

live("OpenAI Responses through the public Kortyx API", () => {
  for (const stream of [false, true])
    it(`completes dependent tool rounds and structured output (stream=${stream})`, async () => {
      const f = fixture();
      let result: UseReasonResult<z.infer<typeof Output>> | undefined;
      const root = workflow(`openai-tools-${stream}`, async () => {
        result = await useReason({
          id: "reason",
          model: f.provider(modelId),
          input: task,
          reasoning: { effort: "medium" },
          tools: f.tools,
          outputSchema: Output,
          stream,
          emit: true,
          structured: { fields: { explanation: "text-delta", score: "set" } },
          toolExecution: { maxSteps: 5, emit: true },
        });
        return { data: result.output! };
      });
      const agent = createAgent({ workflows: [root] });
      const buffered = await collectBufferedStream(
        await agent.streamChat([{ role: "user", content: task }], {
          workflowId: root.id,
          sessionId: randomUUID(),
        }),
      );
      expect(buffered.chunks.filter((c) => c.type === "error")).toEqual([]);
      expect(result?.output).toMatchObject({ caseId: f.caseId, score: 37 });
      expect(f.executed).toEqual(["load_case", "read_score"]);
      expect(f.requests.length).toBeGreaterThanOrEqual(3);
      expect(
        f.requests.every(
          (r) =>
            r.model === modelId &&
            r.reasoning.effort === "medium" &&
            r.store === false &&
            r.stream === stream,
        ),
      ).toBe(true);
      expect(
        f.requests
          .at(-1)
          ?.input.filter((item: any) => item.type === "function_call_output"),
      ).toHaveLength(2);
      if (!stream) {
        for (let index = 0; index < f.wire.length - 1; index++) {
          // Replay every returned item, including any encrypted reasoning,
          // rather than rebuilding only the visible function calls.
          expect(f.requests[index + 1]?.input).toEqual(
            expect.arrayContaining(f.wire[index]?.output ?? []),
          );
        }
      }
      expect(result?.usage?.total).toBe(
        result?.steps?.reduce((sum, step) => sum + (step.usage?.total ?? 0), 0),
      );
      const serialized = JSON.stringify(buffered.chunks);
      expect(serialized).not.toContain("encrypted_content");
      expect(serialized).not.toContain("continuation");
      if (stream)
        expect(
          buffered.chunks.some(
            (c) => c.type === "structured-data" && c.kind === "text-delta",
          ),
        ).toBe(true);
      console.log(
        JSON.stringify({
          scenario: `tools-${stream}`,
          model: modelId,
          passes: f.requests.length,
          usage: result?.usage,
          output: result?.output,
        }),
      );
    }, 120_000);

  for (const persistence of [
    "memory",
    ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
  ])
    it(`resumes approved calls without regenerating or repeating completed tools (${persistence})`, async () => {
      const f = fixture();
      const root = workflow("openai-approval", async () => ({
        data: (
          await useReason({
            id: "approve",
            model: f.provider(modelId),
            input: task,
            reasoning: { effort: "medium" },
            tools: f.tools,
            outputSchema: Output,
            stream: false,
            emit: false,
            toolExecution: { approval: true, maxSteps: 5 },
          })
        ).output!,
      }));
      const adapter = createInMemoryFrameworkAdapter();
      const prefix = `openai-live:${randomUUID()}:`;
      const makeAgent = () =>
        createAgent({
          workflows: [root],
          frameworkAdapter:
            persistence === "memory"
              ? adapter
              : createRedisFrameworkAdapter({
                  url: process.env.KORTYX_TEST_REDIS_URL!,
                  prefix,
                }),
        });
      let execution = await makeAgent().execute({ workflow: root, input: {} });
      expect(execution.status).toBe("suspended");
      expect(f.executed).toEqual([]);
      let approvals = 0;
      while (execution.status === "suspended" && approvals++ < 3) {
        const count = f.requests.length;
        execution = await makeAgent().resume({
          workflow: root,
          resume: execution.resume,
          response: { type: "select", ids: ["approve"] },
        });
        expect(f.requests.length - count).toBe(1);
      }
      expect(execution).toMatchObject({
        status: "completed",
        data: { caseId: f.caseId, score: 37 },
      });
      expect(f.executed).toEqual(["load_case", "read_score"]);
      expect(f.requests).toHaveLength(3);
    }, 120_000);

  it("pauses at the model limit and resumes with the original tool context", async () => {
    const f = fixture();
    const root = workflow("openai-limit", async () => ({
      data: (
        await useReason({
          id: "limited",
          model: f.provider(modelId),
          input: task,
          reasoning: { effort: "medium" },
          tools: f.tools,
          outputSchema: Output,
          stream: false,
          emit: false,
          toolExecution: { maxSteps: 5 },
        })
      ).output!,
    }));
    const agent = createAgent({
      workflows: [root],
      limits: { maxModelPasses: 1 },
    });
    const paused = await agent.execute({ workflow: root, input: {} });
    expect(paused).toMatchObject({
      status: "suspended",
      reason: "limit_reached",
    });
    if (paused.status !== "suspended") throw new Error(JSON.stringify(paused));
    expect(
      await agent.resume({
        workflow: root,
        resume: paused.resume,
        response: { type: "select", ids: ["continue"] },
        limits: { maxModelPasses: 5 },
      }),
    ).toMatchObject({ status: "completed", data: { score: 37 } });
    expect(f.executed).toEqual(["load_case", "read_score"]);
    expect(f.requests).toHaveLength(3);
  }, 120_000);

  it("cancels a real model-requested tool inside a child workflow", async () => {
    const f = fixture();
    const controller = new AbortController();
    let toolSignal: AbortSignal | undefined;
    const child = workflow("openai-cancel-child", async () => {
      await useReason({
        model: f.provider(modelId),
        input: "Call load_case before answering.",
        reasoning: { effort: "medium" },
        stream: false,
        tools: [
          {
            ...f.tools[0]!,
            execute: async (_input, { abortSignal }) => {
              toolSignal = abortSignal;
              controller.abort();
              await delay(10_000, undefined, { signal: abortSignal });
              return {};
            },
          },
        ],
      });
      throw new Error("Child must not complete after cancellation");
    });
    let after = false;
    const root = workflow("openai-cancel-root", async () => {
      await useWorkflow({ id: "child", workflow: child, input: {} });
      after = true;
      return { data: {} };
    });
    expect(
      await createAgent({ workflows: [root, child] }).execute({
        workflow: root,
        input: {},
        abortSignal: controller.signal,
      }),
    ).toMatchObject({ status: "cancelled" });
    expect(toolSignal?.aborted).toBe(true);
    expect(after).toBe(false);
    expect(f.requests).toHaveLength(1);
  }, 120_000);

  for (const stream of [false, true])
    it(`propagates cancellation into an in-flight OpenAI request (stream=${stream})`, async () => {
      const controller = new AbortController();
      let signal: AbortSignal | null | undefined;
      const provider = createOpenAI({
        fetch: async (url, init) => {
          signal = init?.signal;
          const response = fetch(url, init);
          setTimeout(() => controller.abort(), 100);
          return response;
        },
      });
      const child = workflow(`openai-inflight-child-${stream}`, async () => {
        await useReason({
          model: provider(modelId),
          input: "Explain the proof of the prime number theorem in detail.",
          reasoning: { effort: "medium" },
          stream,
        });
        return { data: {} };
      });
      const root = workflow(`openai-inflight-root-${stream}`, async () => {
        await useWorkflow({ id: "child", workflow: child, input: {} });
        return { data: {} };
      });
      expect(
        await createAgent({ workflows: [root, child] }).execute({
          workflow: root,
          input: {},
          abortSignal: controller.signal,
        }),
      ).toMatchObject({ status: "cancelled" });
      expect(signal?.aborted).toBe(true);
    }, 30_000);

  it("keeps legacy Chat Completions available and provider failures explicit", async () => {
    const f = fixture();
    const ref = f.provider("gpt-4.1-mini", { api: "chat-completions" });
    const result = await ref.provider
      .getModel(ref.modelId, ref.options)
      .invoke([{ role: "user", content: "Reply OK" }]);
    expect(result.content).toContain("OK");
    await expect(
      f.provider
        .getModel("kortyx-nonexistent-model")
        .invoke([{ role: "user", content: "Hi" }]),
    ).rejects.toThrow();
    const last = f.requests.at(-1);
    expect(last?.model).toBe("kortyx-nonexistent-model");
  }, 60_000);
});

const studioLive =
  process.env.KORTYX_RUN_OPENAI_STUDIO_E2E === "1" ? it : it.skip;
studioLive(
  "records a real Responses tool workflow in Studio without exporting continuation",
  async () => {
    const f = fixture();
    const captured: Record<string, any>[] = [];
    const telemetry = createKortyxTelemetryAdapter({
      endpoint: process.env.KORTYX_API_URL!,
      apiKey: process.env.KORTYX_TELEMETRY_API_KEY!,
      environment: "development",
      service: { name: "openai-responses-e2e" },
      captureContent: true,
      fetch: async (url, init) => {
        if (String(url).endsWith("events:batch"))
          captured.push(...JSON.parse(String(init?.body)).events);
        return fetch(url, init);
      },
    });
    const root = workflow("openai-responses-studio", async () => ({
      data: (
        await useReason({
          id: "studio",
          model: f.provider(modelId),
          input: task,
          reasoning: { effort: "medium" },
          tools: f.tools,
          outputSchema: Output,
          stream: true,
          emit: true,
          toolExecution: { maxSteps: 5 },
        })
      ).output!,
    }));
    const result = await createAgent({ workflows: [root], telemetry }).execute({
      workflow: root,
      input: {},
    });
    expect(result.status).toBe("completed");
    await telemetry.flush();
    expect(telemetry.getPermanentDeliveryFailureCount()).toBe(0);
    const generations = captured.filter(
      (event) => event.type === "generation.completed",
    );
    expect(generations).toHaveLength(3);
    expect(
      generations.every(
        (event) =>
          event.payload.providerMetadata.api === "responses" &&
          event.payload.providerMetadata.reasoning.effort === "medium",
      ),
    ).toBe(true);
    expect(JSON.stringify(captured)).not.toContain("encrypted_content");
    expect(JSON.stringify(captured)).not.toContain('"continuation"');
    const url = `${process.env.KORTYX_API_URL}/v1/studio/runs/${result.runId}`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${process.env.KORTYX_STUDIO_API_KEY}` },
    });
    expect(response.ok).toBe(true);
    const detail = await response.json();
    if (process.env.KORTYX_OPENAI_EVIDENCE_PATH)
      writeFileSync(
        process.env.KORTYX_OPENAI_EVIDENCE_PATH,
        JSON.stringify(
          {
            runId: result.runId,
            generations: generations.map((event) => ({
              id: event.eventId,
              ...event.payload,
            })),
            detail,
          },
          null,
          2,
        ),
      );
  },
  120_000,
);

live("OpenAI incomplete-output handling", () => {
  it("fails with real provider usage when the output budget is exhausted", async () => {
    const f = fixture();
    const root = workflow("openai-incomplete", async () => {
      await useReason({
        model: f.provider(modelId),
        input:
          "Write a detailed 500-word essay about ocean currents. Do not abbreviate.",
        reasoning: { effort: "medium" },
        maxOutputTokens: 16,
        stream: false,
        emit: false,
      });
      return { data: { fabricated: true } };
    });
    const result = await createAgent({ workflows: [root] }).execute({
      workflow: root,
      input: {},
    });
    expect(result.status).toBe("failed");
    expect(result.usage?.total).toBeGreaterThan(0);
    expect(f.requests).toHaveLength(1);
  }, 60_000);
});
