// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import { defineWorkflow, type WorkflowDefinition } from "@kortyx/core";
import { useInterrupt, useWorkflow } from "@kortyx/hooks";
import { createInMemoryFrameworkAdapter } from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";

const closingSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("offer"),
    question: z.string(),
    subject: z.string(),
  }),
  z.strictObject({ kind: z.literal("none"), reason: z.string() }),
]);
const offer = closingSchema.parse({
  kind: "offer",
  question: "Proceed?",
  subject: "job",
});
const none = closingSchema.parse({
  kind: "none",
  reason: "intermediate_answer",
});
const workflow = (
  id: string,
  nodes: WorkflowDefinition["nodes"],
  edges: WorkflowDefinition["edges"],
) =>
  defineWorkflow({
    id,
    version: "1",
    inputSchema: z.string(),
    outputSchema: z.object({ closing: closingSchema }),
    reduce: { closing: (_previous, next) => next },
    nodes,
    edges,
  });
const collect = async (stream: Promise<AsyncIterable<StreamChunk>>) => {
  const chunks: StreamChunk[] = [];
  for await (const chunk of await stream) chunks.push(chunk);
  expect(chunks.filter((chunk) => chunk.type === "error")).toEqual([]);
  return chunks;
};

describe("opt-in workflow data reducers", () => {
  it("replaces a strict union across nodes, including the next node's input", async () => {
    const root = workflow(
      "sequential",
      {
        offer: { run: () => ({ data: { closing: offer } }) },
        none: { run: () => ({ data: { closing: none } }) },
        read: {
          run: ({ input }: { input: { closing: unknown } }) => {
            expect(input.closing).toEqual(none);
            return {};
          },
        },
      },
      [
        ["__start__", "offer"],
        ["offer", "none"],
        ["none", "read"],
        ["read", "__end__"],
      ],
    );
    expect(
      await createAgent({ workflows: [root] }).execute({
        workflow: root,
        input: "start",
      }),
    ).toMatchObject({ status: "completed", data: { closing: none } });
  });

  it("keeps deep merge, array overwrite, scalar and null behavior without reducers", async () => {
    const root = defineWorkflow({
      id: "values",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.strictObject({
        profile: z.strictObject({
          name: z.literal("Ada"),
          city: z.literal("Madrid"),
        }),
        items: z.tuple([z.literal("new")]),
        scalar: z.literal(2),
        nullable: z.null(),
        untouched: z.literal(true),
      }),
      nodes: {
        before: {
          run: () => ({
            data: {
              profile: { name: "Ada", city: "London" },
              items: ["old"],
              scalar: 1,
              nullable: { old: true },
              untouched: true,
            },
          }),
        },
        after: {
          run: () => ({
            data: {
              profile: { city: "Madrid" },
              items: ["new"],
              scalar: 2,
              nullable: null,
            },
          }),
        },
      },
      edges: [
        ["__start__", "before"],
        ["before", "after"],
        ["after", "__end__"],
      ],
    });
    expect(
      await createAgent({ workflows: [root] }).execute({
        workflow: root,
        input: "start",
      }),
    ).toMatchObject({
      status: "completed",
      data: {
        profile: { name: "Ada", city: "Madrid" },
        items: ["new"],
        scalar: 2,
        nullable: null,
        untouched: true,
      },
    });
  });

  it("lets a node explicitly preserve nested values from its input", async () => {
    const root = defineWorkflow({
      id: "explicit-merge",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.strictObject({
        profile: z.strictObject({ name: z.string(), city: z.string() }),
      }),
      nodes: {
        before: {
          run: () => ({ data: { profile: { name: "Ada", city: "London" } } }),
        },
        after: {
          run: ({
            input,
          }: {
            input: { profile: { name: string; city: string } };
          }) => ({ data: { profile: { ...input.profile, city: "Madrid" } } }),
        },
      },
      edges: [
        ["__start__", "before"],
        ["before", "after"],
        ["after", "__end__"],
      ],
    });
    expect(
      await createAgent({ workflows: [root] }).execute({
        workflow: root,
        input: "start",
      }),
    ).toMatchObject({
      status: "completed",
      data: { profile: { name: "Ada", city: "Madrid" } },
    });
  });

  it.each([
    false,
    true,
  ])("replaces strict union values across native chat turns (parallel=%s)", async (parallel) => {
    const root = workflow(
      "turns",
      {
        write: {
          run: ({ input }: { input: string }) => ({
            data: { closing: input === "offer" ? offer : none },
            ui: { message: "answer" },
          }),
        },
        ...(parallel
          ? { sibling: { run: () => ({ data: { sibling: true } }) } }
          : {}),
      },
      parallel
        ? [
            ["__start__", "write"],
            ["__start__", "sibling"],
            ["write", "__end__"],
            ["sibling", "__end__"],
          ]
        : [
            ["__start__", "write"],
            ["write", "__end__"],
          ],
    );
    const frameworkAdapter = createInMemoryFrameworkAdapter();
    const agent = createAgent({
      workflows: [root],
      defaultWorkflowId: root.id,
      frameworkAdapter,
    });
    await collect(
      agent.streamChat([{ role: "user", content: "offer" }], {
        sessionId: "turns",
      }),
    );
    expect(
      (await frameworkAdapter.sessionCheckpoints?.getHead("turns"))?.state.data,
    ).toEqual({ closing: offer });
    await collect(
      agent.streamChat([{ role: "user", content: "none" }], {
        sessionId: "turns",
      }),
    );
    expect(
      (await frameworkAdapter.sessionCheckpoints?.getHead("turns"))?.state.data,
    ).toEqual({ closing: none });
  });

  it("replaces inherited union values at a parallel join and preserves disjoint sibling output", async () => {
    const root = workflow(
      "parallel",
      {
        before: { run: () => ({ data: { closing: offer } }) },
        replace: { run: () => ({ data: { closing: none } }) },
        sibling: {
          run: ({ input }: { input: { closing: unknown } }) => {
            expect(input.closing).toEqual(offer);
            return { data: { sibling: true } };
          },
        },
        join: {
          run: ({
            input,
          }: {
            input: { closing: unknown; sibling: boolean };
          }) => {
            expect(input).toMatchObject({ closing: none, sibling: true });
            expect(input.closing).toEqual(none);
            return {};
          },
        },
      },
      [
        ["__start__", "before"],
        ["before", "replace"],
        ["before", "sibling"],
        ["replace", "join"],
        ["sibling", "join"],
        ["join", "__end__"],
      ],
    );
    expect(
      await createAgent({ workflows: [root] }).execute({
        workflow: root,
        input: "start",
      }),
    ).toMatchObject({ status: "completed", data: { closing: none } });
  });

  it("applies replacement inside a child and when its output is returned by the parent", async () => {
    const child = workflow(
      "child",
      {
        before: { run: () => ({ data: { closing: offer } }) },
        after: { run: () => ({ data: { closing: none } }) },
      },
      [
        ["__start__", "before"],
        ["before", "after"],
        ["after", "__end__"],
      ],
    );
    const root = workflow(
      "parent",
      {
        before: { run: () => ({ data: { closing: offer } }) },
        call: {
          run: async () => ({
            data: (
              await useWorkflow({
                id: "child",
                workflow: child,
                input: "start",
              })
            ).data,
          }),
        },
      },
      [
        ["__start__", "before"],
        ["before", "call"],
        ["call", "__end__"],
      ],
    );
    expect(
      await createAgent({ workflows: [root, child] }).execute({
        workflow: root,
        input: "start",
      }),
    ).toMatchObject({ status: "completed", data: { closing: none } });
  });

  it("replaces checkpointed values after interrupt/resume with a newly created agent", async () => {
    const root = workflow(
      "resume",
      {
        before: { run: () => ({ data: { closing: offer } }) },
        wait: {
          run: async () => {
            await useInterrupt({
              request: { kind: "text", question: "Continue?" },
            });
            return { data: { closing: none } };
          },
        },
      },
      [
        ["__start__", "before"],
        ["before", "wait"],
        ["wait", "__end__"],
      ],
    );
    const frameworkAdapter = createInMemoryFrameworkAdapter();
    const make = () => createAgent({ workflows: [root], frameworkAdapter });
    const paused = await make().execute({ workflow: root, input: "start" });
    expect(paused.status).toBe("suspended");
    if (paused.status !== "suspended") throw new Error("Expected interrupt");
    expect(
      await make().resume({
        workflow: root,
        resume: paused.resume,
        response: { type: "text", text: "yes" },
      }),
    ).toMatchObject({ status: "completed", data: { closing: none } });
  });
});

const sum = (previous: number | undefined, next: number) =>
  (previous ?? 0) + next;
const concatenate = (previous: string[] | undefined, next: string[]) => [
  ...(previous ?? []),
  ...next,
];

describe("reducer accumulation contracts", () => {
  it("does not automatically replace union branches without a reducer", async () => {
    const root = defineWorkflow({
      id: "legacy-union",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.strictObject({ closing: closingSchema }),
      nodes: {
        before: { run: () => ({ data: { closing: offer } }) },
        after: { run: () => ({ data: { closing: none } }) },
      },
      edges: [
        ["__start__", "before"],
        ["before", "after"],
        ["after", "__end__"],
      ],
    });
    expect(
      await createAgent({ workflows: [root] }).execute({
        workflow: root,
        input: "start",
      }),
    ).toMatchObject({ status: "failed", error: { code: "INVALID_OUTPUT" } });
  });

  it.each([
    false,
    true,
  ])("keeps unrelated fields deep-merged with a reducer enabled (parallel=%s)", async (parallel) => {
    const root = defineWorkflow({
      id: "mixed",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.strictObject({
        count: z.number(),
        profile: z.strictObject({ name: z.string(), city: z.string() }),
      }),
      reduce: { count: sum },
      nodes: {
        before: {
          run: () => ({
            data: { count: 1, profile: { name: "Ada", city: "London" } },
          }),
        },
        after: {
          run: () => ({ data: { count: 2, profile: { city: "Madrid" } } }),
        },
        ...(parallel ? { sibling: { run: () => ({}) } } : {}),
        read: {
          run: ({ input }: { input: Record<string, unknown> }) => {
            expect(input).toMatchObject({
              count: 3,
              profile: { name: "Ada", city: "Madrid" },
            });
            return {};
          },
        },
      },
      edges: parallel
        ? [
            ["__start__", "before"],
            ["before", "after"],
            ["before", "sibling"],
            ["after", "read"],
            ["sibling", "read"],
            ["read", "__end__"],
          ]
        : [
            ["__start__", "before"],
            ["before", "after"],
            ["after", "read"],
            ["read", "__end__"],
          ],
    });
    expect(
      await createAgent({ workflows: [root] }).execute({
        workflow: root,
        input: "start",
      }),
    ).toMatchObject({
      status: "completed",
      data: { count: 3, profile: { name: "Ada", city: "Madrid" } },
    });
  });

  it("calls a reducer once per returned field and skips omissions", async () => {
    const calls: Array<[number | undefined, number]> = [];
    const root = defineWorkflow({
      id: "omission",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.object({ count: z.number() }),
      reduce: {
        count: (previous, next) => {
          calls.push([previous, next]);
          return sum(previous, next);
        },
      },
      nodes: {
        first: { run: () => ({ data: { count: 2 } }) },
        omit: { run: () => ({ data: {} }) },
        last: { run: () => ({ data: { count: 3 } }) },
      },
      edges: [
        ["__start__", "first"],
        ["first", "omit"],
        ["omit", "last"],
        ["last", "__end__"],
      ],
    });
    expect(
      await createAgent({ workflows: [root] }).execute({
        workflow: root,
        input: "start",
      }),
    ).toMatchObject({ status: "completed", data: { count: 5 } });
    expect(calls).toEqual([
      [undefined, 2],
      [2, 3],
    ]);
  });

  it.each([
    false,
    true,
  ])("removes optional fields from accumulated data and downstream input (parallel=%s)", async (parallel) => {
    const root = defineWorkflow({
      id: "clear",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.object({ note: z.string().optional() }),
      reduce: {
        note: (_previous, next) => (next === "clear" ? undefined : next),
      },
      nodes: {
        before: { run: () => ({ data: { note: "old" } }) },
        clear: { run: () => ({ data: { note: "clear" } }) },
        ...(parallel ? { sibling: { run: () => ({}) } } : {}),
        read: {
          run: ({ input }: { input: Record<string, unknown> }) => {
            expect(Object.hasOwn(input, "note")).toBe(false);
            return {};
          },
        },
      },
      edges: parallel
        ? [
            ["__start__", "before"],
            ["before", "clear"],
            ["before", "sibling"],
            ["clear", "read"],
            ["sibling", "read"],
            ["read", "__end__"],
          ]
        : [
            ["__start__", "before"],
            ["before", "clear"],
            ["clear", "read"],
            ["read", "__end__"],
          ],
    });
    const result = await createAgent({ workflows: [root] }).execute({
      workflow: root,
      input: "start",
    });
    expect(result).toMatchObject({ status: "completed", data: {} });
    if (result.status !== "completed") throw new Error("Expected completion");
    expect(Object.hasOwn(result.data, "note")).toBe(false);
  });

  it("validates reducer results, including removal of a required field", async () => {
    for (const value of [undefined, "wrong"]) {
      const root = defineWorkflow({
        id: "invalid-reducer-result",
        version: "1",
        inputSchema: z.string(),
        outputSchema: z.object({ count: z.number() }),
        // Deliberately simulate untyped consumer code bypassing TypeScript.
        reduce: {
          count: (() => value) as (
            previous: number | undefined,
            next: number,
          ) => number | undefined,
        },
        nodes: { write: { run: () => ({ data: { count: 1 } }) } },
        edges: [
          ["__start__", "write"],
          ["write", "__end__"],
        ],
      });
      expect(
        await createAgent({ workflows: [root] }).execute({
          workflow: root,
          input: "start",
        }),
      ).toMatchObject({
        status: "failed",
        error: { code: "INVALID_OUTPUT", category: "validation" },
      });
    }
  });

  it.each([
    false,
    true,
  ])("reports thrown reducers with safe typed failures (parallel=%s)", async (parallel) => {
    const root = defineWorkflow({
      id: "throwing",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.object({ count: z.number() }),
      reduce: {
        count: () => {
          throw new Error("private reducer payload");
        },
      },
      nodes: {
        write: { run: () => ({ data: { count: 1 } }) },
        ...(parallel ? { sibling: { run: () => ({}) } } : {}),
      },
      edges: parallel
        ? [
            ["__start__", "write"],
            ["__start__", "sibling"],
            ["write", "__end__"],
            ["sibling", "__end__"],
          ]
        : [
            ["__start__", "write"],
            ["write", "__end__"],
          ],
    });
    const result = await createAgent({ workflows: [root] }).execute({
      workflow: root,
      input: "start",
    });
    expect(result).toMatchObject({
      status: "failed",
      error: {
        code: "WORKFLOW_REDUCER_FAILED",
        category: "workflow",
        retryable: false,
        context: { workflow: "throwing", field: "count" },
      },
    });
    expect(JSON.stringify(result)).not.toContain("private reducer payload");
  });

  it.each([
    false,
    true,
  ])("folds raw writes in declaration order without counting shared ancestors twice (reverseCompletion=%s)", async (reverseCompletion) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const root = defineWorkflow({
      id: "ordered-branches",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.object({ items: z.array(z.string()) }),
      reduce: { items: concatenate },
      nodes: {
        seed: { run: () => ({ data: { items: ["seed"] } }) },
        left: {
          run: async () => {
            if (reverseCompletion) await gate;
            else release();
            return { data: { items: ["left"] } };
          },
        },
        right: {
          run: async () => {
            if (reverseCompletion) release();
            else await gate;
            return { data: { items: ["right"] } };
          },
        },
        join: {
          run: ({ input }: { input: { items: string[] } }) => {
            expect(input.items).toEqual(["seed", "left", "right"]);
            return { data: { items: ["join"] } };
          },
        },
      },
      // Edge order is deliberately different from node declaration order.
      edges: [
        ["__start__", "seed"],
        ["seed", "right"],
        ["seed", "left"],
        ["right", "join"],
        ["left", "join"],
        ["join", "__end__"],
      ],
    });
    expect(
      await createAgent({ workflows: [root] }).execute({
        workflow: root,
        input: "start",
      }),
    ).toMatchObject({
      status: "completed",
      data: { items: ["seed", "left", "right", "join"] },
    });
  });

  it.each([
    false,
    true,
  ])("restores additive reducer checkpoints without reapplying stored totals (parallel=%s)", async (parallel) => {
    const root = defineWorkflow({
      id: "resume-sum",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.object({ count: z.number() }),
      reduce: { count: sum },
      nodes: {
        seed: { run: () => ({ data: { count: 1 } }) },
        wait: {
          run: async () => {
            await useInterrupt({
              request: { kind: "text", question: "Continue?" },
            });
            return { data: { count: 2 } };
          },
        },
        ...(parallel
          ? { sibling: { run: () => ({ data: { count: 4 } }) } }
          : {}),
      },
      edges: parallel
        ? [
            ["__start__", "seed"],
            ["seed", "wait"],
            ["seed", "sibling"],
            ["wait", "__end__"],
            ["sibling", "__end__"],
          ]
        : [
            ["__start__", "seed"],
            ["seed", "wait"],
            ["wait", "__end__"],
          ],
    });
    const frameworkAdapter = createInMemoryFrameworkAdapter();
    const make = () => createAgent({ workflows: [root], frameworkAdapter });
    const paused = await make().execute({ workflow: root, input: "start" });
    expect(paused.status).toBe("suspended");
    if (paused.status !== "suspended") throw new Error("Expected interruption");
    expect(
      await make().resume({
        workflow: root,
        resume: paused.resume,
        response: { type: "text", text: "yes" },
      }),
    ).toMatchObject({ status: "completed", data: { count: parallel ? 7 : 3 } });
  });

  it("uses the child's reducer and then the parent's reducer on the returned child output", async () => {
    const child = defineWorkflow({
      id: "sum-child",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.object({ count: z.number() }),
      reduce: { count: sum },
      nodes: {
        first: { run: () => ({ data: { count: 2 } }) },
        second: { run: () => ({ data: { count: 3 } }) },
      },
      edges: [
        ["__start__", "first"],
        ["first", "second"],
        ["second", "__end__"],
      ],
    });
    const root = defineWorkflow({
      id: "sum-parent",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.object({ count: z.number() }),
      reduce: { count: sum },
      nodes: {
        seed: { run: () => ({ data: { count: 10 } }) },
        call: {
          run: async () => ({
            data: (
              await useWorkflow({
                id: "child-call",
                workflow: child,
                input: "start",
              })
            ).data,
          }),
        },
      },
      edges: [
        ["__start__", "seed"],
        ["seed", "call"],
        ["call", "__end__"],
      ],
    });
    expect(
      await createAgent({ workflows: [root, child] }).execute({
        workflow: root,
        input: "start",
      }),
    ).toMatchObject({ status: "completed", data: { count: 15 } });
  });
});

it("streams reducer failures with a diagnostic link and retains the private cause for the exporter", async () => {
  const original = new Error("private reducer exception");
  const diagnosticId = "6f75adfe-81c5-4d65-a2e6-2e8e5ddce98b";
  const reported: unknown[] = [];
  const root = defineWorkflow({
    id: "stream-failure",
    version: "1",
    inputSchema: z.string(),
    outputSchema: z.object({ count: z.number() }),
    reduce: {
      count: () => {
        throw original;
      },
    },
    nodes: { write: { run: () => ({ data: { count: 1 } }) } },
    edges: [
      ["__start__", "write"],
      ["write", "__end__"],
    ],
  });
  const agent = createAgent({
    workflows: [root],
    defaultWorkflowId: root.id,
    telemetry: {
      trace: {
        startSpan: () => undefined,
        reportError: (error) => {
          reported.push(error);
          return diagnosticId;
        },
      },
    },
  });
  const chunks: StreamChunk[] = [];
  for await (const chunk of await agent.streamChat(
    [{ role: "user", content: "start" }],
    { sessionId: "reducer-failure" },
  ))
    chunks.push(chunk);
  expect(chunks.filter((chunk) => chunk.type === "error")).toEqual([
    expect.objectContaining({
      diagnosticId,
      failure: expect.objectContaining({
        code: "WORKFLOW_REDUCER_FAILED",
        category: "workflow",
        context: { workflow: root.id, field: "count" },
      }),
    }),
  ]);
  expect(reported).toEqual(
    expect.arrayContaining([expect.objectContaining({ cause: original })]),
  );
  expect(JSON.stringify(chunks)).not.toContain("private reducer exception");
});

it("requires an output schema even when a custom registry bypasses defineWorkflow", async () => {
  const root: WorkflowDefinition = {
    id: "missing-output-schema",
    version: "1",
    reduce: { count: sum },
    nodes: { write: { run: () => ({ data: { count: 1 } }) } },
    edges: [
      ["__start__", "write"],
      ["write", "__end__"],
    ],
  };
  const agent = createAgent({ workflows: [root], defaultWorkflowId: root.id });
  await expect(
    agent.streamChat([{ role: "user", content: "start" }]),
  ).rejects.toMatchObject({ code: "WORKFLOW_CONTRACT_ERROR" });
});
