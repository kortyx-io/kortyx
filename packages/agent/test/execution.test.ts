// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx server hooks run within workflow nodes.
import { defineWorkflow } from "@kortyx/core";
import {
  useInterrupt,
  useReason,
  useRuntimeContext,
  useWorkflow,
} from "@kortyx/hooks";
import {
  createInMemoryFrameworkAdapter,
  createRedisFrameworkAdapter,
} from "@kortyx/runtime";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";
import type { ExecutionResult, ResumeHandle } from "../src/execution/types";

function suspended(result: ExecutionResult) {
  expect(result.status).toBe("suspended");
  if (result.status !== "suspended") throw new Error(JSON.stringify(result));
  return result;
}
const workflow = (run: (args: { input: { topic: string } }) => any) =>
  defineWorkflow({
    id: "research",
    version: "1",
    inputSchema: z.object({ topic: z.string() }),
    outputSchema: z.object({ summary: z.string() }),
    nodes: { run: { run } },
    edges: [
      ["__start__", "run"],
      ["run", "__end__"],
    ],
  });

it("infers and validates input/output, isolates fresh runs even in one session", async () => {
  const research = workflow(({ input }) => ({
    data: { summary: input.topic, private: "hidden" },
  }));
  const agent = createAgent({ workflows: [research] });
  const result = await agent.execute({
    workflow: research,
    input: { topic: "typed" },
    sessionId: "same",
  });
  expect(result).toMatchObject({
    status: "completed",
    data: { summary: "typed" },
  });
  if (result.status === "completed")
    expectTypeOf(result.data).toEqualTypeOf<{ summary: string }>();
  const next = await agent.execute({
    workflow: research,
    input: { topic: "new" },
    sessionId: "same",
  });
  expect(next).toMatchObject({ status: "completed", data: { summary: "new" } });
  expect(next.runId).not.toBe(result.runId);
  const first = await agent.execute({
    workflow: research,
    input: { topic: "one" },
  });
  const second = await agent.execute({
    workflow: "research",
    input: { topic: "two" },
  });
  expect(first.sessionId).not.toBe(second.sessionId);
  await expect(
    agent.execute({ workflow: "research", input: { topic: 1 } }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  // biome-ignore lint/correctness/noConstantCondition: Compile-time API assertions must not execute.
  if (false) {
    // @ts-expect-error The workflow input is inferred, not caller asserted.
    await agent.execute({ workflow: research, input: { topic: 1 } });
    // @ts-expect-error Completed output is unavailable before status narrowing.
    result.data;
  }
});

it("rejects missing contracts and mismatched registered references", async () => {
  const research = workflow(() => ({ data: { summary: "yes" } }));
  const agent = createAgent({ workflows: [research] });
  await expect(
    agent.execute({
      workflow: { ...research, version: "2" },
      input: { topic: "x" },
    }),
  ).rejects.toMatchObject({ code: "CONTRACT_MISMATCH" });
  await expect(
    agent.execute({ workflow: "unknown", input: {} }),
  ).rejects.toThrow();
  const noContract = { ...research, inputSchema: undefined };
  await expect(
    createAgent({ workflows: [noContract] }).execute({
      workflow: "research",
      input: {},
    }),
  ).rejects.toMatchObject({ code: "MISSING_CONTRACT" });
});

it("returns failed outcomes for node failures and invalid output", async () => {
  for (const run of [
    () => {
      throw new Error("exploded");
    },
    () => ({ data: { summary: 42 } }),
  ]) {
    const research = workflow(run);
    const result = await createAgent({ workflows: [research] }).execute({
      workflow: research,
      input: { topic: "x" },
    });
    expect(result.status).toBe("failed");
  }
});

it("applies input/output transforms once across a pause and preserves server context", async () => {
  const inputTransform = vi.fn((topic: string) => `${topic}!`);
  const outputTransform = vi.fn((summary: string) => `${summary}!`);
  const research = defineWorkflow({
    ...workflow(async ({ input }) => {
      const context = useRuntimeContext<{ tenantId: string }>();
      const answer = await useInterrupt({
        request: { kind: "text", question: "Continue?" },
      });
      return {
        data: { summary: `${input.topic}:${context.tenantId}:${answer}` },
      };
    }),
    inputSchema: z.object({ topic: z.string().transform(inputTransform) }),
    outputSchema: z.object({ summary: z.string().transform(outputTransform) }),
  });
  const adapter = createInMemoryFrameworkAdapter();
  const make = () =>
    createAgent({ workflows: [research], frameworkAdapter: adapter });
  const pause = suspended(
    await make().execute({
      workflow: research,
      input: { topic: "hi" },
      context: { tenantId: "server" },
    }),
  );
  const final = await make().resume({
    workflow: research,
    resume: JSON.parse(JSON.stringify(pause.resume)),
    response: { type: "text", text: "yes" },
  });
  expect(final).toMatchObject({
    status: "completed",
    runId: pause.runId,
    data: { summary: "hi!:server:yes!" },
  });
  expect(inputTransform).toHaveBeenCalledTimes(1);
  expect(outputTransform).toHaveBeenCalledTimes(1);
});

for (const persistence of [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
]) {
  describe(`direct execution with ${persistence}`, () => {
    it("resumes nested children, forks independently, rolls back and reuses completed siblings", async () => {
      let siblingRuns = 0;
      const sibling = workflow(() => {
        siblingRuns++;
        return { data: { summary: "cached" } };
      });
      const leaf = defineWorkflow({
        ...workflow(async () => ({
          data: {
            summary: await useInterrupt({
              request: { kind: "text", question: "Leaf?" },
            }),
          },
        })),
        id: "leaf",
      });
      const child = defineWorkflow({
        ...workflow(async ({ input }) => ({
          data: (await useWorkflow({ id: "leaf", workflow: leaf, input })).data,
        })),
        id: "child",
      });
      const root = defineWorkflow({
        ...workflow(async ({ input }) => {
          const cached = await useWorkflow({
            id: "sibling",
            workflow: sibling,
            input,
          });
          const result = await useWorkflow({
            id: "child",
            workflow: child,
            input,
          });
          const approval = await useInterrupt({
            request: { kind: "text", question: "Parent?" },
          });
          return {
            data: {
              summary: `${cached.data.summary}:${result.data.summary}:${approval}`,
            },
          };
        }),
        id: "root",
      });
      const prefix = `execution-test:${crypto.randomUUID()}:`;
      const memory = createInMemoryFrameworkAdapter();
      const make = () =>
        createAgent({
          workflows: [root, child, leaf, sibling],
          frameworkAdapter:
            persistence === "memory"
              ? memory
              : createRedisFrameworkAdapter({
                  url: process.env.KORTYX_TEST_REDIS_URL!,
                  prefix,
                }),
        });
      const pause = suspended(
        await make().execute({ workflow: root, input: { topic: "x" } }),
      );
      const branch = await make().fork(pause.checkpointId!);
      const p = branch.checkpoint.activePendingRequests[0]!;
      const forkHandle: ResumeHandle = {
        token: p.token,
        requestId: p.requestId,
        runId: p.runId,
        sessionId: branch.sessionId,
      };
      const finish = async (resume: ResumeHandle, text: string) => {
        const next = suspended(
          await make().resume({
            workflow: root,
            resume,
            response: { type: "text", text },
          }),
        );
        return make().resume({
          workflow: root,
          resume: next.resume,
          response: { type: "text", text: "approved" },
        });
      };
      expect(await finish(forkHandle, "fork")).toMatchObject({
        status: "completed",
        data: { summary: "cached:fork:approved" },
      });
      expect(await finish(pause.resume, "source")).toMatchObject({
        status: "completed",
        data: { summary: "cached:source:approved" },
      });
      const restored = await make().rollbackTo(pause.checkpointId!);
      const restoredPending = restored.activePendingRequests[0]!;
      expect(
        await finish(
          {
            token: restoredPending.token,
            requestId: restoredPending.requestId,
            runId: restoredPending.runId,
            sessionId: pause.sessionId,
          },
          "edited",
        ),
      ).toMatchObject({
        status: "completed",
        data: { summary: "cached:edited:approved" },
      });
      expect(siblingRuns).toBe(1);
    });

    it("validates before claiming, atomically claims once, and cancels distinctly", async () => {
      const research = workflow(async () => ({
        data: {
          summary: await useInterrupt({
            request: {
              kind: "choice",
              question: "Approve?",
              options: [
                { id: "yes", label: "Yes" },
                { id: "cancel", label: "Decline" },
              ],
            },
          }),
        },
      }));
      const frameworkAdapter =
        persistence === "memory"
          ? createInMemoryFrameworkAdapter()
          : createRedisFrameworkAdapter({
              url: process.env.KORTYX_TEST_REDIS_URL!,
              prefix: `execution-claim:${crypto.randomUUID()}:`,
            });
      const agent = createAgent({ workflows: [research], frameworkAdapter });
      const pause = suspended(
        await agent.execute({ workflow: research, input: { topic: "x" } }),
      );
      for (const response of [
        { type: "text", text: "wrong" },
        { type: "select", ids: ["unknown"] },
        { type: "select", ids: ["yes", "yes"] },
      ] as const) {
        await expect(
          agent.resume({
            workflow: "research",
            resume: pause.resume,
            response: JSON.parse(JSON.stringify(response)),
          }),
        ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
      }
      await expect(
        agent.resume({
          workflow: research,
          resume: { ...pause.resume, runId: "wrong" },
          response: { type: "select", ids: ["yes"] },
        }),
      ).rejects.toMatchObject({ code: "RESUME_MISMATCH" });
      const attempts = await Promise.allSettled(
        ["yes", "cancel"].map((id) =>
          agent.resume({
            workflow: research,
            resume: pause.resume,
            response: { type: "select", ids: [id] },
          }),
        ),
      );
      expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const cancelled = suspended(
        await agent.execute({ workflow: research, input: { topic: "x" } }),
      );
      expect(
        await agent.resume({
          workflow: research,
          resume: cancelled.resume,
          response: { type: "cancel" },
        }),
      ).toMatchObject({ status: "cancelled" });
      await expect(
        agent.resume({
          workflow: research,
          resume: cancelled.resume,
          response: { type: "select", ids: ["yes"] },
        }),
      ).rejects.toThrow();
    });
  });
}

it("runs the same registered workflow through chat and direct execution", async () => {
  const shared = defineWorkflow({
    ...workflow(({ input }) => ({
      data: { summary: String(input).toUpperCase() },
      ui: { message: String(input).toUpperCase() },
    })),
    inputSchema: z.string(),
  });
  const agent = createAgent({
    workflows: [shared],
    defaultWorkflowId: shared.id,
  });
  const direct = await agent.execute({ workflow: shared, input: "hello" });
  const chunks = [];
  for await (const chunk of await agent.streamChat(
    [{ role: "user", content: "hello" }],
    { sessionId: "chat-parity" },
  ))
    chunks.push(chunk);
  const done = [...chunks].reverse().find((chunk) => chunk.type === "done");
  expect(direct).toMatchObject({
    status: "completed",
    data: { summary: "HELLO" },
  });
  expect(done).toMatchObject({ data: { data: { summary: "HELLO" } } });
  expect(chunks.filter((chunk) => chunk.type === "done")).toHaveLength(1);
});

it("keeps model usage and tracing without a UI stream consumer", async () => {
  const startSpan = vi.fn(() => ({
    end: vi.fn(),
    fail: vi.fn(),
    setAttributes: vi.fn(),
  }));
  const invoke = vi.fn(async () => ({
    content: "answer",
    usage: { input: 5, output: 3, total: 8 },
  }));
  const provider = {
    id: "mock",
    models: ["mock"],
    getModel: () => ({
      invoke,
      stream: async function* () {
        yield { type: "text-delta" as const, delta: "answer" };
      },
    }),
  };
  const modelRef = { provider, modelId: "mock" };
  const research = workflow(async () => {
    const result = await useReason({
      model: modelRef,
      input: "hello",
      stream: false,
      emit: false,
    });
    return { data: { summary: result.text } };
  });
  const agent = createAgent({
    workflows: [research],

    telemetry: { trace: { startSpan } } as any,
  });
  const result = await agent.execute({
    workflow: research,
    input: { topic: "x" },
  });
  expect(result).toMatchObject({
    status: "completed",
    data: { summary: "answer" },
    usage: { input: 5, output: 3, total: 8 },
  });
  expect(startSpan).toHaveBeenCalledWith(
    expect.objectContaining({ name: "kortyx.run" }),
  );
});

it("reports nested model usage at suspension and counts resumed/cached work once", async () => {
  const invoke = vi.fn(async () => ({
    content: "answer",
    usage: { input: 5, output: 3, total: 8 },
  }));
  const provider = {
    id: "mock",
    models: ["mock"],
    getModel: () => ({
      invoke,
      stream: async function* () {
        yield { type: "text-delta" as const, delta: "answer" };
      },
    }),
  };
  const leaf = defineWorkflow({
    ...workflow(() => ({})),
    nodes: {
      research: {
        run: async () => {
          const result = await useReason({
            id: "research",
            model: { provider, modelId: "mock" },
            input: "hello",
            stream: false,
            emit: false,
          });
          return { data: { summary: result.text } };
        },
      },
      approve: {
        run: async () => {
          await useInterrupt({
            id: "approval",
            request: { kind: "text", question: "Approve?" },
          });
          return {};
        },
      },
    },
    edges: [
      ["__start__", "research"],
      ["research", "approve"],
      ["approve", "__end__"],
    ],
  });
  const child = defineWorkflow({
    ...workflow(async ({ input }) => ({
      data: (await useWorkflow({ id: "leaf", workflow: leaf, input })).data,
    })),
    id: "child",
  });
  const root = defineWorkflow({
    ...workflow(async ({ input }) => {
      const result = await useWorkflow({ id: "child", workflow: child, input });
      await useInterrupt({
        id: "parent",
        request: { kind: "text", question: "Finish?" },
      });
      return { data: result.data };
    }),
    id: "root",
  });
  const agent = createAgent({ workflows: [root, child, leaf] });
  const first = suspended(
    await agent.execute({ workflow: root, input: { topic: "x" } }),
  );
  expect(first.usage).toEqual({ input: 5, output: 3, total: 8 });
  const second = suspended(
    await agent.resume({
      workflow: root,
      resume: first.resume,
      response: { type: "text", text: "yes" },
    }),
  );
  expect(second.usage).toEqual(first.usage);
  const completed = await agent.resume({
    workflow: root,
    resume: second.resume,
    response: { type: "text", text: "yes" },
  });
  expect(completed).toMatchObject({ status: "completed", usage: first.usage });
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("supports chat-to-direct and direct-to-chat resume on the same engine", async () => {
  const shared = defineWorkflow({
    ...workflow(async () => ({
      data: {
        summary: await useInterrupt({
          request: { kind: "text", question: "Answer?" },
        }),
      },
    })),
    inputSchema: z.string(),
  });
  const agent = createAgent({
    workflows: [shared],
    defaultWorkflowId: shared.id,
  });
  const chat = [];
  for await (const chunk of await agent.streamChat(
    [{ role: "user", content: "hello" }],
    { sessionId: "chat-direct" },
  ))
    chat.push(chunk);
  const interrupt = chat.find((chunk) => chunk.type === "interrupt")!;
  const checkpoint = chat.find((chunk) => chunk.type === "checkpoint")!;
  const stored = await agent.getCheckpoint(checkpoint.id);
  expect(
    await agent.resume({
      workflow: shared,
      resume: {
        token: interrupt.resumeToken,
        requestId: interrupt.requestId,
        sessionId: "chat-direct",
        runId: stored!.runId,
      },
      response: { type: "text", text: "direct answer" },
    }),
  ).toMatchObject({ status: "completed", data: { summary: "direct answer" } });
  const direct = suspended(
    await agent.execute({ workflow: shared, input: "hello" }),
  );
  const resumed = [];
  for await (const chunk of await agent.streamChat(
    [
      {
        role: "user",
        content: "chat answer",
        metadata: {
          resume: {
            token: direct.resume.token,
            requestId: direct.resume.requestId,
            selected: "chat answer",
          },
        },
      },
    ],
    { sessionId: direct.sessionId },
  ))
    resumed.push(chunk);
  expect(resumed.find((chunk) => chunk.type === "done")).toMatchObject({
    data: { data: { summary: "chat answer" } },
  });
});

it("keeps the entry output contract across a handoff and a target interrupt", async () => {
  const target = defineWorkflow({
    ...workflow(async ({ input }) => ({
      data: {
        summary: `${input.topic}:${await useInterrupt({ request: { kind: "text", question: "Target?" } })}`,
      },
    })),
    id: "target",
  });
  const root = defineWorkflow({
    ...workflow(({ input }) => ({
      transitionTo: "target",
      data: { rawInput: JSON.stringify(input) },
    })),
    outputSchema: z.object({
      summary: z.string().transform((value) => `${value}!`),
    }),
  });
  // Handoffs keep the existing string rawInput convention.
  const targetWithInput = defineWorkflow({
    ...target,
    inputSchema: z
      .string()
      .transform((value) => JSON.parse(value) as { topic: string }),
  });
  const agent = createAgent({ workflows: [root, targetWithInput] });
  const pause = suspended(
    await agent.execute({ workflow: root, input: { topic: "hi" } }),
  );
  expect(
    await agent.resume({
      workflow: root,
      resume: pause.resume,
      response: { type: "text", text: "yes" },
    }),
  ).toMatchObject({ status: "completed", data: { summary: "hi:yes!" } });
});

it("rejects invalid command shapes, fallback workflow IDs and changed contracts", async () => {
  const research = workflow(() => ({}));
  const agent = createAgent({
    workflows: [research],
    defaultWorkflowId: research.id,
  });
  await expect(
    agent.execute({ workflow: "missing", input: {} }),
  ).rejects.toMatchObject({ code: "UNKNOWN_WORKFLOW" });
  await expect(
    agent.execute({
      workflow: research,
      input: { topic: "x" },
      sessionId: " ",
    }),
  ).rejects.toMatchObject({ code: "INVALID_SESSION" });
  await expect(
    agent.resume({
      workflow: research,
      resume: {} as ResumeHandle,
      response: { type: "text", text: "hi" },
    }),
  ).rejects.toMatchObject({ code: "INVALID_RESUME" });
  for (const changed of [
    { ...research, inputSchema: z.object({ topic: z.string() }) },
    { ...research, outputSchema: z.object({ summary: z.string() }) },
  ]) {
    await expect(
      agent.execute({ workflow: changed, input: { topic: "x" } }),
    ).rejects.toMatchObject({ code: "CONTRACT_MISMATCH" });
  }
  const noOutput = { ...research, outputSchema: undefined };
  await expect(
    createAgent({ workflows: [noOutput] }).execute({
      workflow: "research",
      input: {},
    }),
  ).rejects.toMatchObject({ code: "MISSING_CONTRACT" });
});

it("returns failed when graph preparation fails and leaves a claimed pause usable after preparation failure", async () => {
  const broken = defineWorkflow({
    ...workflow(() => ({})),
    nodes: { run: { run: "missing-handler-for-execution-test" } },
  });
  expect(
    await createAgent({ workflows: [broken] }).execute({
      workflow: broken,
      input: { topic: "x" },
    }),
  ).toMatchObject({ status: "failed" });
  const research = workflow(async () => ({
    data: {
      summary: await useInterrupt({
        request: { kind: "text", question: "Answer?" },
      }),
    },
  }));
  const adapter = createInMemoryFrameworkAdapter();
  const agent = createAgent({
    workflows: [research],
    frameworkAdapter: adapter,
  });
  const pause = suspended(
    await agent.execute({ workflow: research, input: { topic: "x" } }),
  );
  const original = research.nodes.run.run;
  (research.nodes.run as { run: typeof original | string }).run =
    "missing-handler-for-resume-test";
  await expect(
    agent.resume({
      workflow: research,
      resume: pause.resume,
      response: { type: "text", text: "yes" },
    }),
  ).rejects.toThrow();
  research.nodes.run.run = original;
  expect(
    await agent.resume({
      workflow: research,
      resume: pause.resume,
      response: { type: "text", text: "yes" },
    }),
  ).toMatchObject({ status: "completed", data: { summary: "yes" } });
});

it("handles multi-choice, empty text and an ordinary cancel option", async () => {
  for (const kind of ["multi-choice", "choice", "text"] as const) {
    const research = workflow(async () => ({
      data: {
        summary: JSON.stringify(
          await useInterrupt({
            request:
              kind === "text"
                ? { kind }
                : {
                    kind,
                    question: "Choose",
                    options: [
                      { id: "cancel", label: "Cancel" },
                      { id: "yes", label: "Yes" },
                    ],
                  },
          }),
        ),
      },
    }));
    const agent = createAgent({ workflows: [research] });
    const pause = suspended(
      await agent.execute({ workflow: research, input: { topic: "x" } }),
    );
    if (kind === "text")
      await expect(
        agent.resume({
          workflow: research,
          resume: pause.resume,
          response: { type: "text", text: "" },
        }),
      ).rejects.toMatchObject({ code: "INVALID_RESUME" });
    const result = await agent.resume({
      workflow: research,
      resume: pause.resume,
      response:
        kind === "text"
          ? { type: "text", text: "answer" }
          : {
              type: "select",
              ids: kind === "choice" ? ["cancel"] : ["yes", "cancel"],
            },
    });
    expect(result.status, kind).toBe("completed");
  }
});

it("discards visible model output without a UI stream consumer", async () => {
  const provider = {
    id: "mock",
    models: ["mock"],
    getModel: () => ({
      invoke: async () => {
        throw new Error("provider failed");
      },
      stream: async function* () {
        yield { type: "text-delta" as const, delta: "answer" };
      },
    }),
  };
  const research = workflow(async () => {
    const result = await useReason({
      model: { provider, modelId: "mock" },
      input: "hello",
      stream: true,
      emit: true,
    });
    return { data: { summary: result.text } };
  });
  expect(
    await createAgent({ workflows: [research] }).execute({
      workflow: research,
      input: { topic: "x" },
    }),
  ).toMatchObject({ status: "completed" });
});

it("preserves accumulated usage across root handoffs", async () => {
  const provider = {
    id: "mock",
    models: ["mock"],
    getModel: () => ({
      invoke: async () => ({
        content: "answer",
        usage: { input: 5, output: 3, total: 8 },
      }),
      stream: async function* () {
        yield { type: "text-delta" as const, delta: "unused" };
      },
    }),
  };
  const root = workflow(async () => {
    await useReason({
      model: { provider, modelId: "mock" },
      input: "hello",
      stream: false,
      emit: false,
    });
    return { transitionTo: "target", data: {} };
  });
  const target = defineWorkflow({
    ...workflow(async () => {
      await useReason({
        model: { provider, modelId: "mock" },
        input: "next",
        stream: false,
        emit: false,
      });
      return { data: { summary: "done" } };
    }),
    id: "target",
  });
  const agent = createAgent({ workflows: [root, target] });
  expect(
    await agent.execute({ workflow: root, input: { topic: "x" } }),
  ).toMatchObject({
    status: "completed",
    usage: { input: 10, output: 6, total: 16 },
  });
});
