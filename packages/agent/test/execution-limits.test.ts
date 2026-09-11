// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import { defineWorkflow } from "@kortyx/core";
import { useInterrupt, useReason, useWorkflow } from "@kortyx/hooks";
import {
  createInMemoryFrameworkAdapter,
  createRedisFrameworkAdapter,
} from "@kortyx/runtime";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";
import type { ExecutionResult } from "../src/execution/types";

const workflow = (id: string, run: () => any) =>
  defineWorkflow({
    id,
    version: "1",
    inputSchema: z.object({}),
    outputSchema: z.object({ answer: z.string() }),
    nodes: { run: { run } },
    edges: [
      ["__start__", "run"],
      ["run", "__end__"],
    ],
  });
const done = () => ({ data: { answer: "done" } });
const pause = (result: ExecutionResult) => {
  expect(result.status, JSON.stringify(result)).toBe("suspended");
  if (result.status !== "suspended") throw new Error(JSON.stringify(result));
  return result;
};
const provider = (invoke = vi.fn(async () => ({ content: "answer" }))) => ({
  id: "mock",
  models: ["mock"],
  getModel: () => ({
    invoke,
    stream: async function* () {
      yield { type: "text-delta" as const, delta: "answer" };
    },
  }),
});

it("pauses before another node, resumes its saved checkpoint and never repeats completed nodes", async () => {
  const first = vi.fn(done);
  const second = vi.fn(done);
  const root = defineWorkflow({
    ...workflow("root", first),
    nodes: { first: { run: first }, second: { run: second } },
    edges: [
      ["__start__", "first"],
      ["first", "second"],
      ["second", "__end__"],
    ],
  });
  const agent = createAgent({
    workflows: [root],
    limits: { maxNodeExecutions: 1 },
  });
  const stopped = pause(await agent.execute({ workflow: root, input: {} }));
  expect(stopped).toMatchObject({
    reason: "limit_reached",
    limit: { limit: "maxNodeExecutions", maximum: 1, consumed: 1 },
  });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  expect(
    await agent.resume({
      workflow: root,
      resume: stopped.resume,
      response: { type: "select", ids: ["continue"] },
    }),
  ).toMatchObject({ status: "completed" });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
});

for (const persistence of [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
])
  it(`shares model allowance with children and resumes/forks independently using ${persistence}`, async () => {
    const adapter =
      persistence === "memory"
        ? createInMemoryFrameworkAdapter()
        : createRedisFrameworkAdapter({
            url: process.env.KORTYX_TEST_REDIS_URL!,
            prefix: `limits:${crypto.randomUUID()}:`,
          });
    const invoke = vi.fn(async () => ({ content: "answer" }));
    const model = { provider: provider(invoke), modelId: "mock" };
    const child = workflow("child", async () => {
      await useReason({
        id: "child-model",
        input: "child",
        model,
        stream: false,
        emit: false,
      });
      return done();
    });
    const root = workflow("root", async () => {
      await useReason({
        id: "parent-model",
        input: "parent",
        model,
        stream: false,
        emit: false,
      });
      await useWorkflow({ id: "child", workflow: child, input: {} });
      return done();
    });
    const make = () =>
      createAgent({
        workflows: [root, child],
        frameworkAdapter: adapter,
        limits: { maxModelPasses: 1 },
      });
    const stopped = pause(await make().execute({ workflow: root, input: {} }));
    expect(stopped.limit?.limit).toBe("maxModelPasses");
    expect(invoke).toHaveBeenCalledTimes(1);
    const fork = await make().fork(stopped.checkpointId!);
    const request = fork.checkpoint.activePendingRequests[0]!;
    const next = await make().resume({
      workflow: root,
      resume: stopped.resume,
      response: { type: "select", ids: ["continue"] },
      limits: { maxModelPasses: 3 },
    });
    expect(next).toMatchObject({ status: "completed" });
    expect(
      await make().resume({
        workflow: root,
        resume: {
          token: request.token,
          requestId: request.requestId,
          runId: request.runId,
          sessionId: fork.sessionId,
        },
        response: { type: "select", ids: ["continue"] },
        limits: { maxModelPasses: 3 },
      }),
    ).toMatchObject({ status: "completed" });
    expect(invoke).toHaveBeenCalledTimes(5);
  });

it("limits child invocations without charging cached completed siblings", async () => {
  const childRun = vi.fn(done);
  const child = workflow("child", childRun);
  const root = workflow("root", async () => {
    await useWorkflow({ id: "a", workflow: child, input: {} });
    await useWorkflow({ id: "b", workflow: child, input: {} });
    return done();
  });
  const agent = createAgent({
    workflows: [root, child],
    limits: { maxChildInvocations: 1 },
  });
  const stopped = pause(await agent.execute({ workflow: root, input: {} }));
  expect(stopped.limit?.limit).toBe("maxChildInvocations");
  expect(childRun).toHaveBeenCalledTimes(1);
  expect(
    await agent.resume({
      workflow: root,
      resume: stopped.resume,
      response: { type: "select", ids: ["continue"] },
    }),
  ).toMatchObject({ status: "completed" });
  expect(childRun).toHaveBeenCalledTimes(2);
});

it("preserves allowance through ordinary human input and atomically claims Continue", async () => {
  const child = workflow("child", done);
  const root = workflow("root", async () => {
    await useWorkflow({ id: "a", workflow: child, input: {} });
    await useInterrupt({
      id: "human",
      request: { kind: "text", question: "Name?" },
    });
    await useWorkflow({ id: "b", workflow: child, input: {} });
    return done();
  });
  const agent = createAgent({
    workflows: [root, child],
    limits: { maxChildInvocations: 1 },
  });
  const human = pause(await agent.execute({ workflow: root, input: {} }));
  expect(human.reason).toBeUndefined();
  const stopped = pause(
    await agent.resume({
      workflow: root,
      resume: human.resume,
      response: { type: "text", text: "Ada" },
    }),
  );
  expect(stopped.limit?.consumed).toBe(1);
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      agent.resume({
        workflow: root,
        resume: stopped.resume,
        response: { type: "select", ids: ["continue"] },
      }),
    ),
  );
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(results.find((x) => x.status === "fulfilled")).toMatchObject({
    value: { status: "completed" },
  });
});

it("exposes a limit event and existing Continue UI through chat with one done", async () => {
  const child = workflow("child", done);
  const root = defineWorkflow({
    ...workflow("root", async () => {
      await useWorkflow({ id: "a", workflow: child, input: {} });
      await useWorkflow({ id: "b", workflow: child, input: {} });
      return done();
    }),
    inputSchema: z.string(),
  });
  const agent = createAgent({
    workflows: [root, child],
    limits: { maxChildInvocations: 1 },
  });
  const chunks = [];
  for await (const chunk of await agent.streamChat(
    [{ role: "user", content: "go" }],
    { workflowId: root.id, sessionId: "limits-chat" },
  ))
    chunks.push(chunk);
  expect(chunks.filter((x) => x.type === "limit-reached")).toHaveLength(1);
  expect(chunks.filter((x) => x.type === "done")).toHaveLength(1);
  expect(chunks.filter((x) => x.type === "error")).toHaveLength(0);
  const interrupt = chunks.find((x) => x.type === "interrupt")!;
  expect(interrupt.input.question).toBe("Limit reached — Continue?");
  const next = [];
  for await (const chunk of await agent.streamChat(
    [
      {
        role: "user",
        content: "Continue",
        metadata: {
          resume: {
            token: interrupt.resumeToken,
            requestId: interrupt.requestId,
            selected: "continue",
          },
        },
      },
    ],
    { sessionId: "limits-chat" },
  ))
    next.push(chunk);
  expect(next.find((x) => x.type === "done")).toMatchObject({
    data: { data: { answer: "done" } },
  });
});

it("bounds tool batches and resumes pending calls without repeating completed results", async () => {
  const execute = vi
    .fn(async () => "ok")
    .mockRejectedValueOnce(new Error("tool failed"));
  // The resumed reasoning loop retains the original model response and tool results.
  const p = {
    id: "mock",
    models: ["mock"],
    getModel: () => ({
      invoke: async (messages: unknown) => {
        if (Array.isArray(messages) && messages.length < 3)
          return {
            content: "",
            usage: { input: 2, output: 3, total: 5 },
            toolCalls: [
              { id: "a", name: "tool", input: {} },
              { id: "b", name: "tool", input: {} },
            ],
          };
        return { content: "done", usage: { input: 2, output: 3, total: 5 } };
      },
      stream: async function* () {},
    }),
  };
  const root = workflow("root", async () => {
    await useReason({
      model: { provider: p, modelId: "mock" },
      input: "go",
      tools: [{ name: "tool", inputSchema: { type: "object" }, execute }],
    });
    return done();
  });
  const agent = createAgent({ workflows: [root], limits: { maxToolCalls: 1 } });
  const stopped = pause(await agent.execute({ workflow: root, input: {} }));
  expect(stopped.limit).toEqual({
    limit: "maxToolCalls",
    maximum: 1,
    consumed: 1,
  });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(stopped.usage).toEqual({ input: 2, output: 3, total: 5 });
  expect(
    await agent.resume({
      workflow: root,
      resume: stopped.resume,
      response: { type: "select", ids: ["continue"] },
      limits: { maxToolCalls: 3 },
    }),
  ).toMatchObject({
    status: "completed",
    usage: { input: 4, output: 6, total: 10 },
  });
  expect(execute).toHaveBeenCalledTimes(2);
});

it("counts model retries and cannot turn a caught limit into successful output", async () => {
  const invoke = vi.fn(async () => {
    throw new Error("retry me");
  });
  const root = defineWorkflow({
    ...workflow("root", done),
    nodes: {
      run: {
        behavior: { retry: { maxAttempts: 5 } },
        run: async () => {
          await useReason({
            model: { provider: provider(invoke), modelId: "mock" },
            input: "go",
            stream: false,
          });
          return done();
        },
      },
    },
  });
  const stopped = pause(
    await createAgent({
      workflows: [root],
      limits: { maxModelPasses: 1 },
    }).execute({ workflow: root, input: {} }),
  );
  expect(stopped.limit?.limit).toBe("maxModelPasses");
  expect(invoke).toHaveBeenCalledTimes(1);
  const child = workflow("child", done);
  const swallowing = workflow("swallow", async () => {
    await useWorkflow({ id: "first", workflow: child, input: {} });
    try {
      await useWorkflow({ id: "second", workflow: child, input: {} });
    } catch {}
    return done();
  });
  expect(
    pause(
      await createAgent({
        workflows: [swallowing, child],
        limits: { maxChildInvocations: 1 },
      }).execute({ workflow: swallowing, input: {} }),
    ).reason,
  ).toBe("limit_reached");
});

it("validates server overrides before claiming and allows cancellation of a limit pause", async () => {
  const child = workflow("child", done);
  const root = workflow("root", async () => {
    await useWorkflow({ id: "a", workflow: child, input: {} });
    await useWorkflow({ id: "b", workflow: child, input: {} });
    return done();
  });
  const agent = createAgent({
    workflows: [root, child],
    limits: { maxChildInvocations: 1, maxNodeExecutions: 20 },
  });
  expect(
    await agent.execute({
      workflow: root,
      input: {},
      limits: { maxChildInvocations: 2 },
    }),
  ).toMatchObject({ status: "completed" });
  const stopped = pause(await agent.execute({ workflow: root, input: {} }));
  await expect(
    agent.resume({
      workflow: root,
      resume: stopped.resume,
      response: { type: "select", ids: ["continue"] },
      limits: { maxChildInvocations: 0 },
    }),
  ).rejects.toThrow();
  expect(
    await agent.resume({
      workflow: root,
      resume: stopped.resume,
      response: { type: "cancel" },
    }),
  ).toMatchObject({ status: "cancelled" });
  for (const value of [0, -1, 1.5, Infinity])
    expect(() =>
      createAgent({ workflows: [root], limits: { maxModelPasses: value } }),
    ).toThrow();
});

it("bounds loops and transitionTo handoffs with shared node counts", async () => {
  const root = defineWorkflow({
    ...workflow("root", () => ({ transitionTo: "target" })),
    outputSchema: z.object({ answer: z.string() }),
  });
  const target = workflow("target", () => ({ transitionTo: "root" }));
  const agent = createAgent({
    workflows: [root, target],
    limits: { maxNodeExecutions: 3 },
  });
  const result = pause(await agent.execute({ workflow: root, input: {} }));
  expect(result.limit).toEqual({
    limit: "maxNodeExecutions",
    maximum: 3,
    consumed: 3,
  });
  expect(
    pause(
      await agent.resume({
        workflow: root,
        resume: result.resume,
        response: { type: "select", ids: ["continue"] },
      }),
    ).limit,
  ).toEqual({ limit: "maxNodeExecutions", maximum: 3, consumed: 3 });
});

it("keeps nested human answers across a later limit continuation", async () => {
  const leaf = workflow("leaf", async () => {
    const name = await useInterrupt({
      id: "name",
      request: { kind: "text", question: "Name?" },
    });
    return { data: { answer: String(name) } };
  });
  const child = workflow("child", async () => {
    const answer = await useWorkflow({ id: "leaf", workflow: leaf, input: {} });
    const confirmation = await useInterrupt({
      id: "confirm",
      request: { kind: "text", question: "Confirm?" },
    });
    expect(confirmation).toBe("yes");
    return answer;
  });
  const root = workflow("root", async () => {
    const answer = await useWorkflow({
      id: "child",
      workflow: child,
      input: {},
    });
    await useWorkflow({ id: "after", workflow: leaf, input: {} });
    return answer;
  });
  const agent = createAgent({
    workflows: [root, child, leaf],
    limits: { maxChildInvocations: 2 },
  });
  const first = pause(await agent.execute({ workflow: root, input: {} }));
  const second = pause(
    await agent.resume({
      workflow: root,
      resume: first.resume,
      response: { type: "text", text: "Ada" },
    }),
  );
  expect(second.interrupt.input.question).toBe("Confirm?");
  const stopped = pause(
    await agent.resume({
      workflow: root,
      resume: second.resume,
      response: { type: "text", text: "yes" },
    }),
  );
  expect(stopped.reason).toBe("limit_reached");
  const after = pause(
    await agent.resume({
      workflow: root,
      resume: stopped.resume,
      response: { type: "select", ids: ["continue"] },
    }),
  );
  expect(after.interrupt.input.question).toBe("Name?");
  expect(
    await agent.resume({
      workflow: root,
      resume: after.resume,
      response: { type: "text", text: "Grace" },
    }),
  ).toMatchObject({ status: "completed", data: { answer: "Ada" } });
});

it("counts streaming model attempts and keeps concurrent root allowances separate", async () => {
  const streams = vi.fn(async function* () {
    yield { type: "text-delta" as const, delta: "answer" };
  });
  const p = {
    id: "mock",
    models: ["mock"],
    getModel: () => ({
      invoke: async () => ({ content: "unused" }),
      stream: streams,
    }),
  };
  const root = workflow("root", async () => {
    await useReason({ input: "a", model: { provider: p, modelId: "mock" } });
    await useReason({ input: "b", model: { provider: p, modelId: "mock" } });
    return done();
  });
  const agent = createAgent({
    workflows: [root],
    limits: { maxModelPasses: 1 },
  });
  const results = await Promise.all([
    agent.execute({ workflow: root, input: {} }),
    agent.execute({ workflow: root, input: {} }),
  ]);
  for (const result of results) expect(pause(result).limit?.consumed).toBe(1);
  expect(streams).toHaveBeenCalledTimes(2);
});

it.each([
  "save",
  "append",
  "snapshot",
  "cancel",
] as const)("handles %s failures while saving a limit checkpoint", async (mode) => {
  const adapter = createInMemoryFrameworkAdapter();
  const root = defineWorkflow({
    ...workflow("root", done),
    nodes: { first: { run: done }, second: { run: done } },
    edges: [
      ["__start__", "first"],
      ["first", "second"],
      ["second", "__end__"],
    ],
  });
  const controller = new AbortController();
  if (mode === "save")
    vi.spyOn(adapter.pendingRequests, "save").mockRejectedValue(
      new Error("storage failed"),
    );
  if (mode === "append")
    vi.spyOn(adapter.sessionCheckpoints, "append").mockRejectedValue(
      new Error("checkpoint failed"),
    );
  if (mode === "snapshot") {
    const original = adapter.checkpointer.getTuple.bind(adapter.checkpointer);
    vi.spyOn(adapter.checkpointer, "getTuple").mockImplementation(
      async (config) => {
        const tuple = await original(config);
        // Graph reads include its namespace; the final capture uses only thread_id.
        return Object.keys(config.configurable ?? {}).length > 2
          ? tuple
          : undefined;
      },
    );
  }
  if (mode === "cancel") {
    const original = adapter.sessionCheckpoints.append.bind(
      adapter.sessionCheckpoints,
    );
    vi.spyOn(adapter.sessionCheckpoints, "append").mockImplementation(
      async (args) => {
        const saved = await original(args);
        controller.abort();
        return saved;
      },
    );
  }
  const result = await createAgent({
    workflows: [root],
    frameworkAdapter: adapter,
    limits: { maxNodeExecutions: 1 },
  }).execute({ workflow: root, input: {}, abortSignal: controller.signal });
  expect(result.status).toBe(mode === "cancel" ? "cancelled" : "failed");
});

it("restores a limit checkpoint on rollback without consuming its future Continue", async () => {
  const childRun = vi.fn(done);
  const child = workflow("child", childRun);
  const root = workflow("root", async () => {
    await useWorkflow({ id: "a", workflow: child, input: {} });
    await useWorkflow({ id: "b", workflow: child, input: {} });
    return done();
  });
  const agent = createAgent({
    workflows: [root, child],
    limits: { maxChildInvocations: 1 },
  });
  const stopped = pause(await agent.execute({ workflow: root, input: {} }));
  expect(
    await agent.resume({
      workflow: root,
      resume: stopped.resume,
      response: { type: "select", ids: ["continue"] },
    }),
  ).toMatchObject({ status: "completed" });
  const rollback = await agent.rollbackTo(stopped.checkpointId!);
  const pending = rollback.activePendingRequests[0]!;
  expect(
    await agent.resume({
      workflow: root,
      resume: {
        token: pending.token,
        requestId: pending.requestId,
        runId: pending.runId,
        sessionId: stopped.sessionId,
      },
      response: { type: "select", ids: ["continue"] },
    }),
  ).toMatchObject({ status: "completed" });
  expect(childRun).toHaveBeenCalledTimes(3);
});

for (const persistence of [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
])
  it(`restores completed child nodes and human answers after a model limit using ${persistence}`, async () => {
    const adapter =
      persistence === "memory"
        ? createInMemoryFrameworkAdapter()
        : createRedisFrameworkAdapter({
            url: process.env.KORTYX_TEST_REDIS_URL!,
            prefix: `child-limits:${crypto.randomUUID()}:`,
          });
    const invoke = vi.fn(async () => ({
      content: "answer",
      usage: { input: 2, output: 3, total: 5 },
    }));
    const model = { provider: provider(invoke), modelId: "mock" };
    const first = vi.fn(async () => {
      await useReason({ input: "first", model, stream: false });
      return done();
    });
    const child = defineWorkflow({
      ...workflow("child", done),
      nodes: {
        ask: {
          run: async () => {
            await useInterrupt({
              id: "human",
              request: { kind: "text", question: "Name?" },
            });
            return done();
          },
        },
        first: { run: first },
        second: {
          run: async () => {
            await useReason({ input: "second", model, stream: false });
            return done();
          },
        },
      },
      edges: [
        ["__start__", "ask"],
        ["ask", "first"],
        ["first", "second"],
        ["second", "__end__"],
      ],
    });
    const middle = workflow(
      "middle",
      async () =>
        await useWorkflow({ id: "child", workflow: child, input: {} }),
    );
    const root = workflow(
      "root",
      async () =>
        await useWorkflow({ id: "middle", workflow: middle, input: {} }),
    );
    const make = () =>
      createAgent({
        workflows: [root, middle, child],
        frameworkAdapter: adapter,
        limits: { maxModelPasses: 1 },
      });
    const human = pause(await make().execute({ workflow: root, input: {} }));
    const stopped = pause(
      await make().resume({
        workflow: root,
        resume: human.resume,
        response: { type: "text", text: "Ada" },
      }),
    );
    expect(stopped.reason).toBe("limit_reached");
    expect(stopped.usage?.total).toBe(5);
    const fork = await make().fork(stopped.checkpointId!);
    expect(
      await make().resume({
        workflow: root,
        resume: stopped.resume,
        response: { type: "select", ids: ["continue"] },
      }),
    ).toMatchObject({ status: "completed", usage: { total: 10 } });
    const pending = fork.checkpoint.activePendingRequests[0]!;
    expect(
      await make().resume({
        workflow: root,
        resume: {
          token: pending.token,
          requestId: pending.requestId,
          runId: pending.runId,
          sessionId: fork.sessionId,
        },
        response: { type: "select", ids: ["continue"] },
      }),
    ).toMatchObject({ status: "completed", usage: { total: 10 } });
    expect(first).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(3);
  });
