// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import { setTimeout } from "node:timers/promises";
import { defineWorkflow } from "@kortyx/core";
import {
  completeResponse,
  useAbortSignal,
  useInterrupt,
  useStructuredData,
  useWorkflow,
} from "@kortyx/hooks";
import {
  createInMemoryFrameworkAdapter,
  createRedisFrameworkAdapter,
} from "@kortyx/runtime";
import { collectStream, consumeStream, toSSE } from "@kortyx/stream";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createChatRouteHandler } from "../src/adapters/http";
import { createAgent } from "../src/chat/create-agent";

const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
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

it("closes a real SSE response, continues handoff despite request abort and freezes the session head", async () => {
  const release = gate();
  const background = vi.fn();
  const request = new AbortController();
  const adapter = createInMemoryFrameworkAdapter();
  let completion!: Promise<void>;
  const root = workflow("root", async () => {
    await completeResponse({
      message: "All done!",
      data: { answer: "public" },
    });
    await completeResponse({ message: "duplicate" });
    useStructuredData({ data: { hidden: true } });
    return { ...done(), ui: { message: "hidden" }, transitionTo: "analytics" };
  });
  const analytics = workflow("analytics", async () => {
    await release.promise;
    expect(useAbortSignal()?.aborted).toBe(false);
    background();
    return done();
  });
  const agent = createAgent({
    workflows: [root, analytics],
    frameworkAdapter: adapter,
  });
  const stream = await agent.streamChat([{ role: "user", content: "hello" }], {
    workflowId: "root",
    sessionId: "session",
    abortSignal: request.signal,
    onExecution: (value) => {
      completion = value;
    },
  });
  const text = await toSSE(stream).text();
  expect(text).toContain("All done!");
  expect(text).toContain('"answer":"public"');
  expect(text).not.toContain("hidden");
  expect(text).not.toContain("duplicate");
  expect(text.match(/"type":"done"/g)).toHaveLength(1);
  expect(background).not.toHaveBeenCalled();
  const head = await adapter.sessionCheckpoints.getHead("session");
  expect(head?.workflow).toBe("root");
  request.abort();
  release.resolve();
  await completion;
  expect(background).toHaveBeenCalledOnce();
  expect(await adapter.sessionCheckpoints.getHead("session")).toEqual(head);
});

for (const kind of [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
]) {
  it(`${kind}: discovers a ready background interrupt and resumes without changing chat state`, async () => {
    const sessionId = `response-${kind}-${crypto.randomUUID()}`;
    const adapter = () =>
      kind === "redis"
        ? createRedisFrameworkAdapter({
            url: process.env.KORTYX_TEST_REDIS_URL!,
            prefix: sessionId,
          })
        : memory;
    const memory = createInMemoryFrameworkAdapter();
    const first = gate();
    let completion!: Promise<void>;
    const root = workflow("root", async () => {
      await completeResponse();
      await first.promise;
      const answer = await useInterrupt({
        id: "review",
        request: {
          kind: "choice",
          question: "Save as a use case?",
          options: [{ id: "save", label: "Save" }],
        },
      });
      return { data: { answer: String(answer) } };
    });
    const config = { workflows: [root], frameworkAdapter: adapter() };
    const agent = createAgent(config);
    const chunks = await collectStream(
      await agent.streamChat([{ role: "user", content: "hi" }], {
        sessionId,
        workflowId: "root",
        context: { tenantId: "tenant-a" },
        onExecution: (p) => {
          completion = p;
        },
      }),
    );
    expect(chunks.filter((c) => c.type === "done")).toHaveLength(1);
    expect(chunks.some((c) => c.type === "message")).toBe(false);
    expect(await agent.listInterrupts({ sessionId })).toEqual([]);
    const head =
      await config.frameworkAdapter.sessionCheckpoints.getHead(sessionId);
    first.resolve();
    await completion;
    const restored = createAgent({ ...config, frameworkAdapter: adapter() });
    const pending = await restored.listInterrupts({
      context: { tenantId: "tenant-a" },
      afterResponseCompleted: true,
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      afterResponseCompleted: true,
      input: { question: "Save as a use case?" },
    });
    expect(JSON.stringify(pending)).not.toContain('"token"');
    expect(
      await restored.listInterrupts({ context: { tenantId: "tenant-b" } }),
    ).toEqual([]);
    const record = await restored.getInterrupt(pending[0]!.id, { sessionId });
    expect(record).not.toBeNull();
    const result = await restored.resume({
      workflow: root,
      resume: record!.resume,
      response: { type: "select", ids: ["save"] },
    });
    expect(result).toMatchObject({
      status: "completed",
      data: { answer: "save" },
    });
    expect(await restored.listInterrupts({ sessionId })).toEqual([]);
    expect(
      await config.frameworkAdapter.sessionCheckpoints.getHead(sessionId),
    ).toEqual(head);
    await expect(
      restored.resume({
        workflow: root,
        resume: record!.resume,
        response: { type: "select", ids: ["save"] },
      }),
    ).rejects.toThrow();
  });
}

it("direct execute ignores response completion and still waits for its final validated outcome", async () => {
  const release = gate();
  const entered = gate();
  const root = workflow("root", async () => {
    await completeResponse({ message: "hello" });
    entered.resolve();
    await release.promise;
    return done();
  });
  const agent = createAgent({ workflows: [root] });
  const settled = vi.fn();
  const promise = agent.execute({ workflow: root, input: "" }).then((r) => {
    settled();
    return r;
  });
  await entered.promise;
  expect(settled).not.toHaveBeenCalled();
  release.resolve();
  expect(await promise).toMatchObject({
    status: "completed",
    data: { answer: "done" },
  });
});

it("execution cancellation still reaches cooperative work after response completion", async () => {
  const entered = gate();
  const server = new AbortController();
  let completion!: Promise<void>;
  const after = vi.fn();
  const root = workflow("root", async () => {
    await completeResponse();
    entered.resolve();
    await setTimeout(10000, undefined, { signal: useAbortSignal() });
    after();
    return done();
  });
  const agent = createAgent({ workflows: [root] });
  await collectStream(
    await agent.streamChat([{ role: "user", content: "" }], {
      workflowId: "root",
      executionSignal: server.signal,
      onExecution: (p) => {
        completion = p;
      },
    }),
  );
  await entered.promise;
  server.abort();
  await completion;
  expect(after).not.toHaveBeenCalled();
});

it("a child cannot close its caller's response", async () => {
  const child = workflow("child", async () => {
    await completeResponse();
    return done();
  });
  const root = workflow("root", async () => {
    await useWorkflow({ id: "child", workflow: child, input: "" });
    return done();
  });
  const result = await createAgent({ workflows: [root, child] }).execute({
    workflow: root,
    input: "",
  });
  expect(result).toMatchObject({ status: "failed" });
});

it("buffered HTTP and async-iterator consumers finish before the background work", async () => {
  const release = gate();
  let completion!: Promise<void>;
  const root = workflow("root", async () => {
    await completeResponse({ message: "ready" });
    await release.promise;
    return done();
  });
  const agent = createAgent({ workflows: [root] });
  const handler = createChatRouteHandler({
    agent,
    onExecution: (p) => {
      completion = p;
    },
  });
  const response = await handler(
    new Request("http://localhost/chat", {
      method: "POST",
      body: JSON.stringify({ workflowId: "root", messages: [], stream: false }),
    }),
  );
  expect(await response.json()).toMatchObject({ text: "ready" });
  release.resolve();
  await completion;
  await consumeStream(await agent.streamChat([], { workflowId: "root" }));
});

it("background execution limits suspend and Continue does not append a chat checkpoint", async () => {
  let completion!: Promise<void>;
  const adapter = createInMemoryFrameworkAdapter();
  const root = defineWorkflow({
    id: "limited",
    version: "1",
    inputSchema: z.string(),
    outputSchema: z.object({ answer: z.string() }),
    nodes: {
      close: {
        run: async () => {
          await completeResponse();
          return {};
        },
      },
      finish: { run: done },
    },
    edges: [
      ["__start__", "close"],
      ["close", "finish"],
      ["finish", "__end__"],
    ],
  });
  const agent = createAgent({
    workflows: [root],
    frameworkAdapter: adapter,
    limits: { maxNodeExecutions: 1 },
  });
  await collectStream(
    await agent.streamChat([], {
      sessionId: "limited-session",
      workflowId: "limited",
      onExecution: (p) => {
        completion = p;
      },
    }),
  );
  const head = await adapter.sessionCheckpoints.getHead("limited-session");
  await completion;
  const [pending] = await agent.listInterrupts({
    sessionId: "limited-session",
  });
  expect(pending!.input.question).toContain("Limit reached");
  const interrupt = await agent.getInterrupt(pending!.id, {
    sessionId: "limited-session",
  });
  expect(
    await agent.resume({
      workflow: root,
      resume: interrupt!.resume,
      response: { type: "select", ids: ["continue"] },
    }),
  ).toMatchObject({ status: "completed" });
  expect(await adapter.sessionCheckpoints.getHead("limited-session")).toEqual(
    head,
  );
});

it("low-level orchestrations can finish a response without a session persistence adapter", async () => {
  const { orchestrateGraphStream } = await import("../src/orchestrator");
  const { createExecutionGraph, buildInitialGraphState } = await import(
    "@kortyx/runtime"
  );
  const root = workflow("root", async () => {
    await completeResponse();
    return done();
  });
  const config = {};
  const state = await buildInitialGraphState({
    input: "",
    runtime: {},
    config,
    defaultWorkflowId: root.id,
  });
  const stream = await orchestrateGraphStream({
    graph: await createExecutionGraph(root, config),
    state,
    config,
    runId: "no-store",
    selectWorkflow: async () => root,
  });
  expect(
    (await collectStream(stream as any)).filter(
      (chunk) => chunk.type === "done",
    ),
  ).toHaveLength(1);
});

for (const transport of ["direct", "chat"] as const) {
  it(`${transport}: a resumed background attempt honors server cancellation`, async () => {
    const entered = gate();
    const request = new AbortController();
    const server = new AbortController();
    let completion!: Promise<void>;
    let liveSignal: AbortSignal | undefined;
    const after = vi.fn();
    const root = workflow("root", async () => {
      await completeResponse();
      await useInterrupt({
        id: "review",
        request: { kind: "text", question: "Review?" },
      });
      liveSignal = useAbortSignal();
      entered.resolve();
      await setTimeout(10000, undefined, { signal: liveSignal });
      after();
      return done();
    });
    const agent = createAgent({ workflows: [root] });
    await collectStream(
      await agent.streamChat([], {
        workflowId: "root",
        sessionId: "cancellation",
        onExecution: (p) => {
          completion = p;
        },
      }),
    );
    await completion;
    const [summary] = await agent.listInterrupts({ sessionId: "cancellation" });
    const interrupt = await agent.getInterrupt(summary!.id, {
      sessionId: "cancellation",
    });
    if (transport === "direct") {
      const result = agent.resume({
        workflow: root,
        resume: interrupt!.resume,
        response: { type: "text", text: "ok" },
        abortSignal: server.signal,
      });
      await entered.promise;
      server.abort();
      expect(await result).toMatchObject({ status: "cancelled" });
    } else {
      const chunks = await collectStream(
        await agent.streamChat(
          [
            {
              role: "user",
              content: "ok",
              metadata: { resume: { ...interrupt!.resume, selected: ["ok"] } },
            },
          ],
          {
            sessionId: "cancellation",
            abortSignal: request.signal,
            executionSignal: server.signal,
            onExecution: (p) => {
              completion = p;
            },
          },
        ),
      );
      expect(chunks).toEqual([]);
      await entered.promise;
      request.abort();
      expect(liveSignal!.aborted).toBe(false);
      server.abort();
      await completion;
    }
    expect(liveSignal!.aborted).toBe(true);
    expect(after).not.toHaveBeenCalled();
  });
}

it("a later chat turn keeps its head while older background work suspends twice and completes", async () => {
  const release = gate();
  const adapter = createInMemoryFrameworkAdapter();
  let completion!: Promise<void>;
  const root = workflow("root", async () => {
    await completeResponse({ message: "first answer" });
    await release.promise;
    await useInterrupt({
      id: "first",
      request: { kind: "text", question: "First approval?" },
    });
    await useInterrupt({
      id: "second",
      request: { kind: "text", question: "Second approval?" },
    });
    return done();
  });
  const later = workflow("later", async () => ({
    ...done(),
    ui: { message: "later answer" },
  }));
  const agent = createAgent({
    workflows: [root, later],
    frameworkAdapter: adapter,
  });
  await collectStream(
    await agent.streamChat([], {
      workflowId: "root",
      sessionId: "overlap",
      onExecution: (p) => {
        completion = p;
      },
    }),
  );
  const firstHead = await adapter.sessionCheckpoints.getHead("overlap");
  const laterChunks = await collectStream(
    await agent.streamChat([], { workflowId: "later", sessionId: "overlap" }),
  );
  expect(JSON.stringify(laterChunks)).toContain("later answer");
  const laterHead = await adapter.sessionCheckpoints.getHead("overlap");
  expect(laterHead!.id).not.toBe(firstHead!.id);
  release.resolve();
  await completion;
  for (const [question, status] of [
    ["First approval?", "suspended"],
    ["Second approval?", "completed"],
  ]) {
    const [pending] = await agent.listInterrupts({
      sessionId: "overlap",
      afterResponseCompleted: true,
    });
    expect(pending!.input.question).toBe(question);
    const interrupt = await agent.getInterrupt(pending!.id, {
      sessionId: "overlap",
    });
    expect(
      await agent.resume({
        workflow: root,
        resume: interrupt!.resume,
        response: { type: "text", text: "ok" },
      }),
    ).toMatchObject({ status });
    expect(await adapter.sessionCheckpoints.getHead("overlap")).toEqual(
      laterHead,
    );
  }
  expect(await agent.listInterrupts({ sessionId: "overlap" })).toEqual([]);
});

it("a failure after completion is observable without reopening or corrupting the response", async () => {
  const release = gate();
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  let completion!: Promise<void>;
  const root = workflow("root", async () => {
    await completeResponse({ message: "ready" });
    await release.promise;
    throw new Error("background failed");
  });
  try {
    const agent = createAgent({ workflows: [root] });
    const chunks = await collectStream(
      await agent.streamChat([], {
        workflowId: "root",
        onExecution: (p) => {
          completion = p;
        },
      }),
    );
    release.resolve();
    await completion;
    expect(chunks.some((c) => c.type === "error")).toBe(false);
    expect(chunks.filter((c) => c.type === "done")).toHaveLength(1);
    expect(errorLog).toHaveBeenCalledWith(
      "[error:orchestrateGraphStream]",
      expect.objectContaining({ message: "background failed" }),
    );
  } finally {
    errorLog.mockRestore();
  }
});

it("retrying the completing node does not duplicate output or foreground checkpoints", async () => {
  let attempts = 0;
  let completion!: Promise<void>;
  const adapter = createInMemoryFrameworkAdapter();
  const root = defineWorkflow({
    id: "retry",
    version: "1",
    inputSchema: z.string(),
    outputSchema: z.object({ answer: z.string() }),
    nodes: {
      run: {
        behavior: { retry: { maxAttempts: 2, delayMs: 1 } },
        run: async () => {
          await completeResponse({ message: "ready" });
          if (++attempts === 1) throw new Error("temporary background failure");
          return done();
        },
      },
    },
    edges: [
      ["__start__", "run"],
      ["run", "__end__"],
    ],
  });
  const agent = createAgent({ workflows: [root], frameworkAdapter: adapter });
  const chunks = await collectStream(
    await agent.streamChat([], {
      workflowId: "retry",
      sessionId: "retry-session",
      onExecution: (p) => {
        completion = p;
      },
    }),
  );
  const checkpoints = await agent.listCheckpoints("retry-session");
  await completion;
  expect(attempts).toBe(2);
  expect(chunks.filter((c) => c.type === "message")).toHaveLength(1);
  expect(chunks.filter((c) => c.type === "done")).toHaveLength(1);
  expect(await agent.listCheckpoints("retry-session")).toEqual(checkpoints);
});
