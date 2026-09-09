// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx server hooks support conditional calls and error recovery.
import {
  defineWorkflow,
  type NodeFn,
  type WorkflowDefinition,
} from "@kortyx/core";
import {
  createWorkflowHooks,
  useInterrupt,
  useNodeState,
  useReason,
  useRuntimeContext,
  useStructuredData,
  useWorkflow,
  useWorkflowState,
} from "@kortyx/hooks";
import {
  createInMemoryFrameworkAdapter,
  createRedisFrameworkAdapter,
} from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";

async function collect(stream: Promise<AsyncIterable<StreamChunk>>) {
  const chunks: StreamChunk[] = [];
  for await (const chunk of await stream) chunks.push(chunk);
  return chunks;
}
const start = (agent: ReturnType<typeof createAgent>, sessionId = "session") =>
  collect(agent.streamChat([{ role: "user", content: "test" }], { sessionId }));
const resume = (
  agent: ReturnType<typeof createAgent>,
  chunks: StreamChunk[],
  selected: string,
  sessionId = "session",
) => {
  const pending = [...chunks].reverse().find((c) => c.type === "interrupt");
  if (!pending || pending.type !== "interrupt")
    throw new Error(`No interrupt: ${JSON.stringify(chunks)}`);
  return collect(
    agent.streamChat(
      [
        {
          role: "user",
          content: selected,
          metadata: {
            resume: {
              token: pending.resumeToken,
              requestId: pending.requestId,
              selected,
            },
          },
        },
      ],
      { sessionId },
    ),
  );
};
const data = (chunks: StreamChunk[]) => {
  const errors = chunks.filter((c) => c.type === "error");
  expect(errors).toEqual([]);
  const done = [...chunks].reverse().find((c) => c.type === "done") as {
    data?: { data?: Record<string, unknown> };
  };
  return done?.data?.data;
};

describe("child workflow hooks", () => {
  it("returns typed child output then continues the parent", async () => {
    const child = defineWorkflow({
      id: "child",
      version: "1",
      inputSchema: z.object({ topic: z.string() }),
      outputSchema: z.object({ summary: z.string() }),
      nodes: {
        summarize: {
          run: ({ input }: { input: { topic: string } }) => ({
            data: { summary: input.topic.toUpperCase() },
          }),
        },
      },
      edges: [
        ["__start__", "summarize"],
        ["summarize", "__end__"],
      ],
    });
    const { useWorkflow: call } = createWorkflowHooks({ child });
    const parent = defineWorkflow({
      id: "parent",
      version: "1",
      nodes: {
        call: {
          run: async () => ({
            data: (
              await call({
                id: "research",
                workflow: "child",
                input: { topic: "test" },
              })
            ).data,
          }),
        },
        after: {
          run: ({ input }: { input: { summary: string } }) => ({
            data: { final: `${input.summary}!` },
          }),
        },
      },
      edges: [
        ["__start__", "call"],
        ["call", "after"],
        ["after", "__end__"],
      ],
    });
    const agent = createAgent({
      workflows: [parent, child],
      defaultWorkflowId: "parent",
    });
    const chunks = await start(agent);
    expect(data(chunks)).toMatchObject({ summary: "TEST", final: "TEST!" });
    expect(chunks.filter((c) => c.type === "done")).toHaveLength(1);
  });

  it("resumes a child twice without repeating completed child nodes", async () => {
    let before = 0;
    let after = 0;
    const child = defineWorkflow({
      id: "child",
      version: "1",
      inputSchema: z.object({}),
      outputSchema: z.object({ first: z.string(), second: z.string() }),
      nodes: {
        before: {
          run: () => {
            before++;
            return { data: { started: true } };
          },
        },
        ask: {
          run: async () => {
            const first = await useInterrupt({
              id: "first",
              request: { kind: "text", question: "First?" },
            });
            const second = await useInterrupt({
              id: "second",
              request: { kind: "text", question: "Second?" },
            });
            return { data: { first, second } };
          },
        },
      },
      edges: [
        ["__start__", "before"],
        ["before", "ask"],
        ["ask", "__end__"],
      ],
    });
    const parent = defineWorkflow({
      id: "parent",
      version: "1",
      nodes: {
        call: {
          run: async () => {
            const result = await useWorkflow({
              id: "child",
              workflow: child,
              input: {},
            });
            after++;
            return { data: result.data };
          },
        },
      },
      edges: [
        ["__start__", "call"],
        ["call", "__end__"],
      ],
    });
    const adapter = createInMemoryFrameworkAdapter();
    const makeAgent = () =>
      createAgent({
        workflows: [parent, child],
        defaultWorkflowId: "parent",
        frameworkAdapter: adapter,
      });
    const first = await start(makeAgent());
    expect(first.some((c) => c.type === "interrupt")).toBe(true);
    expect(after).toBe(0);
    const second = await resume(makeAgent(), first, "one");
    const final = await resume(makeAgent(), second, "two");
    expect(data(final)).toMatchObject({ first: "one", second: "two" });
    expect(before).toBe(1);
    expect(after).toBe(1);
  });
});

const forkInterrupt = (
  fork: Awaited<ReturnType<ReturnType<typeof createAgent>["fork"]>>,
) => {
  const request = fork.checkpoint.activePendingRequests[0]!;
  return [
    {
      type: "interrupt",
      resumeToken: request.token,
      requestId: request.requestId,
    },
  ] as StreamChunk[];
};

for (const persistence of [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
]) {
  describe(`nested calls with ${persistence} persistence`, () => {
    it("forks an interrupted grandchild independently, rolls back, and replays cached siblings", async () => {
      const sessionId = `nested-${persistence}-${Date.now()}`;
      let siblingRuns = 0;
      let grandchildBefore = 0;
      const sibling = defineWorkflow({
        id: "sibling",
        version: "1",
        inputSchema: z.object({}),
        outputSchema: z.object({ marker: z.string() }),
        nodes: {
          run: {
            run: () => {
              siblingRuns++;
              return { data: { marker: "cached" } };
            },
          },
        },
        edges: [
          ["__start__", "run"],
          ["run", "__end__"],
        ],
      });
      const grandchild = defineWorkflow({
        id: "grandchild",
        version: "1",
        inputSchema: z.object({}),
        outputSchema: z.object({ answer: z.string() }),
        nodes: {
          before: {
            run: () => {
              grandchildBefore++;
              return {};
            },
          },
          ask: {
            run: async () => ({
              data: {
                answer: await useInterrupt({
                  id: "answer",
                  request: { kind: "text", question: "Answer?" },
                }),
              },
            }),
          },
        },
        edges: [
          ["__start__", "before"],
          ["before", "ask"],
          ["ask", "__end__"],
        ],
      });
      const child = defineWorkflow({
        id: "child",
        version: "1",
        inputSchema: z.object({}),
        outputSchema: z.object({ answer: z.string() }),
        nodes: {
          call: {
            run: async () => ({
              data: (
                await useWorkflow({
                  id: "grandchild",
                  workflow: grandchild,
                  input: {},
                })
              ).data,
            }),
          },
        },
        edges: [
          ["__start__", "call"],
          ["call", "__end__"],
        ],
      });
      const parent = defineWorkflow({
        id: "parent",
        version: "1",
        nodes: {
          call: {
            run: async () => {
              const first = await useWorkflow({
                id: "sibling",
                workflow: sibling,
                input: {},
              });
              const second = await useWorkflow({
                id: "child",
                workflow: child,
                input: {},
              });
              const approval = await useInterrupt({
                id: "parent-approval",
                request: { kind: "text", question: "Approve?" },
              });
              return { data: { ...first.data, ...second.data, approval } };
            },
          },
        },
        edges: [
          ["__start__", "call"],
          ["call", "__end__"],
        ],
      });
      const memory = createInMemoryFrameworkAdapter();
      const makeAdapter = () =>
        persistence === "memory"
          ? memory
          : createRedisFrameworkAdapter({
              url: process.env.KORTYX_TEST_REDIS_URL!,
              prefix: `child-test:${sessionId}:`,
            });
      const makeAgent = () =>
        createAgent({
          workflows: [parent, child, grandchild, sibling],
          defaultWorkflowId: "parent",
          frameworkAdapter: makeAdapter(),
        });
      const first = await start(makeAgent(), sessionId);
      const checkpoint = [...first]
        .reverse()
        .find((c) => c.type === "checkpoint") as { id: string };
      const branch = await makeAgent().fork(checkpoint.id, {
        newSessionId: `${sessionId}-fork`,
      });
      const branchPause = await resume(
        makeAgent(),
        forkInterrupt(branch),
        "fork answer",
        branch.sessionId,
      );
      const branchFinal = await resume(
        makeAgent(),
        branchPause,
        "fork approved",
        branch.sessionId,
      );
      expect(data(branchFinal)).toMatchObject({
        marker: "cached",
        answer: "fork answer",
        approval: "fork approved",
      });
      const sourcePause = await resume(
        makeAgent(),
        first,
        "source answer",
        sessionId,
      );
      const sourceFinal = await resume(
        makeAgent(),
        sourcePause,
        "source approved",
        sessionId,
      );
      expect(data(sourceFinal)).toMatchObject({
        answer: "source answer",
        approval: "source approved",
      });
      await makeAgent().rollbackTo(checkpoint.id);
      const rollbackPause = await resume(
        makeAgent(),
        first,
        "edited answer",
        sessionId,
      );
      const rollbackFinal = await resume(
        makeAgent(),
        rollbackPause,
        "edited approved",
        sessionId,
      );
      expect(data(rollbackFinal)).toMatchObject({
        answer: "edited answer",
        approval: "edited approved",
      });
      expect(siblingRuns).toBe(1);
      expect(grandchildBefore).toBe(1);
    });
  });
}

function caller(
  run: NodeFn,
  children: WorkflowDefinition[],
  adapter = createInMemoryFrameworkAdapter(),
) {
  return createAgent({
    defaultWorkflowId: "parent",
    frameworkAdapter: adapter,
    workflows: [
      defineWorkflow({
        id: "parent",
        version: "1",
        nodes: { run: { run } },
        edges: [
          ["__start__", "run"],
          ["run", "__end__"],
        ],
      }),
      ...children,
    ],
  });
}
function simpleChild(run: NodeFn) {
  return defineWorkflow({
    id: "child",
    version: "1",
    inputSchema: z.object({}),
    outputSchema: z.object({ answer: z.string() }),
    nodes: { run: { run } },
    edges: [
      ["__start__", "run"],
      ["run", "__end__"],
    ],
  });
}

describe("call safety", () => {
  it("resumes a reasoning interrupt and counts child usage once across a later parent pause", async () => {
    const responses = [
      {
        content: JSON.stringify({
          interruptRequest: { kind: "text", question: "Topic?" },
          output: { answer: "Draft" },
          draftText: "Draft",
        }),
        usage: { input: 2, output: 3, total: 5 },
      },
      {
        content: JSON.stringify({ answer: "Finished" }),
        usage: { input: 4, output: 6, total: 10 },
      },
    ];
    const invoke = vi.fn(async () => {
      const response = responses.shift();
      if (!response) throw new Error("Unexpected model call during replay");
      return response;
    });
    const modelRef = {
      modelId: "mock",
      provider: {
        id: "mock",
        models: ["mock"],
        getModel: () => ({ invoke, stream: async function* () {} }),
      },
    };
    const child = simpleChild(async () => {
      const result = await useReason({
        id: "reason",
        model: modelRef,
        input: "Research",
        outputSchema: z.object({ answer: z.string() }),
        interrupt: {
          requestSchema: z.object({
            kind: z.literal("text"),
            question: z.string(),
          }),
          responseSchema: z.string(),
        },
      });
      return { data: result.output };
    });
    const agent = caller(async () => {
      const result = await useWorkflow({
        id: "research",
        workflow: child,
        input: {},
      });
      await useInterrupt({
        request: { kind: "text", question: "Parent approval?" },
      });
      return { data: result.data };
    }, [child]);
    const first = await start(agent);
    const second = await resume(agent, first, "Topic");
    const final = await resume(agent, second, "Approve");
    expect(data(final)).toMatchObject({ answer: "Finished" });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect([...final].reverse().find((c) => c.type === "done")).toMatchObject({
      data: { runtime: { tokenUsage: { input: 6, output: 9, total: 15 } } },
    });
  });

  it("does not repeat completed children when their parent node retries", async () => {
    let runs = 0;
    let attempts = 0;
    const child = simpleChild(() => {
      runs++;
      return { data: { answer: "done" } };
    });
    const parent = defineWorkflow({
      id: "parent",
      version: "1",
      nodes: {
        run: {
          behavior: { retry: { maxAttempts: 2 } },
          run: async () => {
            const result = await useWorkflow({
              id: "call",
              workflow: child,
              input: {},
            });
            if (++attempts === 1) throw new Error("Retry parent");
            return { data: result.data };
          },
        },
      },
      edges: [
        ["__start__", "run"],
        ["run", "__end__"],
      ],
    });
    expect(
      data(
        await start(
          createAgent({
            workflows: [parent, child],
            defaultWorkflowId: "parent",
          }),
        ),
      ),
    ).toMatchObject({ answer: "done" });
    expect(runs).toBe(1);
    expect(attempts).toBe(2);
  });

  it("preserves invocation context when the resume request supplies changed context", async () => {
    const child = simpleChild(async () => {
      await useInterrupt({ request: { kind: "text", question: "Continue?" } });
      return { data: { answer: useRuntimeContext<{ topic: string }>().topic } };
    });
    const agent = caller(async () => {
      const input = useRuntimeContext<{ topic: string }>();
      return {
        data: (await useWorkflow({ id: "call", workflow: "child", input }))
          .data,
      };
    }, [child]);
    const first = await collect(
      agent.streamChat([{ role: "user", content: "start" }], {
        sessionId: "context",
        context: { topic: "original" },
      }),
    );
    const pending = first.find((c) => c.type === "interrupt");
    if (!pending) throw new Error("Expected interrupt");
    const final = await collect(
      agent.streamChat(
        [
          {
            role: "user",
            content: "yes",
            metadata: {
              resume: {
                token: pending.resumeToken,
                requestId: pending.requestId,
                selected: "yes",
              },
            },
          },
        ],
        { sessionId: "context", context: { topic: "changed" } },
      ),
    );
    expect(data(final)).toMatchObject({ answer: "original" });
  });

  it("rejects changed contracts, missing registration, and unsupported parallel children", async () => {
    const child = simpleChild(() => ({ data: { answer: "done" } }));
    const changed = { ...child, version: "2" };
    for (const [target, children, message] of [
      [changed, [child], "contract does not match"],
      [child, [], "not registered"],
      [
        { ...child, edges: [...child.edges, ["__start__", "run"]] },
        [],
        "parallel edges",
      ],
    ] satisfies Array<[typeof child, WorkflowDefinition[], string]>) {
      const registered =
        message === "parallel edges"
          ? [target as WorkflowDefinition]
          : [...children];
      const agent = caller(
        async () => ({
          data: (
            await useWorkflow({
              id: "call",
              workflow: target as typeof child,
              input: {},
            })
          ).data,
        }),
        registered,
      );
      expect(
        (await start(agent)).some(
          (c) => c.type === "error" && c.message.includes(message),
        ),
      ).toBe(true);
    }
  });

  it("replays completed calls with interrupts in the correct parent order", async () => {
    let children = 0;
    const child = simpleChild(async () => {
      const answer = await useInterrupt({
        request: { kind: "text", question: "Child?" },
      });
      children++;
      return { data: { answer } };
    });
    const agent = caller(async () => {
      const a = await useWorkflow({ id: "a", workflow: child, input: {} });
      const b = await useWorkflow({ id: "b", workflow: child, input: {} });
      const parent = await useInterrupt({
        request: { kind: "text", question: "Parent?" },
      });
      return { data: { a: a.data.answer, b: b.data.answer, parent } };
    }, [child]);
    let chunks = await start(agent);
    chunks = await resume(agent, chunks, "A");
    chunks = await resume(agent, chunks, "B");
    chunks = await resume(agent, chunks, "P");
    expect(data(chunks)).toMatchObject({ a: "A", b: "B", parent: "P" });
    expect(children).toBe(2);
  });

  it("keeps parent and sibling workflow state isolated", async () => {
    const child = simpleChild(() => {
      const [value, set] = useWorkflowState("value", "fresh");
      set("changed");
      return { data: { answer: value } };
    });
    const agent = caller(async () => {
      const [, set] = useWorkflowState("value", "parent");
      set("parent");
      const a = await useWorkflow({ id: "a", workflow: child, input: {} });
      const b = await useWorkflow({ id: "b", workflow: child, input: {} });
      const [parent] = useWorkflowState("value");
      return { data: { a: a.data.answer, b: b.data.answer, parent } };
    }, [child]);
    expect(data(await start(agent))).toMatchObject({
      a: "fresh",
      b: "fresh",
      parent: "parent",
    });
  });

  it("preserves child node state and the parent state on resume", async () => {
    let preparations = 0;
    const child = simpleChild(async () => {
      const [prepared, setPrepared] = useNodeState(false);
      if (!prepared) {
        preparations++;
        setPrepared(true);
      }
      const answer = await useInterrupt({
        request: { kind: "text", question: "Continue?" },
      });
      return { data: { answer } };
    });
    const agent = caller(async () => {
      const [saved, set] = useNodeState("parent");
      set(saved);
      const result = await useWorkflow({ id: "a", workflow: child, input: {} });
      return { data: { ...result.data, saved } };
    }, [child]);
    expect(data(await resume(agent, await start(agent), "yes"))).toMatchObject({
      answer: "yes",
      saved: "parent",
    });
    expect(preparations).toBe(1);
  });

  it("does not let a caught suspension commit a fallback", async () => {
    const child = simpleChild(async () => ({
      data: {
        answer: await useInterrupt({
          request: { kind: "text", question: "Continue?" },
        }),
      },
    }));
    const agent = caller(async () => {
      try {
        return {
          data: (await useWorkflow({ id: "a", workflow: child, input: {} }))
            .data,
        };
      } catch {
        return { data: { answer: "fallback" } };
      }
    }, [child]);
    const first = await start(agent);
    expect(data(first)?.answer).toBeUndefined();
    expect(data(await resume(agent, first, "real answer"))).toMatchObject({
      answer: "real answer",
    });
  });

  it("caches caught failures across later parent interrupts", async () => {
    let attempts = 0;
    const child = simpleChild(() => {
      attempts++;
      throw new Error("failure");
    });
    const agent = caller(async () => {
      let failure = "";
      try {
        await useWorkflow({ id: "a", workflow: child, input: {} });
      } catch (e) {
        failure = String(e);
      }
      await useInterrupt({ request: { kind: "text", question: "Continue?" } });
      return { data: { failure } };
    }, [child]);
    expect(
      data(await resume(agent, await start(agent), "yes"))?.failure,
    ).toContain("failure");
    expect(attempts).toBe(1);
  });

  it("validates actual input/output contracts and applies transforms once", async () => {
    const child = defineWorkflow({
      id: "child",
      version: "1",
      inputSchema: z.object({ count: z.number().transform((n) => n + 1) }),
      outputSchema: z.object({ answer: z.number().transform((n) => n + 10) }),
      nodes: {
        run: {
          run: ({ input }: { input: { count: number } }) => ({
            data: { answer: input.count },
          }),
        },
      },
      edges: [
        ["__start__", "run"],
        ["run", "__end__"],
      ],
    });
    const agent = caller(
      async () => ({
        data: (
          await useWorkflow({ id: "a", workflow: child, input: { count: 1 } })
        ).data,
      }),
      [child],
    );
    expect(data(await start(agent))).toMatchObject({ answer: 12 });
    const invalid = caller(
      async () => ({
        data: (
          await useWorkflow({
            id: "a",
            workflow: "child",
            input: { count: "bad" },
          })
        ).data,
      }),
      [child],
    );
    expect((await start(invalid)).some((c) => c.type === "error")).toBe(true);
    const badOutput = simpleChild(() => ({ data: { answer: 123 } }));
    expect(
      (
        await start(
          caller(
            async () => ({
              data: (
                await useWorkflow({ id: "a", workflow: badOutput, input: {} })
              ).data,
            }),
            [badOutput],
          ),
        )
      ).some((c) => c.type === "error"),
    ).toBe(true);
  });

  it("rejects duplicate ids and changed replay inputs", async () => {
    const child = simpleChild(async () => ({
      data: {
        answer: await useInterrupt({
          request: { kind: "text", question: "Continue?" },
        }),
      },
    }));
    let input = {};
    const agent = caller(
      async () => ({
        data: (await useWorkflow({ id: "a", workflow: child, input })).data,
      }),
      [child],
    );
    const first = await start(agent);
    input = { changed: true };
    expect(
      (await resume(agent, first, "yes")).some(
        (c) =>
          c.type === "error" && c.message.includes("changed during replay"),
      ),
    ).toBe(true);
    const complete = simpleChild(() => ({ data: { answer: "yes" } }));
    const duplicate = caller(async () => {
      await useWorkflow({ id: "a", workflow: complete, input: {} });
      await useWorkflow({ id: "a", workflow: complete, input: {} });
      return {};
    }, [complete]);
    expect(
      (await start(duplicate)).some(
        (c) => c.type === "error" && c.message.includes("Duplicate"),
      ),
    ).toBe(true);
  });

  it("scopes structured stream ids to each child invocation", async () => {
    const child = simpleChild(() => {
      useStructuredData({
        kind: "final",
        dataType: "answer",
        streamId: "fixed",
        data: { answer: "yes" },
      });
      return { data: { answer: "yes" } };
    });
    const agent = caller(async () => {
      await useWorkflow({ id: "a", workflow: child, input: {} });
      await useWorkflow({ id: "b", workflow: child, input: {} });
      return {};
    }, [child]);
    const chunks = await start(agent);
    const streams = chunks
      .filter((c) => c.type === "structured-data")
      .map((c) => c.streamId);
    expect(streams).toHaveLength(2);
    expect(new Set(streams).size).toBe(2);
  });
});

for (const kind of [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
]) {
  it(`claims a child resume once and rejects cancelled/stale tokens (${kind})`, async () => {
    let completions = 0;
    const child = simpleChild(async () => {
      const answer = await useInterrupt({
        request: { kind: "text", question: "Continue?" },
      });
      completions++;
      return { data: { answer } };
    });
    const adapter =
      kind === "memory"
        ? createInMemoryFrameworkAdapter()
        : createRedisFrameworkAdapter({
            url: process.env.KORTYX_TEST_REDIS_URL!,
            prefix: `atomic:${Date.now()}:`,
          });
    const agent = caller(
      async () => ({
        data: (await useWorkflow({ id: "a", workflow: child, input: {} })).data,
      }),
      [child],
      adapter,
    );
    const first = await start(agent);
    const attempts = await Promise.allSettled([
      resume(agent, first, "one"),
      resume(agent, first, "two"),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(completions).toBe(1);
    await expect(resume(agent, first, "stale")).rejects.toThrow("Interrupt");
    const second = await start(agent, "cancel-session");
    const interrupt = second.find((c) => c.type === "interrupt")!;
    await expect(resume(agent, second, "wrong session")).rejects.toThrow(
      "another session",
    );
    const cancelled = await collect(
      agent.streamChat(
        [
          {
            role: "user",
            content: "cancel",
            metadata: {
              resume: {
                token: interrupt.resumeToken,
                requestId: interrupt.requestId,
                cancel: true,
              },
            },
          },
        ],
        { sessionId: "cancel-session" },
      ),
    );
    expect(cancelled).toEqual([{ type: "done" }]);
    await expect(
      resume(agent, second, "late", "cancel-session"),
    ).rejects.toThrow("Interrupt");
    expect(completions).toBe(1);
  });
}

it("starts a fresh child on a self-loop activation and preserves runtime context", async () => {
  let children = 0;
  const child = simpleChild(() => {
    children++;
    const context = useRuntimeContext<{ tenant: string }>();
    return { data: { answer: context.tenant } };
  });
  const parent = defineWorkflow({
    id: "parent",
    version: "1",
    nodes: {
      loop: {
        run: async ({ input }: { input: { count?: number } }) => {
          const result = await useWorkflow({
            id: "a",
            workflow: child,
            input: {},
          });
          const count = (input.count ?? 0) + 1;
          return {
            data: { count, answer: result.data.answer },
            condition: count < 2 ? "again" : "stop",
          };
        },
      },
    },
    edges: [
      ["__start__", "loop"],
      ["loop", "loop", { when: "again" }],
      ["loop", "__end__", { when: "stop" }],
    ],
  });
  const agent = createAgent({
    workflows: [parent, child],
    defaultWorkflowId: "parent",
  });
  const chunks = await collect(
    agent.streamChat([{ role: "user", content: "start" }], {
      sessionId: "loop",
      context: { tenant: "tenant" },
    }),
  );
  expect(data(chunks)).toMatchObject({ count: 2, answer: "tenant" });
  expect(children).toBe(2);
});
