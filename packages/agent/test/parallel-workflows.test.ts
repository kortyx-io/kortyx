// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import {
  defineWorkflow,
  type NodeResult,
  type WorkflowDefinition,
} from "@kortyx/core";
import {
  type KortyxTelemetryEvent,
  ParallelError,
  parallel,
  useAbortSignal,
  useInterrupt,
  useReason,
  useWorkflow,
} from "@kortyx/hooks";
import {
  createInMemoryFrameworkAdapter,
  createRedisFrameworkAdapter,
} from "@kortyx/runtime";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";
import type { ExecutionResult } from "../src/execution/types";

const workflow = (id: string, run: () => NodeResult | Promise<NodeResult>) =>
  defineWorkflow({
    id,
    version: "1",
    inputSchema: z.object({}),
    outputSchema: z.object({}).passthrough(),
    nodes: { run: { run } },
    edges: [
      ["__start__", "run"],
      ["run", "__end__"],
    ],
  });
const stopped = (result: ExecutionResult) => {
  expect(result.status, JSON.stringify(result)).toBe("suspended");
  if (result.status !== "suspended") throw new Error(JSON.stringify(result));
  return result;
};
const call = (
  child: WorkflowDefinition &
    Pick<ReturnType<typeof workflow>, "inputSchema" | "outputSchema">,
) => useWorkflow({ id: child.id, workflow: child, input: {} });

it("starts both children before either completes and preserves input order across dependent waves", async () => {
  const starts: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const a = workflow("a", async () => {
    starts.push("a");
    await gate;
    return { data: { value: "A" } };
  });
  const b = workflow("b", () => {
    starts.push("b");
    release();
    return { data: { value: "B" } };
  });
  const next = workflow("next", () => {
    expect(starts).toEqual(["a", "b"]);
    return { data: { next: true } };
  });
  const parent = workflow("parent", async () => {
    const [left, right] = await parallel([call(a), call(b)]);
    await call(next);
    return { data: { values: [left.data.value, right.data.value] } };
  });
  const agent = createAgent({ workflows: [parent, a, b, next] });
  expect(await agent.execute({ workflow: parent, input: {} })).toMatchObject({
    status: "completed",
    data: { values: ["A", "B"] },
  });
});

for (const persistence of [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
]) {
  it(`preserves completed and waiting siblings and distinct answers across ${persistence} reconstruction`, async () => {
    const prefix = `parallel:${crypto.randomUUID()}:`;
    const memory = createInMemoryFrameworkAdapter();
    const adapter = () =>
      persistence === "memory"
        ? memory
        : createRedisFrameworkAdapter({
            url: process.env.KORTYX_TEST_REDIS_URL ?? "",
            prefix,
          });
    const done = vi.fn(() => ({ data: { value: "cached" } }));
    const a = workflow("a", done);
    const b = workflow("b", async () => ({
      data: {
        value: await useInterrupt({
          request: { kind: "text", question: "B?" },
        }),
      },
    }));
    const c = workflow("c", async () => ({
      data: {
        value: await useInterrupt({
          request: { kind: "text", question: "C?" },
        }),
      },
    }));
    const after = vi.fn();
    const parent = workflow("parent", async () => {
      const values = await parallel([call(a), call(b), call(c)]);
      after();
      return { data: { values: values.map((value) => value.data.value) } };
    });
    const makeAgent = () =>
      createAgent({
        workflows: [parent, a, b, c],
        frameworkAdapter: adapter(),
      });
    const first = stopped(
      await makeAgent().execute({ workflow: parent, input: {} }),
    );
    expect(first.interrupt.input.question).toBe("B?");
    expect(done).toHaveBeenCalledTimes(1);
    expect(after).not.toHaveBeenCalled();
    if (!first.checkpointId) throw new Error("Missing checkpoint");
    const fork = await makeAgent().fork(first.checkpointId, {
      newSessionId: `fork-${crypto.randomUUID()}`,
    });
    const forkRequest = fork.checkpoint.activePendingRequests[0];
    if (!forkRequest) throw new Error("Missing fork interrupt");
    const forkSecond = stopped(
      await makeAgent().resume({
        workflow: parent,
        resume: {
          token: forkRequest.token,
          requestId: forkRequest.requestId,
          sessionId: fork.sessionId,
          runId: forkRequest.runId,
        },
        response: { type: "text", text: "fork B" },
      }),
    );
    expect(
      await makeAgent().resume({
        workflow: parent,
        resume: forkSecond.resume,
        response: { type: "text", text: "fork C" },
      }),
    ).toMatchObject({
      status: "completed",
      data: { values: ["cached", "fork B", "fork C"] },
    });
    const second = stopped(
      await makeAgent().resume({
        workflow: parent,
        resume: first.resume,
        response: { type: "text", text: "answer B" },
      }),
    );
    expect(second.interrupt.input.question).toBe("C?");
    const result = await makeAgent().resume({
      workflow: parent,
      resume: second.resume,
      response: { type: "text", text: "answer C" },
    });
    expect(result).toMatchObject({
      status: "completed",
      data: { values: ["cached", "answer B", "answer C"] },
    });
    expect(done).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(2);
    await expect(
      makeAgent().resume({
        workflow: parent,
        resume: first.resume,
        response: { type: "text", text: "stale" },
      }),
    ).rejects.toThrow();
  });
}

it("retains terminal failures while a sibling waits, then exposes all outcomes for reconciliation", async () => {
  const failed = vi.fn(() => {
    throw new Error("task failed");
  });
  const a = workflow("a", failed);
  const b = workflow("b", async () => ({
    data: {
      value: await useInterrupt({ request: { kind: "text", question: "B?" } }),
    },
  }));
  const parent = workflow("parent", async () => {
    try {
      await parallel([call(a), call(b)]);
    } catch (error) {
      if (!(error instanceof ParallelError)) throw error;
      return {
        data: { outcomes: error.results.map((result) => result.status) },
      };
    }
    throw new Error("Expected failure");
  });
  const agent = createAgent({ workflows: [parent, a, b] });
  const first = stopped(await agent.execute({ workflow: parent, input: {} }));
  const result = await agent.resume({
    workflow: parent,
    resume: first.resume,
    response: { type: "text", text: "B" },
  });
  expect(result).toMatchObject({
    status: "completed",
    data: { outcomes: ["rejected", "fulfilled"] },
  });
  expect(failed).toHaveBeenCalledTimes(1);
});

it("cancels every running child and never starts dependent work", async () => {
  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  const cancelled: string[] = [];
  const child = (id: string) =>
    workflow(id, async () => {
      const signal = useAbortSignal();
      if (!signal) throw new Error("Missing root signal");
      signals.push(signal);
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            cancelled.push(id);
            reject(signal.reason);
          },
          { once: true },
        );
        if (signals.length === 2) controller.abort();
      });
      return {};
    });
  const a = child("a");
  const b = child("b");
  const after = vi.fn();
  const parent = workflow("parent", async () => {
    await parallel([call(a), call(b)]);
    after();
    return {};
  });
  const result = await createAgent({ workflows: [parent, a, b] }).execute({
    workflow: parent,
    input: {},
    abortSignal: controller.signal,
  });
  expect(result).toMatchObject({ status: "cancelled" });
  expect(cancelled.sort()).toEqual(["a", "b"]);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(after).not.toHaveBeenCalled();
});

it("shares node allowance without discarding a concurrently completed sibling", async () => {
  const aRun = vi.fn(() => ({ data: { value: "A" } }));
  const bRun = vi.fn(() => ({ data: { value: "B" } }));
  const a = workflow("a", aRun);
  const b = workflow("b", bRun);
  const parent = workflow("parent", async () => ({
    data: {
      values: (await parallel([call(a), call(b)])).map(
        (value) => value.data.value,
      ),
    },
  }));
  const agent = createAgent({
    workflows: [parent, a, b],
    limits: { maxNodeExecutions: 2 },
  });
  const first = stopped(await agent.execute({ workflow: parent, input: {} }));
  expect(first.limit).toEqual({
    limit: "maxNodeExecutions",
    maximum: 2,
    consumed: 2,
  });
  expect(aRun).toHaveBeenCalledTimes(1);
  expect(bRun).not.toHaveBeenCalled();
  expect(
    await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "select", ids: ["continue"] },
    }),
  ).toMatchObject({ status: "completed", data: { values: ["A", "B"] } });
  expect(aRun).toHaveBeenCalledTimes(1);
  expect(bRun).toHaveBeenCalledTimes(1);
});

for (const limit of ["maxModelPasses", "maxToolCalls"] as const) {
  it(`shares ${limit} and counts model usage once through continuation`, async () => {
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
    const child = (id: string) =>
      workflow(id, async () => {
        await useReason({
          id: "reason",
          model: { provider, modelId: "mock" },
          input: "go",
          stream: false,
          ...(limit === "maxToolCalls"
            ? {
                tools: [
                  { name: "tool", inputSchema: { type: "object" }, execute },
                ],
              }
            : {}),
        });
        return { data: { value: id } };
      });
    const a = child("a");
    const b = child("b");
    const parent = workflow("parent", async () => ({
      data: {
        values: (await parallel([call(a), call(b)])).map(
          (value) => value.data.value,
        ),
      },
    }));
    const agent = createAgent({
      workflows: [parent, a, b],
      limits: { [limit]: 1 },
    });
    const first = stopped(await agent.execute({ workflow: parent, input: {} }));
    expect(first.limit).toEqual({ limit, maximum: 1, consumed: 1 });
    expect(limit === "maxModelPasses" ? invoke : execute).toHaveBeenCalledTimes(
      1,
    );
    const result = await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "select", ids: ["continue"] },
    });
    expect(result).toMatchObject({
      status: "completed",
      data: { values: ["a", "b"] },
      usage: { total: limit === "maxModelPasses" ? 10 : 20 },
    });
    expect(invoke).toHaveBeenCalledTimes(limit === "maxModelPasses" ? 2 : 4);
    if (limit === "maxToolCalls") expect(execute).toHaveBeenCalledTimes(2);
  });
}

it("preserves nested parallel journals, later parent questions and trace identities", async () => {
  const events: KortyxTelemetryEvent[] = [];
  const cached = vi.fn(() => ({ data: { value: "cached" } }));
  const a = workflow("a", cached);
  const b = workflow("b", async () => ({
    data: {
      value: await useInterrupt({ request: { kind: "text", question: "B?" } }),
    },
  }));
  const c = workflow("c", () => ({ data: { value: "C" } }));
  const nested = workflow("nested", async () => ({
    data: {
      values: (await parallel([call(a), call(b)])).map(
        (value) => value.data.value,
      ),
    },
  }));
  const parent = workflow("parent", async () => {
    const [child] = await parallel([call(nested), call(c)]);
    const approval = await useInterrupt({
      request: { kind: "text", question: "Parent?" },
    });
    return { data: { ...child.data, approval } };
  });
  const agent = createAgent({
    workflows: [parent, nested, a, b, c],
    telemetry: {
      environment: "test",
      service: { name: "parallel-test" },
      reporter: {
        ensureWorkflowTopology: async () => ({
          workflowRevisionId: "revision",
          created: false,
        }),
        emit: async (batch: KortyxTelemetryEvent[]) => {
          events.push(...batch);
        },
      },
    },
  });
  const first = stopped(await agent.execute({ workflow: parent, input: {} }));
  expect(first.interrupt.input.question).toBe("B?");
  const second = stopped(
    await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "text", text: "B" },
    }),
  );
  expect(second.interrupt.input.question).toBe("Parent?");
  expect(
    await agent.resume({
      workflow: parent,
      resume: second.resume,
      response: { type: "text", text: "yes" },
    }),
  ).toMatchObject({
    status: "completed",
    data: { values: ["cached", "B"], approval: "yes" },
  });
  expect(cached).toHaveBeenCalledTimes(1);
  const calls = events.filter((event) =>
    event.type.startsWith("workflow.call."),
  );
  const nestedStart = calls.find(
    (event) =>
      event.type === "workflow.call.started" &&
      event.payload.targetWorkflowId === "nested",
  );
  if (!nestedStart) throw new Error("Missing nested call telemetry");
  for (const id of ["a", "b"]) {
    const childEvents = calls.filter(
      (event) => event.payload.targetWorkflowId === id,
    );
    expect(
      new Set(childEvents.map((event) => event.payload.invocationId)).size,
    ).toBe(1);
    expect(
      childEvents.every(
        (event) =>
          event.payload.parentInvocationId === nestedStart.payload.invocationId,
      ),
    ).toBe(true);
  }
  expect(
    calls.some(
      (event) =>
        event.type === "workflow.call.reused" &&
        event.payload.targetWorkflowId === "c",
    ),
  ).toBe(true);
});

it("does not let caught suspension start a dependent child or commit fallback", async () => {
  const a = workflow("a", async () => {
    await useInterrupt({ request: { kind: "text", question: "A?" } });
    return {};
  });
  const b = workflow("b", () => ({}));
  const nextRun = vi.fn(() => ({}));
  const next = workflow("next", nextRun);
  const parent = workflow("parent", async () => {
    try {
      await parallel([call(a), call(b)]);
    } catch {}
    try {
      await call(next);
    } catch {}
    return { data: { fallback: true } };
  });
  const agent = createAgent({ workflows: [parent, a, b, next] });
  stopped(await agent.execute({ workflow: parent, input: {} }));
  expect(nextRun).not.toHaveBeenCalled();
});

it("shares child admission allowance and restores completed siblings after Continue", async () => {
  const aRun = vi.fn(() => ({ data: { value: "A" } }));
  const bRun = vi.fn(() => ({ data: { value: "B" } }));
  const a = workflow("a", aRun);
  const b = workflow("b", bRun);
  const parent = workflow("parent", async () => ({
    data: {
      values: (await parallel([call(a), call(b)])).map(
        (value) => value.data.value,
      ),
    },
  }));
  const agent = createAgent({
    workflows: [parent, a, b],
    limits: { maxChildInvocations: 1 },
  });
  const first = stopped(await agent.execute({ workflow: parent, input: {} }));
  expect(first.reason).toBe("limit_reached");
  const result = await agent.resume({
    workflow: parent,
    resume: first.resume,
    response: { type: "select", ids: ["continue"] },
  });
  expect(result).toMatchObject({
    status: "completed",
    data: { values: ["A", "B"] },
  });
  expect(aRun).toHaveBeenCalledTimes(1);
  expect(bRun).toHaveBeenCalledTimes(1);
});

it("retains usage from a failed sibling without charging it again after a later parent pause", async () => {
  const invoke = vi.fn(async () => ({
    content: "done",
    usage: { input: 2, output: 3, total: 5 },
  }));
  const provider = {
    id: "mock",
    models: ["mock"],
    getModel: () => ({ invoke, stream: async function* () {} }),
  };
  const child = (id: string, fail: boolean) =>
    workflow(id, async () => {
      await useReason({
        id: "model",
        model: { provider, modelId: "mock" },
        input: "go",
        stream: false,
      });
      if (fail) throw new Error("Failed after model work");
      return {};
    });
  const a = child("a", true);
  const b = child("b", false);
  const parent = workflow("parent", async () => {
    try {
      await parallel([call(a), call(b)]);
    } catch (error) {
      if (!(error instanceof ParallelError)) throw error;
    }
    await useInterrupt({ request: { kind: "text", question: "Parent?" } });
    return {};
  });
  const agent = createAgent({ workflows: [parent, a, b] });
  const first = stopped(await agent.execute({ workflow: parent, input: {} }));
  expect(first.usage?.total).toBe(10);
  expect(
    await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "text", text: "yes" },
    }),
  ).toMatchObject({ status: "completed", usage: { total: 10 } });
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("supports async custom hooks and successive groups without replaying earlier work", async () => {
  const run = vi.fn(() => ({ data: { value: "A" } }));
  const a = workflow("a", run);
  const b = workflow("b", async () => ({
    data: {
      value: await useInterrupt({ request: { kind: "text", question: "B?" } }),
    },
  }));
  const wrapped = async (child: ReturnType<typeof workflow>) => {
    await Promise.resolve();
    return call(child);
  };
  const parent = workflow("parent", async () => {
    await parallel([wrapped(a)]);
    const [result] = await parallel([wrapped(b)]);
    return { data: result.data };
  });
  const agent = createAgent({ workflows: [parent, a, b] });
  const first = stopped(await agent.execute({ workflow: parent, input: {} }));
  expect(
    await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "text", text: "B" },
    }),
  ).toMatchObject({ status: "completed", data: { value: "B" } });
  expect(run).toHaveBeenCalledTimes(1);
});

it("preserves waiting children when a sibling exhausts its model allowance", async () => {
  const invoke = vi.fn(async () => ({ content: "done" }));
  const provider = {
    id: "mock",
    models: ["mock"],
    getModel: () => ({ invoke, stream: async function* () {} }),
  };
  const ask = workflow("ask", async () => ({
    data: {
      answer: await useInterrupt({
        request: { kind: "text", question: "Answer?" },
      }),
    },
  }));
  const runModel = async () => {
    await useReason({
      id: "reason",
      model: { provider, modelId: "mock" },
      input: "go",
      stream: false,
    });
    return {};
  };
  const model = defineWorkflow({
    ...workflow("model", runModel),
    nodes: { first: { run: runModel }, second: { run: runModel } },
    edges: [
      ["__start__", "first"],
      ["first", "second"],
      ["second", "__end__"],
    ],
  });
  const parent = workflow("parent", async () => ({
    data: (await parallel([call(ask), call(model)]))[0].data,
  }));
  const agent = createAgent({
    workflows: [parent, ask, model],
    limits: { maxModelPasses: 1 },
  });
  const first = stopped(await agent.execute({ workflow: parent, input: {} }));
  expect(first.reason).toBe("limit_reached");
  const second = stopped(
    await agent.resume({
      workflow: parent,
      resume: first.resume,
      response: { type: "select", ids: ["continue"] },
    }),
  );
  expect(second.interrupt.input.question).toBe("Answer?");
  expect(
    await agent.resume({
      workflow: parent,
      resume: second.resume,
      response: { type: "text", text: "yes" },
    }),
  ).toMatchObject({ status: "completed", data: { answer: "yes" } });
  expect(invoke).toHaveBeenCalledTimes(2);
});
