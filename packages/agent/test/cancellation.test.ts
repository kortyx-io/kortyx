// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import { setTimeout } from "node:timers/promises";
import { defineWorkflow } from "@kortyx/core";
import {
  useAbortSignal,
  useInterrupt,
  useReason,
  useWorkflow,
} from "@kortyx/hooks";
import {
  createInMemoryFrameworkAdapter,
  createRedisFrameworkAdapter,
} from "@kortyx/runtime";
import { toSSE } from "@kortyx/stream";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";

const workflow = (id: string, run: () => any) =>
  defineWorkflow({
    id,
    version: "1",
    inputSchema: z.string(),
    outputSchema: z.object({ answer: z.string() }),
    nodes: { run: { run } },
    edges: [
      ["__start__", "run"],
      ["run", "__end__"],
    ],
  });
const done = () => ({ data: { answer: "done" } });
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

it("does not start pre-aborted executions, and isolates concurrent roots", async () => {
  const started = gate();
  const run = vi.fn(async () => {
    started.resolve();
    await setTimeout(30, undefined, { signal: useAbortSignal() });
    return done();
  });
  const root = workflow("root", run);
  const agent = createAgent({ workflows: [root] });
  expect(
    await agent.execute({
      workflow: root,
      input: "",
      abortSignal: AbortSignal.abort(),
    }),
  ).toMatchObject({ status: "cancelled" });
  expect(run).not.toHaveBeenCalled();
  const controller = new AbortController();
  const first = agent.execute({
    workflow: root,
    input: "",
    abortSignal: controller.signal,
  });
  const other = agent.execute({ workflow: root, input: "" });
  await started.promise;
  controller.abort("custom reason");
  expect(await first).toMatchObject({ status: "cancelled" });
  expect(await other).toMatchObject({ status: "completed" });
});

for (const stream of [false, true])
  it(`aborts nested ${stream ? "streaming" : "invoked"} model calls despite a local signal`, async () => {
    const started = gate();
    const controller = new AbortController();
    const local = new AbortController();
    const invoke = vi.fn();
    let inherited: AbortSignal | undefined;
    const provider = {
      id: "mock",
      models: ["mock"],
      getModel: (_id: string, options?: { abortSignal?: AbortSignal }) => {
        inherited = options?.abortSignal;
        return {
          invoke: async () => {
            invoke();
            started.resolve();
            await setTimeout(60_000, undefined, { signal: inherited });
            return { content: "late" };
          },
          stream: async function* () {
            invoke();
            started.resolve();
            await setTimeout(60_000, undefined, { signal: inherited });
            yield { type: "text-delta" as const, delta: "late" };
          },
        };
      },
    };
    const child = workflow("child", async () => {
      await useReason({
        input: "hello",
        model: {
          provider,
          modelId: "mock",
          options: { abortSignal: local.signal },
        },
        abortSignal: local.signal,
        stream,
      });
      return done();
    });
    const after = vi.fn();
    const root = workflow("root", async () => {
      await useWorkflow({ id: "child", workflow: child, input: "" });
      after();
      return done();
    });
    const execution = createAgent({ workflows: [root, child] }).execute({
      workflow: root,
      input: "",
      abortSignal: controller.signal,
    });
    await started.promise;
    controller.abort();
    expect(await execution).toMatchObject({ status: "cancelled" });
    expect(inherited?.aborted).toBe(true);
    expect(local.signal.aborted).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(after).not.toHaveBeenCalled();
  });

it("aborts tools cooperatively, closes resources and never treats cancellation as tool feedback", async () => {
  const controller = new AbortController();
  const started = gate();
  const close = vi.fn();
  const secondTool = vi.fn();
  const invoke = vi.fn(async () => ({
    content: "",
    toolCalls: [
      { id: "1", name: "slow", input: {} },
      { id: "2", name: "second", input: {} },
    ],
  }));
  const provider = {
    id: "mock",
    models: ["mock"],
    getModel: () => ({ invoke, stream: async function* () {} }),
  };
  const child = workflow("child", async () => {
    await useReason({
      input: "tools",
      model: { provider, modelId: "mock" },
      tools: [
        {
          name: "slow",
          inputSchema: { type: "object" },
          close,
          execute: async (_input, { abortSignal }) => {
            started.resolve();
            await setTimeout(60_000, undefined, { signal: abortSignal });
            return "late";
          },
        },
        {
          name: "second",
          inputSchema: { type: "object" },
          execute: secondTool,
        },
      ],
    });
    return done();
  });
  const root = workflow("root", async () => ({
    data: (await useWorkflow({ id: "child", workflow: child, input: "" })).data,
  }));
  const execution = createAgent({ workflows: [root, child] }).execute({
    workflow: root,
    input: "",
    abortSignal: controller.signal,
  });
  await started.promise;
  controller.abort();
  expect(await execution).toMatchObject({ status: "cancelled" });
  expect(close).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(secondTool).not.toHaveBeenCalled();
});

it("stops between children even if parent code catches cancellation and tries to pause", async () => {
  const controller = new AbortController();
  const first = workflow("first", done);
  const later = vi.fn(done);
  const second = workflow("second", later);
  const root = workflow("root", async () => {
    await useWorkflow({ id: "first", workflow: first, input: "" });
    controller.abort();
    try {
      await useWorkflow({ id: "second", workflow: second, input: "" });
    } catch {}
    try {
      await useInterrupt({
        request: { kind: "text", question: "Should not pause" },
      });
    } catch {}
    return done();
  });
  const result = await createAgent({
    workflows: [root, first, second],
  }).execute({ workflow: root, input: "", abortSignal: controller.signal });
  expect(result.status).toBe("cancelled");
  expect(later).not.toHaveBeenCalled();
});

it("waits for noncooperative JavaScript to return but starts no following node", async () => {
  const controller = new AbortController();
  const started = gate();
  const release = gate();
  const next = vi.fn(done);
  const root = defineWorkflow({
    ...workflow("root", done),
    nodes: {
      run: {
        run: async () => {
          started.resolve();
          await release.promise;
          return done();
        },
      },
      next: { run: next },
    },
    edges: [
      ["__start__", "run"],
      ["run", "next"],
      ["next", "__end__"],
    ],
  });
  const pending = createAgent({ workflows: [root] }).execute({
    workflow: root,
    input: "",
    abortSignal: controller.signal,
  });
  await started.promise;
  controller.abort();
  release.resolve();
  expect(await pending).toMatchObject({ status: "cancelled" });
  expect(next).not.toHaveBeenCalled();
});

for (const persistence of [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
])
  it(`rebinds signals on nested resume and forks with ${persistence}`, async () => {
    const adapter =
      persistence === "memory"
        ? createInMemoryFrameworkAdapter()
        : createRedisFrameworkAdapter({
            url: process.env.KORTYX_TEST_REDIS_URL!,
            prefix: `cancel:${crypto.randomUUID()}:`,
          });
    const child = workflow("child", async () => {
      await useInterrupt({ request: { kind: "text", question: "Continue?" } });
      useAbortSignal()?.throwIfAborted();
      return done();
    });
    const root = workflow("root", async () => ({
      data: (await useWorkflow({ id: "child", workflow: child, input: "" }))
        .data,
    }));
    const agent = createAgent({
      workflows: [root, child],
      frameworkAdapter: adapter,
    });
    const old = new AbortController();
    const pause = await agent.execute({
      workflow: root,
      input: "",
      abortSignal: old.signal,
    });
    expect(pause.status).toBe("suspended");
    if (pause.status !== "suspended") throw new Error("Expected pause");
    const checkpoint = await agent.getCheckpoint(pause.checkpointId!);
    const assertNoSignal = (value: unknown): void => {
      expect(value).not.toBeInstanceOf(AbortSignal);
      if (value && typeof value === "object")
        for (const entry of Object.values(value)) assertNoSignal(entry);
    };
    assertNoSignal(checkpoint);
    const branch = await agent.fork(pause.checkpointId!);
    old.abort();
    expect(
      await agent.resume({
        workflow: root,
        resume: pause.resume,
        response: { type: "text", text: "yes" },
        abortSignal: AbortSignal.abort(),
      }),
    ).toMatchObject({ status: "cancelled" });
    expect(
      await agent.resume({
        workflow: root,
        resume: pause.resume,
        response: { type: "text", text: "yes" },
        abortSignal: new AbortController().signal,
      }),
    ).toMatchObject({ status: "completed" });
    const request = branch.checkpoint.activePendingRequests[0]!;
    expect(
      await agent.resume({
        workflow: root,
        resume: {
          token: request.token,
          requestId: request.requestId,
          runId: request.runId,
          sessionId: branch.sessionId,
        },
        response: { type: "text", text: "fork" },
      }),
    ).toMatchObject({ status: "completed" });
  });

it("reports chat cancellation distinctly with one root completion", async () => {
  const controller = new AbortController();
  const root = workflow("root", async () => {
    controller.abort();
    await setTimeout(1, undefined, { signal: useAbortSignal() });
    return done();
  });
  const agent = createAgent({ workflows: [root] });
  const chunks = [];
  for await (const chunk of await agent.streamChat(
    [{ role: "user", content: "hi" }],
    { workflowId: root.id, abortSignal: controller.signal },
  ))
    chunks.push(chunk);
  expect(chunks.filter((x) => x.type === "cancelled")).toHaveLength(1);
  expect(chunks.filter((x) => x.type === "done")).toHaveLength(1);
  expect(chunks.filter((x) => x.type === "error")).toHaveLength(0);
});

it("cancels active execution when its SSE response consumer disconnects", async () => {
  const started = gate();
  const ended = gate();
  let signal: AbortSignal | undefined;
  const root = workflow("root", async () => {
    signal = useAbortSignal();
    started.resolve();
    try {
      await setTimeout(60_000, undefined, { signal });
    } finally {
      ended.resolve();
    }
    return done();
  });
  const agent = createAgent({ workflows: [root] });
  const source = await agent.streamChat([{ role: "user", content: "hi" }], {
    workflowId: root.id,
  });
  const response = toSSE(source);
  const reader = response.body!.getReader();
  await started.promise;
  await reader.cancel();
  await ended.promise;
  expect(signal?.aborted).toBe(true);
});

it("aborts retry backoff without waiting or starting another attempt", async () => {
  const controller = new AbortController();
  const started = gate();
  const run = vi.fn(() => {
    started.resolve();
    throw new Error("retryable");
  });
  const root = defineWorkflow({
    ...workflow("root", run),
    nodes: {
      run: { run, behavior: { retry: { maxAttempts: 3, delayMs: 60_000 } } },
    },
  });
  const result = createAgent({ workflows: [root] }).execute({
    workflow: root,
    input: "",
    abortSignal: controller.signal,
  });
  await started.promise;
  await setTimeout(10);
  controller.abort();
  expect(await result).toMatchObject({ status: "cancelled" });
  expect(run).toHaveBeenCalledTimes(1);
});

it("leaves a pre-aborted chat resume usable and terminates a started direct resume", async () => {
  const started = gate();
  const root = workflow("root", async () => {
    await useInterrupt({ request: { kind: "text", question: "Continue?" } });
    started.resolve();
    await setTimeout(60_000, undefined, { signal: useAbortSignal() });
    return done();
  });
  const agent = createAgent({ workflows: [root] });
  const pause = await agent.execute({ workflow: root, input: "" });
  if (pause.status !== "suspended") throw new Error("Expected pause");
  const chunks = [];
  for await (const chunk of await agent.streamChat(
    [
      {
        role: "user",
        content: "yes",
        metadata: {
          resume: {
            token: pause.resume.token,
            requestId: pause.resume.requestId,
            selected: "yes",
          },
        },
      },
    ],
    {
      workflowId: root.id,
      sessionId: pause.sessionId,
      abortSignal: AbortSignal.abort(),
    },
  ))
    chunks.push(chunk);
  expect(chunks.map((x) => x.type)).toEqual(["cancelled", "done"]);
  const controller = new AbortController();
  const result = agent.resume({
    workflow: root,
    resume: pause.resume,
    response: { type: "text", text: "yes" },
    abortSignal: controller.signal,
  });
  await started.promise;
  controller.abort();
  expect(await result).toMatchObject({ status: "cancelled" });
  await expect(
    agent.resume({
      workflow: root,
      resume: pause.resume,
      response: { type: "text", text: "again" },
    }),
  ).rejects.toThrow();
});
