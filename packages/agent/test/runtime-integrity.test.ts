// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import type { NodeResult } from "@kortyx/core";
import { defineWorkflow } from "@kortyx/core";
import {
  defineInterruptContract,
  useInterrupt,
  useReason,
  useWorkflow,
} from "@kortyx/hooks";
import type { KortyxPromptMessage, KortyxToolCall } from "@kortyx/providers";
import {
  createInMemoryFrameworkAdapter,
  createPostgresFrameworkAdapter,
  createRedisFrameworkAdapter,
} from "@kortyx/runtime";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";
import type { ExecutionResult } from "../src/execution/types";

const details = defineInterruptContract({
  description: "Ask for a missing detail.",
  schemaId: "test.details",
  schemaVersion: "1",
  requestSchema: z.object({ kind: z.literal("text"), question: z.string() }),
  responseSchema: z.object({ answer: z.string() }),
});
const workflow = (id: string, run: () => NodeResult | Promise<NodeResult>) =>
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
const pause = (result: ExecutionResult) => {
  expect(result.status, JSON.stringify(result)).toBe("suspended");
  if (result.status !== "suspended") throw new Error("Expected suspension");
  return result;
};
function script(turns: KortyxToolCall[][]) {
  const feedback: KortyxPromptMessage[] = [];
  let passes = 0;
  const invoke = vi.fn(async (messages: KortyxPromptMessage[]) => {
    feedback.push(...messages.filter((message) => message.role === "tool"));
    const toolCalls = turns[passes++];
    return toolCalls ? { content: "", toolCalls } : { content: "done" };
  });
  const provider = {
    id: "fixture",
    models: ["mock"],
    getModel: () => ({ invoke, stream: async function* () {} }),
  };
  return {
    model: { provider, modelId: "mock" },
    feedback,
    invoke,
    passes: () => passes,
  };
}

it("returns bounded private-safe feedback and lets the model correct a request without consuming human quota", async () => {
  const s = script([
    [
      {
        id: "invalid",
        name: "kortyx_request_input__details",
        input: { question: { secret: "do-not-echo" } },
      },
    ],
    [
      {
        id: "valid",
        name: "kortyx_request_input__details",
        input: { kind: "text", question: "Name?" },
      },
    ],
  ]);
  const root = workflow("correction", async () => {
    const result = await useReason({
      id: "reason",
      model: s.model,
      input: "go",
      stream: false,
      emit: false,
      interrupts: { contracts: { details }, maxRequests: 1 },
      toolExecution: { maxSteps: 4 },
    });
    expect(result.interruptHistory).toHaveLength(1);
    return { data: { answer: "done" } };
  });
  const agent = createAgent({ workflows: [root] });
  const human = pause(await agent.execute({ workflow: root, input: {} }));
  expect(
    s.feedback.some(
      (message) => message.isError && message.content.includes("question"),
    ),
  ).toBe(true);
  expect(JSON.stringify(s.feedback)).not.toContain("do-not-echo");
  expect(
    await agent.resume({
      workflow: root,
      resume: human.resume,
      response: { type: "value", value: { answer: "Ada" } },
    }),
  ).toMatchObject({ status: "completed" });
  expect(s.passes()).toBe(3);
});

for (const mode of ["optional", "required"] as const)
  it(`keeps ${mode} final-answer policy after invalid requests`, async () => {
    const s = script([
      [{ id: "invalid", name: "kortyx_request_input__details", input: {} }],
    ]);
    const root = workflow("final-policy", async () => {
      await useReason({
        model: s.model,
        input: "go",
        stream: false,
        emit: false,
        interrupts: { contracts: { details }, mode },
        toolExecution: { maxSteps: 3 },
      });
      return { data: { answer: "done" } };
    });
    expect(
      (
        await createAgent({ workflows: [root] }).execute({
          workflow: root,
          input: {},
        })
      ).status,
    ).toBe(mode === "optional" ? "completed" : "failed");
    expect(s.passes()).toBe(2);
  });

it("bounds repeated invalid requests by maxSteps", async () => {
  const s = script(
    Array.from({ length: 4 }, (_, index) => [
      { id: String(index), name: "kortyx_request_input__details", input: {} },
    ]),
  );
  const root = workflow("bounded-correction", async () => {
    await useReason({
      model: s.model,
      input: "go",
      stream: false,
      emit: false,
      interrupts: { contracts: { details } },
      toolExecution: { maxSteps: 3 },
    });
    return { data: { answer: "done" } };
  });
  expect(
    (
      await createAgent({ workflows: [root] }).execute({
        workflow: root,
        input: {},
      })
    ).status,
  ).toBe("failed");
  expect(s.passes()).toBe(3);
});

it("preserves approval denial after a model corrects invalid interrupt input", async () => {
  const execute = vi.fn(async () => "saved");
  const s = script([
    [{ id: "invalid", name: "kortyx_request_input__details", input: {} }],
    [{ id: "write", name: "save", input: {} }],
  ]);
  const root = workflow("denied-write", async () => {
    await useReason({
      model: s.model,
      input: "go",
      stream: false,
      emit: false,
      tools: [{ name: "save", inputSchema: { type: "object" }, execute }],
      interrupts: { contracts: { details } },
      toolExecution: { approval: true, maxSteps: 4 },
    });
    return { data: { answer: "done" } };
  });
  const agent = createAgent({ workflows: [root] });
  const human = pause(await agent.execute({ workflow: root, input: {} }));
  expect(human.interrupt.input.question).toBe("Approve save?");
  expect(
    await agent.resume({
      workflow: root,
      resume: human.resume,
      response: { type: "select", ids: ["deny"] },
    }),
  ).toMatchObject({ status: "completed" });
  expect(execute).not.toHaveBeenCalled();
});

const backends = [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
  ...(process.env.KORTYX_TEST_POSTGRES_URL ? ["postgres"] : []),
];
for (const backend of backends)
  for (const child of [false, true])
    it(`keeps tools and distinct human requests across budget Continue (${backend}, child=${child})`, async () => {
      const execute = vi.fn(async () => ({ marker: "completed-read" }));
      const contracts = ["first", "second", "third"];
      const s = script([
        ...contracts.map((name) => [
          {
            id: name,
            name: `kortyx_request_input__${name}`,
            input: { kind: "text", question: name },
          },
        ]),
        [{ id: "read", name: "read", input: {} }],
      ]);
      const leaf = workflow("leaf", async () => {
        const result = await useReason({
          id: "reason",
          model: s.model,
          input: "go",
          stream: false,
          emit: false,
          tools: [{ name: "read", inputSchema: { type: "object" }, execute }],
          interrupts: {
            contracts: { first: details, second: details, third: details },
            maxRequests: 3,
          },
          toolExecution: { maxSteps: 12 },
        });
        expect(result.toolResults).toHaveLength(1);
        expect(result.interruptHistory?.map((entry) => entry.response)).toEqual(
          Array.from({ length: 3 }, () => ({ answer: "same" })),
        );
        const review = await useInterrupt({
          id: "review",
          request: {
            kind: "custom",
            request: { question: "Review?" },
            schemaId: "test.review",
            schemaVersion: "1",
          },
          responseSchema: z.object({ approved: z.boolean() }),
        });
        return { data: { answer: JSON.stringify(review) } };
      });
      const root = child
        ? defineWorkflow({
            ...workflow("root", () => ({ data: {} })),
            nodes: {
              run: {
                run: async () =>
                  await useWorkflow({ id: "child", workflow: leaf, input: {} }),
              },
              sibling: { run: () => ({ data: {} }) },
            },
            edges: [
              ["__start__", "run"],
              ["run", "__end__"],
              ["__start__", "sibling"],
              ["sibling", "__end__"],
            ],
          })
        : leaf;
      const namespace = `integrity:${crypto.randomUUID()}:`;
      const create = () =>
        backend === "redis"
          ? createRedisFrameworkAdapter({
              url: process.env.KORTYX_TEST_REDIS_URL!,
              prefix: namespace,
            })
          : backend === "postgres"
            ? createPostgresFrameworkAdapter({
                connectionString: process.env.KORTYX_TEST_POSTGRES_URL!,
                namespace,
              })
            : createInMemoryFrameworkAdapter();
      let adapter = create();
      const make = () =>
        createAgent({
          workflows: child ? [root, leaf] : [root],
          frameworkAdapter: adapter,
          limits: { maxModelPasses: 4 },
        });
      const restart = async () => {
        if (backend !== "memory") {
          await adapter.close();
          adapter = create();
        }
      };
      try {
        if (backend === "postgres") await adapter.maintenance.setup();
        let result = await make().execute({ workflow: root, input: {} });
        for (let index = 0; index < 3; index++) {
          const human = pause(result);
          await restart();
          result = await make().resume({
            workflow: root,
            resume: human.resume,
            response: { type: "value", value: { answer: "same" } },
          });
        }
        const stopped = pause(result);
        expect(stopped.reason).toBe("limit_reached");
        expect(execute).toHaveBeenCalledTimes(1);
        await restart();
        const review = pause(
          await make().resume({
            workflow: root,
            resume: stopped.resume,
            response: { type: "select", ids: ["continue"] },
          }),
        );
        expect(review.interrupt.input.request).toEqual({ question: "Review?" });
        await restart();
        expect(
          await make().resume({
            workflow: root,
            resume: review.resume,
            response: { type: "value", value: { approved: true } },
          }),
        ).toMatchObject({
          status: "completed",
          data: { answer: '{"approved":true}' },
        });
        expect(s.passes()).toBe(5);
        expect(execute).toHaveBeenCalledTimes(1);
        await expect(
          make().resume({
            workflow: root,
            resume: stopped.resume,
            response: { type: "select", ids: ["continue"] },
          }),
        ).rejects.toThrow();
      } finally {
        await adapter.close();
      }
    });

for (const child of [false, true])
  for (const answer of ["", "same", false, 0, null])
    it(`preserves an undelivered answer across node-budget Continue (child=${child}, answer=${JSON.stringify(answer)})`, async () => {
      const leaf = workflow("undelivered-leaf", async () => {
        const response = await useInterrupt({
          id: "answer",
          request: {
            kind: "custom",
            request: { question: "Answer?" },
            schemaId: "test.answer",
            schemaVersion: "1",
          },
          responseSchema: z.unknown(),
        });
        return { data: { answer: JSON.stringify(response) } };
      });
      const root = child
        ? workflow(
            "undelivered-root",
            async () =>
              await useWorkflow({ id: "child", workflow: leaf, input: {} }),
          )
        : leaf;
      const adapter = createInMemoryFrameworkAdapter();
      const make = () =>
        createAgent({
          workflows: [root, ...(child ? [leaf] : [])],
          frameworkAdapter: adapter,
          limits: { maxNodeExecutions: child ? 2 : 1 },
        });
      const human = pause(await make().execute({ workflow: root, input: {} }));
      const stopped = pause(
        await make().resume({
          workflow: root,
          resume: human.resume,
          response: { type: "value", value: answer },
        }),
      );
      expect(stopped.reason).toBe("limit_reached");
      if (answer === "same") {
        const fork = await make().fork(stopped.checkpointId!);
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
        ).toMatchObject({
          status: "completed",
          data: { answer: JSON.stringify(answer) },
        });
      }

      expect(
        await make().resume({
          workflow: root,
          resume: stopped.resume,
          response: { type: "select", ids: ["continue"] },
        }),
      ).toMatchObject({
        status: "completed",
        data: { answer: JSON.stringify(answer) },
      });
    });

for (const child of [false, true])
  it(`isolates picker and review payloads in a parallel workflow (child=${child})`, async () => {
    const picker = defineInterruptContract({
      description: "Choose",
      schemaId: "test.picker",
      schemaVersion: "1",
      requestSchema: z.object({
        kind: z.literal("custom"),
        question: z.string(),
        candidates: z.array(z.string()),
      }),
      responseSchema: z.object({ selected: z.string() }),
    });
    const s = script([
      [
        {
          id: "pick",
          name: "kortyx_request_input__picker",
          input: { kind: "custom", question: "Pick?", candidates: ["A", "B"] },
        },
      ],
    ]);
    const run = async () => {
      await useReason({
        id: "reason",
        model: s.model,
        input: "go",
        stream: false,
        emit: false,
        interrupts: { contracts: { picker }, maxRequests: 1 },
        toolExecution: { maxSteps: 4 },
      });
      const review = await useInterrupt({
        id: "review",
        request: {
          kind: "custom",
          request: { question: "Review?", proposal: "new" },
          schemaId: "test.review",
          schemaVersion: "1",
        },
        responseSchema: z.object({ approved: z.boolean() }),
      });
      return { data: { answer: JSON.stringify(review) } };
    };
    const leaf = workflow("picker-leaf", run);
    const root = defineWorkflow({
      ...workflow("picker-root", run),
      nodes: {
        run: {
          run: child
            ? async () =>
                await useWorkflow({ id: "child", workflow: leaf, input: {} })
            : run,
        },
        sibling: { run: () => ({ data: {} }) },
      },
      edges: [
        ["__start__", "run"],
        ["run", "__end__"],
        ["__start__", "sibling"],
        ["sibling", "__end__"],
      ],
    });
    const adapter = createInMemoryFrameworkAdapter();
    const make = () =>
      createAgent({ workflows: [root, leaf], frameworkAdapter: adapter });
    const first = pause(await make().execute({ workflow: root, input: {} }));
    const second = pause(
      await make().resume({
        workflow: root,
        resume: first.resume,
        response: { type: "value", value: { selected: "A" } },
      }),
    );
    expect(second.interrupt.input.schemaId).toBe("test.review");
    expect(second.interrupt.input).not.toHaveProperty("contract");
    expect(second.interrupt.input.request).toEqual({
      question: "Review?",
      proposal: "new",
    });
    expect(
      await make().resume({
        workflow: root,
        resume: second.resume,
        response: { type: "value", value: { approved: true } },
      }),
    ).toMatchObject({ status: "completed" });
    expect(s.passes()).toBe(2);
  });

it("streams corrected picker and review with separate public payloads and no internal delivery state", async () => {
  const picker = defineInterruptContract({
    description: "Pick",
    schemaId: "test.stream-picker",
    schemaVersion: "1",
    requestSchema: z.object({
      kind: z.literal("custom"),
      question: z.string(),
      candidates: z.array(z.string()),
    }),
    responseSchema: z.object({ selected: z.string() }),
  });
  const s = script([
    [
      {
        id: "invalid",
        name: "kortyx_request_input__picker",
        input: { question: { private: "never-echo-this" } },
      },
    ],
    [
      {
        id: "picker",
        name: "kortyx_request_input__picker",
        input: { kind: "custom", question: "Pick?", candidates: ["A", "B"] },
      },
    ],
  ]);
  const root = defineWorkflow({
    ...workflow("stream-integrity", () => ({ data: {} })),
    inputSchema: z.string(),
    nodes: {
      sibling: { run: () => ({ data: {} }) },
      run: {
        run: async () => {
          await useReason({
            id: "reason",
            model: s.model,
            input: "go",
            stream: true,
            emit: true,
            interrupts: { contracts: { picker }, maxRequests: 1 },
            toolExecution: { maxSteps: 4 },
          });
          const response = await useInterrupt({
            id: "review",
            request: {
              kind: "custom",
              request: { question: "Review?", proposal: "new" },
              schemaId: "test.stream-review",
              schemaVersion: "1",
            },
            responseSchema: z.object({ approved: z.boolean() }),
          });
          return { data: { answer: JSON.stringify(response) } };
        },
      },
    },
    edges: [
      ["__start__", "run"],
      ["run", "__end__"],
      ["__start__", "sibling"],
      ["sibling", "__end__"],
    ],
  });
  const agent = createAgent({ workflows: [root] });
  const sessionId = `stream-${crypto.randomUUID()}`;
  const first = [];
  for await (const chunk of await agent.streamChat(
    [{ role: "user", content: "go" }],
    { workflowId: root.id, sessionId },
  ))
    first.push(chunk);
  const selected = first.find((chunk) => chunk.type === "interrupt");
  if (!selected || selected.type !== "interrupt")
    throw new Error("Expected picker");
  expect(selected.schemaId).toBe("test.stream-picker");
  const second = [];
  for await (const chunk of await agent.streamChat(
    [
      {
        role: "user",
        content: "A",
        metadata: {
          resume: {
            token: selected.resumeToken,
            requestId: selected.requestId,
            value: { selected: "A" },
          },
        },
      },
    ],
    { workflowId: root.id, sessionId },
  ))
    second.push(chunk);
  const review = second.find((chunk) => chunk.type === "interrupt");
  if (!review || review.type !== "interrupt")
    throw new Error("Expected review");
  expect(review.schemaId).toBe("test.stream-review");
  if (review.input.kind !== "custom") throw new Error("Expected custom review");
  expect(review.input).not.toHaveProperty("contract");
  expect(review.input.request).toEqual({
    question: "Review?",
    proposal: "new",
  });
  expect(
    second.some(
      (chunk) => chunk.type === "text-delta" && chunk.delta === "done",
    ),
  ).toBe(true);
  expect(JSON.stringify([...first, ...second])).not.toMatch(
    /never-echo-this|__kortyxInterruptOccurrence|__kortyxParallelGraph/,
  );
  const final = [];
  for await (const chunk of await agent.streamChat(
    [
      {
        role: "user",
        content: "Reviewed",
        metadata: {
          resume: {
            token: review.resumeToken,
            requestId: review.requestId,
            value: { approved: false },
          },
        },
      },
    ],
    { workflowId: root.id, sessionId },
  ))
    final.push(chunk);
  expect(
    final.some((chunk) => chunk.type === "error" || chunk.type === "interrupt"),
  ).toBe(false);
  expect(s.passes()).toBe(3);
});

for (const encoding of ["object", "array"] as const)
  it(`resumes legacy child snapshots and journals (${encoding})`, async () => {
    const s = script([
      [
        {
          id: "question",
          name: "kortyx_request_input__details",
          input: { kind: "text", question: "Name?" },
        },
      ],
    ]);
    const leaf = workflow("legacy-leaf", async () => {
      await useReason({
        id: "reason",
        model: s.model,
        input: "go",
        stream: false,
        emit: false,
        interrupts: { contracts: { details }, maxRequests: 1 },
        toolExecution: { maxSteps: 4 },
      });
      const answer = await useInterrupt({
        id: "review",
        request: { kind: "text", question: "Review?" },
      });
      return { data: { answer: String(answer) } };
    });
    const root = defineWorkflow({
      ...workflow("legacy-root", () => ({ data: {} })),
      nodes: {
        run: {
          run: async () =>
            await useWorkflow({ id: "child", workflow: leaf, input: {} }),
        },
        sibling: { run: () => ({ data: {} }) },
      },
      edges: [
        ["__start__", "run"],
        ["run", "__end__"],
        ["__start__", "sibling"],
        ["sibling", "__end__"],
      ],
    });
    const adapter = createInMemoryFrameworkAdapter();
    const make = () =>
      createAgent({ workflows: [root, leaf], frameworkAdapter: adapter });
    const human = pause(await make().execute({ workflow: root, input: {} }));
    const saved = await adapter.pendingRequests.get(human.resume.token);
    if (!saved) throw new Error("Missing checkpoint");
    let snapshots = 0;
    let journals = 0;
    const legacy = JSON.parse(
      JSON.stringify(saved, (key, value) => {
        if (key === "__kortyxInterruptOccurrence") return undefined;
        if (key === "__kortyxParallelGraph" && value && !Array.isArray(value)) {
          journals++;
          return encoding === "array" ? [value] : value;
        }
        if (
          key === "snapshot" &&
          value?.checkpoint &&
          typeof value.version === "string"
        ) {
          snapshots++;
          return encoding === "array" ? [value] : value;
        }
        return value;
      }),
    );
    expect(snapshots).toBeGreaterThan(0);
    expect(journals).toBeGreaterThan(0);
    await adapter.pendingRequests.save(legacy);
    const review = pause(
      await make().resume({
        workflow: root,
        resume: human.resume,
        response: { type: "value", value: { answer: "Ada" } },
      }),
    );
    expect(review.interrupt.input.question).toBe("Review?");
    expect(review.interrupt.input).not.toHaveProperty("contract");
    expect(
      await make().resume({
        workflow: root,
        resume: review.resume,
        response: { type: "text", text: "yes" },
      }),
    ).toMatchObject({ status: "completed", data: { answer: "yes" } });
    expect(s.passes()).toBe(2);
  });
