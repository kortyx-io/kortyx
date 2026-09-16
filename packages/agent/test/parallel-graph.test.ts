// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import {
  defineWorkflow,
  type NodeFn,
  type WorkflowDefinition,
} from "@kortyx/core";
import { DomainError } from "@kortyx/core/errors";
import {
  completeResponse,
  useAbortSignal,
  useInterrupt,
  useNodeState,
  useReason,
  useWorkflow,
  useWorkflowState,
} from "@kortyx/hooks";
import {
  createInMemoryFrameworkAdapter,
  createRedisFrameworkAdapter,
} from "@kortyx/runtime";
import { collectStream, toSSE } from "@kortyx/stream";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";
import type { ExecutionResult } from "../src/execution/types";

const workflow = (
  id: string,
  nodes: Record<
    string,
    { run: NodeFn; behavior?: WorkflowDefinition["nodes"][string]["behavior"] }
  >,
  edges: WorkflowDefinition["edges"],
) =>
  defineWorkflow({
    id,
    version: "1",
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({}).passthrough(),
    nodes,
    edges,
  });
const child = (id: string, run: NodeFn) =>
  workflow(id, { run: { run } }, [
    ["__start__", "run"],
    ["run", "__end__"],
  ]);
const stopped = (result: ExecutionResult) => {
  expect(result.status, JSON.stringify(result)).toBe("suspended");
  if (result.status !== "suspended") throw new Error(JSON.stringify(result));
  return result;
};
const branches = (a: NodeFn, b: NodeFn, join: NodeFn = () => ({})) =>
  workflow("parent", { a: { run: a }, b: { run: b }, join: { run: join } }, [
    ["__start__", "a"],
    ["__start__", "b"],
    ["a", "join"],
    ["b", "join"],
    ["join", "__end__"],
  ]);

it("starts children in parallel graph nodes and combines disjoint results", async () => {
  const starts: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const a = child("left", async () => {
    starts.push("a");
    await gate;
    return { data: { value: "A" } };
  });
  const b = child("right", () => {
    starts.push("b");
    release();
    return { data: { value: "B" } };
  });
  const parent = branches(
    async () => ({
      data: {
        left: (await useWorkflow({ id: "same-id", workflow: a, input: {} }))
          .data.value,
      },
    }),
    async () => ({
      data: {
        right: (await useWorkflow({ id: "same-id", workflow: b, input: {} }))
          .data.value,
      },
    }),
    ({ input }) => {
      expect(input).toMatchObject({ left: "A", right: "B" });
      return { data: { joined: true } };
    },
  );
  const agent = createAgent({ workflows: [parent, a, b] });
  expect(await agent.execute({ workflow: parent, input: {} })).toMatchObject({
    status: "completed",
    data: { left: "A", right: "B", joined: true },
  });
  expect(starts.sort()).toEqual(["a", "b"]);
  await agent.execute({ workflow: parent, input: {} });
  expect(starts).toHaveLength(4);
});

it("waits for unequal paths and executes their shared node exactly once", async () => {
  let slowFinished = false;
  const join = vi.fn(() => {
    expect(slowFinished).toBe(true);
    return {};
  });
  const parent = workflow(
    "unequal",
    {
      join: { run: join },
      a: { run: () => ({ data: { a: 1 } }) },
      b1: { run: () => ({ data: { b: 1 } }) },
      b2: {
        run: () => {
          slowFinished = true;
          return { data: { b: 2 } };
        },
      },
    },
    [
      ["__start__", "a"],
      ["__start__", "b1"],
      ["b1", "b2"],
      ["a", "join"],
      ["b2", "join"],
      ["join", "__end__"],
    ],
  );
  expect(
    await createAgent({ workflows: [parent] }).execute({
      workflow: parent,
      input: {},
    }),
  ).toMatchObject({ status: "completed", data: { a: 1, b: 2 } });
  expect(join).toHaveBeenCalledTimes(1);
});

it("preserves common ancestors, allows sequential overwrites and isolates sibling input", async () => {
  const parent = workflow(
    "ancestor",
    {
      common: { run: () => ({ data: { value: 1 } }) },
      a: { run: () => ({ data: { value: 2 } }) },
      b: {
        run: ({ input }) => {
          expect(input).toMatchObject({ value: 1 });
          return { data: { b: true } };
        },
      },
      b2: {
        run: ({ input }) => {
          expect(input).toMatchObject({ value: 1, b: true });
          return {};
        },
      },
      join: {
        run: ({ input }) => {
          expect(input).toMatchObject({ value: 2, b: true });
          return {};
        },
      },
    },
    [
      ["__start__", "common"],
      ["common", "a"],
      ["common", "b"],
      ["b", "b2"],
      ["a", "join"],
      ["b2", "join"],
      ["join", "__end__"],
    ],
  );
  expect(
    await createAgent({ workflows: [parent] }).execute({
      workflow: parent,
      input: {},
    }),
  ).toMatchObject({ status: "completed", data: { value: 2, b: true } });
});

it("rejects identical-valued overlapping parallel fields too", async () => {
  const join = vi.fn(() => ({}));
  const parent = branches(
    () => ({ data: { summary: "same" } }),
    () => ({ data: { summary: "same" } }),
    join,
  );
  expect(
    await createAgent({ workflows: [parent] }).execute({
      workflow: parent,
      input: {},
    }),
  ).toMatchObject({
    status: "failed",
    error: {
      code: "GRAPH_OUTPUT_CONFLICT",
      message: expect.stringContaining("summary"),
    },
  });
  expect(join).not.toHaveBeenCalled();
});

it("combines active terminal paths even without explicit end edges", async () => {
  const parent = workflow(
    "implicit-end",
    {
      a: { run: () => ({ data: { a: true } }) },
      b: { run: () => ({ data: { b: true } }) },
    },
    [
      ["__start__", "a"],
      ["__start__", "b"],
    ],
  );
  expect(
    await createAgent({ workflows: [parent] }).execute({
      workflow: parent,
      input: {},
    }),
  ).toMatchObject({ status: "completed", data: { a: true, b: true } });
});

it("does not treat an unselected edge as permission to overwrite a sibling field", async () => {
  const parent = workflow(
    "unselected-ancestry",
    {
      a: { run: () => ({ data: { summary: "A" }, condition: "not-b" }) },
      b: { run: () => ({ data: { summary: "B" } }) },
    },
    [
      ["__start__", "a"],
      ["__start__", "b"],
      ["a", "b", { when: "b" }],
      ["a", "__end__"],
      ["b", "__end__"],
    ],
  );
  expect(
    await createAgent({ workflows: [parent] }).execute({
      workflow: parent,
      input: {},
    }),
  ).toMatchObject({
    status: "failed",
    error: { code: "GRAPH_OUTPUT_CONFLICT", context: { node: "__end__" } },
  });
});

it("fails a conflicting shared node without running it or renaming fields", async () => {
  const join = vi.fn(() => ({}));
  const parent = branches(
    () => ({ data: { summary: "A" } }),
    () => ({ data: { summary: "B" } }),
    join,
  );
  expect(
    await createAgent({ workflows: [parent] }).execute({
      workflow: parent,
      input: {},
    }),
  ).toMatchObject({
    status: "failed",
    error: { code: "GRAPH_OUTPUT_CONFLICT", context: { node: "join" } },
  });
  expect(join).not.toHaveBeenCalled();
});

it("contains failures while independent descendants complete and required descendants fail", async () => {
  const independent = vi.fn(() => ({ data: { independent: true } }));
  const join = vi.fn(() => ({}));
  const parent = workflow(
    "failures",
    {
      a: {
        run: () => {
          throw new DomainError("A_FAILED", "A failed");
        },
      },
      b: { run: () => ({ data: { b: true } }) },
      independent: { run: independent },
      join: { run: join },
    },
    [
      ["__start__", "a"],
      ["__start__", "b"],
      ["b", "independent"],
      ["a", "join"],
      ["independent", "join"],
      ["join", "__end__"],
    ],
  );
  const result = await createAgent({ workflows: [parent] }).execute({
    workflow: parent,
    input: {},
  });
  expect(result).toMatchObject({
    status: "failed",
    error: { code: "GRAPH_DEPENDENCY_FAILED", context: { node: "join" } },
  });
  expect(independent).toHaveBeenCalledTimes(1);
  expect(join).not.toHaveBeenCalled();
});

it("retries a branch using its existing node policy without retrying successful siblings", async () => {
  let attempts = 0;
  const b = vi.fn(() => ({ data: { b: true } }));
  const parent = branches(() => {
    if (++attempts === 1) throw new Error("transient");
    return { data: { a: true } };
  }, b);
  const retryNode = parent.nodes.a;
  if (!retryNode) throw new Error("Missing node");
  retryNode.behavior = { retry: { maxAttempts: 2 } };
  expect(
    await createAgent({ workflows: [parent] }).execute({
      workflow: parent,
      input: {},
    }),
  ).toMatchObject({ status: "completed", data: { a: true, b: true } });
  expect(attempts).toBe(2);
  expect(b).toHaveBeenCalledTimes(1);
});

it("advances the answered branch while another branch and the join remain waiting", async () => {
  const afterA = vi.fn(() => ({ data: { afterA: true } }));
  const afterB = vi.fn();
  const join = vi.fn(() => ({}));
  const parent = workflow(
    "independent-progress",
    {
      a: {
        run: async () => ({
          data: {
            a: await useInterrupt({
              request: { kind: "text", question: "A?" },
            }),
          },
        }),
      },
      a2: { run: afterA },
      b1: { run: () => ({}) },
      b: {
        run: async () => {
          const b = await useInterrupt({
            request: { kind: "text", question: "B?" },
          });
          afterB();
          return { data: { b } };
        },
      },
      join: { run: join },
    },
    [
      ["__start__", "a"],
      ["__start__", "b1"],
      ["a", "a2"],
      ["b1", "b"],
      ["a2", "join"],
      ["b", "join"],
      ["join", "__end__"],
    ],
  );
  const agent = createAgent({ workflows: [parent] });
  const first = stopped(await agent.execute({ workflow: parent, input: {} }));
  const second = stopped(
    await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "text", text: "A-only" },
    }),
  );
  expect(second.interrupt.input.question).toBe("B?");
  expect(afterA).toHaveBeenCalledTimes(1);
  expect(afterB).not.toHaveBeenCalled();
  expect(join).not.toHaveBeenCalled();
  expect(
    await agent.resume({
      workflow: parent,
      resume: second.resume,
      response: { type: "text", text: "B-only" },
    }),
  ).toMatchObject({
    status: "completed",
    data: { a: "A-only", b: "B-only", afterA: true },
  });
  expect(join).toHaveBeenCalledTimes(1);
});

it("preserves branch workflow state written before a pause and passes it to successors", async () => {
  const parent = branches(
    async () => {
      const [saved, save] = useWorkflowState("left", "initial");
      if (saved === "initial") save("saved-before-pause");
      await useInterrupt({ request: { kind: "text", question: "A?" } });
      const [restored] = useWorkflowState<string>("left");
      expect(restored).toBe("saved-before-pause");
      return {};
    },
    () => {
      useWorkflowState("right", "B");
      return {};
    },
    () => {
      const [left] = useWorkflowState<string>("left");
      const [right] = useWorkflowState<string>("right");
      return { data: { left, right } };
    },
  );
  const agent = createAgent({ workflows: [parent] });
  const first = stopped(await agent.execute({ workflow: parent, input: {} }));
  expect(
    await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "text", text: "yes" },
    }),
  ).toMatchObject({
    status: "completed",
    data: { left: "saved-before-pause", right: "B" },
  });
});

for (const limit of ["maxModelPasses", "maxToolCalls"] as const) {
  it(`shares ${limit} and counts concurrent child usage once after Continue`, async () => {
    const execute = vi.fn(async () => "ok");
    const invoke = vi.fn(async (messages: unknown) => {
      const tools =
        limit === "maxToolCalls" &&
        Array.isArray(messages) &&
        messages.length < 3;
      return {
        content: tools ? "" : "done",
        usage: { input: 2, output: 3, total: 5 },
        ...(tools
          ? { toolCalls: [{ id: "tool", name: "tool", input: {} }] }
          : {}),
      };
    });
    const provider = {
      id: "mock",
      models: ["mock"],
      getModel: () => ({ invoke, stream: async function* () {} }),
    };
    const run = async () => {
      await useReason({
        id: "reason",
        model: { provider, modelId: "mock" },
        input: "go",
        stream: false,
        ...(limit === "maxToolCalls"
          ? {
              tools: [
                {
                  name: "tool",
                  description: "tool",
                  inputSchema: z.object({}),
                  execute,
                },
              ],
            }
          : {}),
      });
      return {};
    };
    const a = child("left", run),
      b = child("right", run);
    const parent = branches(
      async () => {
        await useWorkflow({ id: "left", workflow: a, input: {} });
        return {};
      },
      async () => {
        await useWorkflow({ id: "right", workflow: b, input: {} });
        return {};
      },
    );
    const agent = createAgent({ workflows: [parent, a, b] });
    const first = stopped(
      await agent.execute({
        workflow: parent,
        input: {},
        limits: { [limit]: 1 },
      }),
    );
    expect(first.reason).toBe("limit_reached");
    const result = await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "select", ids: ["continue"] },
    });
    expect(result.status).toBe("completed");
    expect(result.usage?.total).toBe(invoke.mock.calls.length * 5);
    expect(invoke).toHaveBeenCalledTimes(limit === "maxToolCalls" ? 4 : 2);
    if (limit === "maxToolCalls") expect(execute).toHaveBeenCalledTimes(2);
  });
}

it("cancels and drains both branches while preserving known usage", async () => {
  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  const cleaned: string[] = [];
  const provider = {
    id: "mock",
    models: ["mock"],
    getModel: () => ({
      invoke: async () => ({
        content: "done",
        usage: { input: 2, output: 3, total: 5 },
      }),
      stream: async function* () {},
    }),
  };
  const run =
    (id: string): NodeFn =>
    async () => {
      await useReason({
        id: "reason",
        model: { provider, modelId: "mock" },
        input: "go",
        stream: false,
      });
      const signal = useAbortSignal();
      if (!signal) throw new Error("missing signal");
      signals.push(signal);
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            cleaned.push(id);
            resolve();
          },
          { once: true },
        );
        if (signals.length === 2) controller.abort();
      });
      return {};
    };
  const parent = branches(run("a"), run("b"));
  const result = await createAgent({ workflows: [parent] }).execute({
    workflow: parent,
    input: {},
    abortSignal: controller.signal,
  });
  expect(result).toMatchObject({ status: "cancelled", usage: { total: 10 } });
  expect(cleaned.sort()).toEqual(["a", "b"]);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

it("supports root response completion followed by background branch approval", async () => {
  const parent = branches(
    async () => {
      await completeResponse({ message: "Working" });
      await useInterrupt({ request: { kind: "text", question: "A?" } });
      return { data: { a: true } };
    },
    () => ({ data: { b: true } }),
  );
  const agent = createAgent({ workflows: [parent] });
  const first = stopped(await agent.execute({ workflow: parent, input: {} }));
  expect(
    await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "text", text: "yes" },
    }),
  ).toMatchObject({ status: "completed", data: { a: true, b: true } });
});

it("closes SSE once and retains a scoped background graph approval after request abort", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = new AbortController();
  let completion!: Promise<void>;
  const parent = defineWorkflow({
    ...branches(
      async () => {
        await completeResponse({ message: "Working" });
        await gate;
        expect(useAbortSignal()?.aborted).toBe(false);
        await useInterrupt({ request: { kind: "text", question: "A?" } });
        return { data: { a: true } };
      },
      () => ({ data: { b: true } }),
    ),
    inputSchema: z.string(),
  });
  const memory = createInMemoryFrameworkAdapter();
  const agent = createAgent({ workflows: [parent], frameworkAdapter: memory });
  const stream = await agent.streamChat([{ role: "user", content: "hello" }], {
    workflowId: parent.id,
    sessionId: "graph-background",
    abortSignal: request.signal,
    onExecution: (p) => {
      completion = p;
    },
  });
  const text = await toSSE(stream).text();
  expect(text).toContain("Working");
  expect(text.match(/"type":"done"/g)).toHaveLength(1);
  const head = await memory.sessionCheckpoints.getHead("graph-background");
  request.abort();
  release();
  await completion;
  const [pending] = await agent.listInterrupts({
    sessionId: "graph-background",
    afterResponseCompleted: true,
  });
  if (!pending) throw new Error("Missing background approval");
  const saved = await agent.getInterrupt(pending.id, {
    sessionId: "graph-background",
  });
  if (!saved) throw new Error("Missing saved approval");
  expect(
    await agent.resume({
      workflow: parent,
      resume: saved.resume,
      response: { type: "text", text: "yes" },
    }),
  ).toMatchObject({ status: "completed", data: { a: true, b: true } });
  expect(await memory.sessionCheckpoints.getHead("graph-background")).toEqual(
    head,
  );
});

it("starts a fresh chat graph rather than reusing a foreground snapshot of background work", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const completions: Promise<void>[] = [];
  let turns = 0;
  const sibling = vi.fn(() => ({ data: { b: true } }));
  const parent = defineWorkflow({
    ...branches(async () => {
      const turn = ++turns;
      await completeResponse({ message: `turn-${turn}` });
      if (turn === 1) await gate;
      return { data: { turn } };
    }, sibling),
    inputSchema: z.string(),
  });
  const agent = createAgent({ workflows: [parent] });
  const send = (content: string) =>
    agent.streamChat([{ role: "user", content }], {
      workflowId: parent.id,
      sessionId: "graph-turns",
      onExecution: (p) => {
        completions.push(p);
      },
    });
  await collectStream(await send("first"));
  const next = await collectStream(await send("second"));
  expect(next).toContainEqual(
    expect.objectContaining({ type: "message", content: "turn-2" }),
  );
  expect(turns).toBe(2);
  release();
  await Promise.all(completions);
  expect(sibling).toHaveBeenCalledTimes(2);
});

it("keeps parallel replay journals and saved sibling questions out of SSE output", async () => {
  const left = child("left", async () => ({
    data: {
      a: await useInterrupt({ request: { kind: "text", question: "A?" } }),
    },
  }));
  const right = child("right", async () => ({
    data: {
      b: await useInterrupt({ request: { kind: "text", question: "B?" } }),
    },
  }));
  const parent = defineWorkflow({
    ...branches(
      async () => ({
        data: (await useWorkflow({ id: "left", workflow: left, input: {} }))
          .data,
      }),
      async () => ({
        data: (await useWorkflow({ id: "right", workflow: right, input: {} }))
          .data,
      }),
    ),
    inputSchema: z.string(),
  });
  const agent = createAgent({ workflows: [parent, left, right] });
  const chunks = await collectStream(
    await agent.streamChat([{ role: "user", content: "hello" }], {
      workflowId: parent.id,
      sessionId: "journal-privacy",
    }),
  );
  expect(chunks.filter((chunk) => chunk.type === "interrupt")).toHaveLength(1);
  const serialized = JSON.stringify(chunks);
  expect(serialized).not.toContain("__kortyxParallelGraph");
  expect(serialized).not.toContain("B?");
  expect(serialized).not.toContain("channel_values");
});

it("does not wait for an unselected conditional predecessor", async () => {
  const skipped = vi.fn(() => ({}));
  const join = vi.fn(() => ({}));
  const parent = workflow(
    "conditional",
    {
      join: { run: join },
      no: { run: skipped },
      yes: { run: () => ({ data: { yes: true } }) },
      route: { run: () => ({ condition: "yes" }) },
      b: { run: () => ({ data: { b: true } }) },
    },
    [
      ["__start__", "route"],
      ["__start__", "b"],
      ["route", "yes", { when: "yes" }],
      ["route", "no", { when: "no" }],
      ["yes", "join"],
      ["no", "join"],
      ["b", "join"],
      ["join", "__end__"],
    ],
  );
  expect(
    await createAgent({ workflows: [parent] }).execute({
      workflow: parent,
      input: {},
    }),
  ).toMatchObject({ status: "completed", data: { yes: true, b: true } });
  expect(join).toHaveBeenCalledTimes(1);
  expect(skipped).not.toHaveBeenCalled();
});

for (const persistence of [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
]) {
  it(`preserves separate child questions, state, cached siblings and fork answers across ${persistence} reconstruction`, async () => {
    const memory = createInMemoryFrameworkAdapter();
    const prefix = `graph-test:${crypto.randomUUID()}:`;
    const adapter = () =>
      persistence === "memory"
        ? memory
        : createRedisFrameworkAdapter({
            url: process.env.KORTYX_TEST_REDIS_URL ?? "",
            prefix,
          });
    const completed = vi.fn(() => ({ data: { cached: true } }));
    const ask = (id: string) =>
      child(id, async () => {
        const [saved, save] = useNodeState<string>(id);
        const answer = await useInterrupt({
          request: { kind: "text", question: `${id}?` },
        });
        save(answer as string);
        return { data: { answer, saved } };
      });
    const a = ask("A"),
      b = ask("B");
    const parent = workflow(
      "questions",
      {
        a: {
          run: async () => ({
            data: {
              a: (await useWorkflow({ id: "ask", workflow: a, input: {} }))
                .data,
            },
          }),
        },
        b1: { run: completed },
        b: {
          run: async () => ({
            data: {
              b: (await useWorkflow({ id: "ask", workflow: b, input: {} }))
                .data,
            },
          }),
        },
        join: { run: () => ({ data: { joined: true } }) },
      },
      [
        ["__start__", "a"],
        ["__start__", "b1"],
        ["b1", "b"],
        ["a", "join"],
        ["b", "join"],
        ["join", "__end__"],
      ],
    );
    const make = () =>
      createAgent({ workflows: [parent, a, b], frameworkAdapter: adapter() });
    const first = stopped(
      await make().execute({ workflow: parent, input: {} }),
    );
    expect(first.interrupt.input.question).toBe("A?");
    expect(completed).toHaveBeenCalledTimes(1);
    if (!first.checkpointId) throw new Error("Missing checkpoint");
    const fork = await make().fork(first.checkpointId, {
      newSessionId: `fork-${crypto.randomUUID()}`,
    });
    const pending = fork.checkpoint.activePendingRequests[0];
    if (!pending) throw new Error("Missing fork question");
    const forkSecond = stopped(
      await make().resume({
        workflow: parent,
        resume: {
          token: pending.token,
          requestId: pending.requestId,
          sessionId: fork.sessionId,
          runId: pending.runId,
        },
        response: { type: "text", text: "fork A" },
      }),
    );
    expect(forkSecond.interrupt.input.question).toBe("B?");
    expect(
      await make().resume({
        workflow: parent,
        resume: forkSecond.resume,
        response: { type: "text", text: "fork B" },
      }),
    ).toMatchObject({
      status: "completed",
      data: {
        a: { answer: "fork A", saved: "A" },
        b: { answer: "fork B", saved: "B" },
      },
    });
    const second = stopped(
      await make().resume({
        workflow: parent,
        resume: first.resume,
        response: { type: "text", text: "answer A" },
      }),
    );
    expect(second.interrupt.input.question).toBe("B?");
    expect(
      await make().resume({
        workflow: parent,
        resume: second.resume,
        response: { type: "text", text: "answer B" },
      }),
    ).toMatchObject({
      status: "completed",
      data: {
        cached: true,
        joined: true,
        a: { answer: "answer A", saved: "A" },
        b: { answer: "answer B", saved: "B" },
      },
    });
    expect(completed).toHaveBeenCalledTimes(1);
    await expect(
      make().resume({
        workflow: parent,
        resume: first.resume,
        response: { type: "text", text: "duplicate" },
      }),
    ).rejects.toThrow();
  });
}

it("allows parallel graphs inside a called workflow", async () => {
  const inner = branches(
    async () => ({
      data: {
        a: await useInterrupt({ request: { kind: "text", question: "A?" } }),
      },
    }),
    async () => ({
      data: {
        b: await useInterrupt({ request: { kind: "text", question: "B?" } }),
      },
    }),
  );
  const outer = child("outer", async () => ({
    data: (await useWorkflow({ id: "inner", workflow: inner, input: {} })).data,
  }));
  const agent = createAgent({ workflows: [outer, inner] });
  const first = stopped(await agent.execute({ workflow: outer, input: {} }));
  const second = stopped(
    await agent.resume({
      workflow: outer,
      resume: first.resume,
      response: { type: "text", text: "A" },
    }),
  );
  expect(second.interrupt.input.question).toBe("B?");
  expect(
    await agent.resume({
      workflow: outer,
      resume: second.resume,
      response: { type: "text", text: "B" },
    }),
  ).toMatchObject({ status: "completed", data: { a: "A", b: "B" } });
});

it("retains waiting branches when another branch fails", async () => {
  const after = vi.fn(() => ({}));
  const parent = branches(
    () => {
      throw new DomainError("A_FAILED", "A failed");
    },
    async () => {
      await useInterrupt({ request: { kind: "text", question: "B?" } });
      after();
      return {};
    },
  );
  const agent = createAgent({ workflows: [parent] });
  const first = stopped(await agent.execute({ workflow: parent, input: {} }));
  expect(first.interrupt.input.question).toBe("B?");
  expect(
    await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "text", text: "B" },
    }),
  ).toMatchObject({
    status: "failed",
    error: { code: "GRAPH_DEPENDENCY_FAILED" },
  });
  expect(after).toHaveBeenCalledTimes(1);
});

it("shares child limits and reuses completed branches after Continue", async () => {
  const a = child("left", () => ({ data: { a: true } }));
  const b = child("right", () => ({ data: { b: true } }));
  const left = vi.fn();
  const parent = branches(
    async () => {
      const value = await useWorkflow({ id: "a", workflow: a, input: {} });
      left();
      return { data: value.data };
    },
    async () => ({
      data: (await useWorkflow({ id: "b", workflow: b, input: {} })).data,
    }),
  );
  const agent = createAgent({ workflows: [parent, a, b] });
  const first = stopped(
    await agent.execute({
      workflow: parent,
      input: {},
      limits: { maxChildInvocations: 1 },
    }),
  );
  expect(first.reason).toBe("limit_reached");
  expect(
    await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "select", ids: ["continue"] },
    }),
  ).toMatchObject({ status: "completed", data: { a: true, b: true } });
  expect(left).toHaveBeenCalledTimes(1);
});
