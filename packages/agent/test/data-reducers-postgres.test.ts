// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks run within server workflow nodes.
import { randomUUID } from "node:crypto";
import { defineWorkflow } from "@kortyx/core";
import { useInterrupt } from "@kortyx/hooks";
import { createPostgresFrameworkAdapter } from "@kortyx/runtime";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";

const url = process.env.KORTYX_TEST_POSTGRES_URL;
describe.skipIf(!url)("PostgreSQL workflow reducer recovery", () => {
  it.each([
    false,
    true,
  ])("retains raw reducer writes and deletions across a fresh adapter (parallel=%s)", async (parallel) => {
    const root = defineWorkflow({
      id: "durable-reducers",
      version: "1",
      inputSchema: z.string(),
      outputSchema: z.object({
        count: z.number(),
        note: z.string().optional(),
      }),
      reduce: {
        count: (previous, next) => (previous ?? 0) + next,
        note: (_previous, next) => next,
      },
      nodes: {
        seed: { run: () => ({ data: { count: 1, note: "old" } }) },
        clear: { run: () => ({ data: { note: undefined } }) },
        wait: {
          run: async ({ input }: { input: Record<string, unknown> }) => {
            expect(Object.hasOwn(input, "note")).toBe(false);
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
            ["seed", "clear"],
            ["clear", "wait"],
            ["clear", "sibling"],
            ["wait", "__end__"],
            ["sibling", "__end__"],
          ]
        : [
            ["__start__", "seed"],
            ["seed", "clear"],
            ["clear", "wait"],
            ["wait", "__end__"],
          ],
    });
    const namespace = `reducers-${randomUUID()}`;
    const first = createPostgresFrameworkAdapter({
      connectionString: url!,
      namespace,
    });
    try {
      await first.maintenance.setup();
      const paused = await createAgent({
        workflows: [root],
        frameworkAdapter: first,
      }).execute({ workflow: root, input: "start" });
      expect(paused.status).toBe("suspended");
      if (paused.status !== "suspended") throw new Error("Expected interrupt");
      await first.close();
      const second = createPostgresFrameworkAdapter({
        connectionString: url!,
        namespace,
      });
      try {
        const result = await createAgent({
          workflows: [root],
          frameworkAdapter: second,
        }).resume({
          workflow: root,
          resume: paused.resume,
          response: { type: "text", text: "yes" },
        });
        expect(result).toMatchObject({
          status: "completed",
          data: { count: parallel ? 7 : 3 },
        });
        if (result.status !== "completed")
          throw new Error("Expected completion");
        expect(Object.hasOwn(result.data, "note")).toBe(false);
      } finally {
        await second.close();
      }
    } finally {
      await first.close();
    }
  });
});
