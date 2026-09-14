// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import { defineWorkflow, type NodeResult } from "@kortyx/core";
import {
  DomainError,
  type FailureDescriptor,
  serializeFailure,
} from "@kortyx/core/errors";
import {
  ParallelError,
  parallel,
  useInterrupt,
  useReason,
  useWorkflow,
  WorkflowCallError,
} from "@kortyx/hooks";
import { createOpenAI } from "@kortyx/openai";
import {
  createInMemoryFrameworkAdapter,
  createRedisFrameworkAdapter,
} from "@kortyx/runtime";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";

const flow = (id: string, run: () => NodeResult | Promise<NodeResult>) =>
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
const payload = (count: unknown) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify({ count }) }],
        },
      ],
      usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
    }),
  );

it("allows one application transient retry and one separate schema correction with accurate spending", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(payload("bad"))
    .mockResolvedValueOnce(payload(7));
  const provider = createOpenAI({ apiKey: "test", fetch });
  let retries = 0;
  let corrections = 0;
  const root = flow("recover", async () => {
    for (;;) {
      try {
        const result = await useReason({
          model: provider("gpt-5.6-luna"),
          input: corrections ? "Correct count to a number." : "Return count.",
          outputSchema: z.object({ count: z.number() }),
          stream: false,
        });
        return { data: result.output };
      } catch (error) {
        const failure = serializeFailure(error);
        if (
          failure.code === "PROVIDER_HTTP_ERROR" &&
          failure.retryable &&
          retries++ === 0
        )
          continue;
        if (failure.code === "MODEL_OUTPUT_SCHEMA" && corrections++ === 0) {
          expect(failure).toMatchObject({
            usage: { total: 5 },
            finishReason: { unified: "stop" },
            issues: [{ code: "invalid_type" }],
          });
          continue;
        }
        throw error;
      }
    }
  });
  const result = await createAgent({
    workflows: [root],
    limits: { maxModelPasses: 3 },
  }).execute({ workflow: root, input: {} });
  expect(result).toMatchObject({
    status: "completed",
    data: { count: 7 },
    usage: { total: 10 },
  });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect([retries, corrections]).toEqual([1, 1]);
});

it.each([
  400, 401, 403,
])("exposes terminal HTTP %i directly without granting another call", async (status) => {
  const fetch = vi.fn(async () => new Response("private body", { status }));
  const provider = createOpenAI({ apiKey: "test", fetch });
  const root = flow("terminal", async () => {
    await useReason({
      model: provider("gpt-5.6-luna"),
      input: "Run",
      stream: false,
    });
    return {};
  });
  const result = await createAgent({ workflows: [root] }).execute({
    workflow: root,
    input: {},
  });
  expect(result).toMatchObject({
    status: "failed",
    error: { code: "PROVIDER_HTTP_ERROR", status, retryable: false },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toContain("private body");
});

it("suspends a policy retry at the existing model allowance", async () => {
  const fetch = vi.fn(async () => new Response("unavailable", { status: 503 }));
  const provider = createOpenAI({ apiKey: "test", fetch });
  const root = flow("limited", async () => {
    try {
      await useReason({
        model: provider("gpt-5.6-luna"),
        input: "Run",
        stream: false,
      });
    } catch (error) {
      if (!serializeFailure(error).retryable) throw error;
      await useReason({
        model: provider("gpt-5.6-luna"),
        input: "Retry",
        stream: false,
      });
    }
    return {};
  });
  expect(
    await createAgent({
      workflows: [root],
      limits: { maxModelPasses: 1 },
    }).execute({ workflow: root, input: {} }),
  ).toMatchObject({ status: "suspended", reason: "limit_reached" });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  "provider",
  "schema",
  "refusal",
] as const)("stops the application recovery budget for %s failures", async (kind) => {
  const fetch = vi.fn(async () =>
    kind === "provider"
      ? new Response("unavailable", { status: 503 })
      : kind === "schema"
        ? payload("bad")
        : new Response(
            JSON.stringify({
              status: "completed",
              output: [
                {
                  type: "message",
                  content: [
                    { type: "refusal", refusal: "private refusal text" },
                  ],
                },
              ],
            }),
          ),
  );
  const provider = createOpenAI({ apiKey: "test", fetch });
  let recovered = false;
  const root = flow("bounded-recovery", async () => {
    for (;;) {
      try {
        await useReason({
          model: provider("gpt-5.6-luna"),
          input: "Run",
          outputSchema: z.object({ count: z.number() }),
          stream: false,
        });
        return {};
      } catch (error) {
        const failure = serializeFailure(error);
        if (
          !recovered &&
          (failure.retryable === true || failure.code === "MODEL_OUTPUT_SCHEMA")
        ) {
          recovered = true;
          continue;
        }
        throw error;
      }
    }
  });
  const result = await createAgent({ workflows: [root] }).execute({
    workflow: root,
    input: {},
  });
  expect(result).toMatchObject({
    status: "failed",
    error: {
      code:
        kind === "provider"
          ? "PROVIDER_HTTP_ERROR"
          : kind === "schema"
            ? "MODEL_OUTPUT_SCHEMA"
            : "PROVIDER_REFUSAL",
    },
  });
  expect(fetch).toHaveBeenCalledTimes(kind === "refusal" ? 1 : 2);
  if (kind === "schema") expect(result.usage?.total).toBe(10);
  expect(JSON.stringify(result)).not.toContain("private refusal text");
});

for (const persistence of [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
]) {
  for (const kind of ["domain", "provider", "validation", "legacy"] as const) {
    const expected =
      kind === "legacy"
        ? { code: "EXECUTION_FAILED", retryable: null }
        : kind === "domain"
          ? {
              code: "DOMAIN_ERROR",
              domainCode: "SPECIALIST_UNAVAILABLE",
              details: { specialist: "research" },
            }
          : kind === "provider"
            ? { code: "PROVIDER_HTTP_ERROR", status: 503, retryable: true }
            : {
                code: "MODEL_OUTPUT_SCHEMA",
                issues: [{ code: "invalid_type" }],
                usage: { total: 5 },
              };
    it(`preserves nested ${kind} failures and ordered parallel results across ${persistence} reconstruction`, async () => {
      const prefix = `failure-contract:${crypto.randomUUID()}:`;
      const memory = createInMemoryFrameworkAdapter();
      const adapter = () =>
        persistence === "memory"
          ? memory
          : createRedisFrameworkAdapter({
              url: process.env.KORTYX_TEST_REDIS_URL ?? "",
              prefix,
            });
      const failed = vi.fn(async () => {
        if (kind !== "domain" && kind !== "legacy") {
          const provider = createOpenAI({
            apiKey: "test",
            fetch: async () =>
              kind === "provider"
                ? new Response("secret-token", { status: 503 })
                : payload("invalid"),
          });
          await useReason({
            model: provider("gpt-5.6-luna"),
            input: "Run",
            stream: false,
            outputSchema: z.object({ count: z.number() }),
          });
          return {};
        }
        throw new DomainError(
          "SPECIALIST_UNAVAILABLE",
          "Specialist unavailable.",
          {
            details: { specialist: "research" },
            cause: new Error("secret-token"),
          },
        );
      });
      const done = vi.fn(() => ({ data: { value: "cached" } }));
      const leaf = flow("failed-leaf", failed);
      const a = flow("failed-child", async () => {
        await useWorkflow({ id: "leaf", workflow: leaf, input: {} });
        return {};
      });
      const b = flow("success-child", done);
      const c = flow("waiting-child", async () => ({
        data: {
          answer: await useInterrupt({
            request: { kind: "text", question: "Continue?" },
          }),
        },
      }));
      let observed: FailureDescriptor | undefined;
      const root = flow("parent", async () => {
        try {
          await parallel(
            [a, b, c].map((workflow) =>
              useWorkflow({ id: workflow.id, workflow, input: {} }),
            ),
          );
        } catch (error) {
          if (!(error instanceof ParallelError)) throw error;
          expect(error.results.map((result) => result.status)).toEqual([
            "rejected",
            "fulfilled",
            "fulfilled",
          ]);
          const rejected = error.results[0];
          if (rejected?.status === "rejected") {
            expect(rejected.reason).toBeInstanceOf(WorkflowCallError);
            observed = serializeFailure(rejected.reason);
          }
          // Verify direct outcome serialization of the aggregate as well.
          throw error;
        }
        return {};
      });
      const agent = () =>
        createAgent({
          workflows: [root, a, b, c, leaf],
          frameworkAdapter: adapter(),
        });
      const first = await agent().execute({ workflow: root, input: {} });
      expect(first.status).toBe("suspended");
      if (first.status !== "suspended") throw new Error("Expected suspension");
      if (kind === "legacy") {
        const store = adapter().pendingRequests;
        const saved = await store.get(first.resume.token);
        expect(saved).not.toBeNull();
        // Old checkpoints retained only the child error string. Remove descriptors
        // throughout both state and the embedded graph snapshot before restore.
        const legacy = JSON.parse(
          JSON.stringify(saved, (key, value) =>
            key === "failure" ? undefined : value,
          ),
        );
        expect(JSON.stringify(legacy)).not.toContain('"failure":');
        await store.save(legacy);
      }
      const resumed = await agent().resume({
        workflow: root,
        resume: first.resume,
        response: { type: "text", text: "yes" },
      });
      expect(observed).toMatchObject(expected);
      expect(resumed).toMatchObject({
        status: "failed",
        error: {
          code: "PARALLEL_FAILED",
          results: [
            {
              status: "rejected",
              failure: expected,
            },
            { status: "fulfilled" },
            { status: "fulfilled" },
          ],
        },
      });
      expect(JSON.stringify(resumed)).not.toContain("secret-token");
      expect(failed).toHaveBeenCalledTimes(1);
      expect(done).toHaveBeenCalledTimes(1);
    });
  }
}
