// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks run in server workflow nodes.
import { randomUUID } from "node:crypto";
import { defineWorkflow } from "@kortyx/core";
import { useInterrupt, useWorkflow } from "@kortyx/hooks";
import { createPostgresFrameworkAdapter } from "@kortyx/runtime";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";

const url = process.env.KORTYX_TEST_POSTGRES_URL;
describe.skipIf(!url)("PostgreSQL-backed agent recovery", () => {
  it("resumes a nested child after restart and independently resumes a fork of its pause", async () => {
    const namespace = `agent-test-${randomUUID()}`;
    const database = postgres(url!);
    const first = createPostgresFrameworkAdapter({
      connectionString: url!,
      namespace,
      ttlMs: 31 * 86_400_000,
    });
    const second = createPostgresFrameworkAdapter({
      connectionString: url!,
      namespace,
      ...(process.env.KORTYX_TEST_REDIS_URL
        ? { redis: { url: process.env.KORTYX_TEST_REDIS_URL, ttlMs: 10 } }
        : {}),
    });
    let completedBeforePause = 0;
    const child = defineWorkflow({
      id: "child",
      version: "1",
      inputSchema: z.object({}),
      outputSchema: z.object({ answer: z.string() }),
      nodes: {
        before: {
          run: () => {
            completedBeforePause++;
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
    const parent = defineWorkflow({
      id: "parent",
      version: "1",
      inputSchema: z.object({}),
      outputSchema: z.object({ answer: z.string() }),
      nodes: {
        run: {
          run: async () => ({
            data: (
              await useWorkflow({
                id: "child-call",
                workflow: child,
                input: {},
              })
            ).data,
          }),
        },
      },
      edges: [
        ["__start__", "run"],
        ["run", "__end__"],
      ],
    });
    try {
      await first.maintenance.setup();
      const agent = createAgent({
        workflows: [parent, child],
        frameworkAdapter: first,
      });
      const paused = await agent.execute({
        workflow: parent,
        input: {},
        sessionId: "session",
      });
      expect(paused.status).toBe("suspended");
      if (paused.status !== "suspended")
        throw new Error(JSON.stringify(paused));
      const checkpoints = await agent.listCheckpoints("session");
      const checkpoint = checkpoints.at(-1)!;
      const forked = await agent.fork(checkpoint.id);
      const forkRequest = forked.checkpoint.activePendingRequests[0]!;
      await first.close();
      // Simulate a checkpoint surviving several weeks without changing its approval deadline.
      await database`UPDATE kortyx_runtime_sessions SET last_activity = ${Date.now() - 25 * 86_400_000} WHERE scope = ${namespace}`;
      const restarted = createAgent({
        workflows: [parent, child],
        frameworkAdapter: second,
      });
      const result = await restarted.resume({
        workflow: parent,
        resume: paused.resume,
        response: { type: "text", text: "original" },
      });
      expect(result).toMatchObject({
        status: "completed",
        data: { answer: "original" },
      });
      const forkResult = await restarted.resume({
        workflow: parent,
        resume: {
          ...paused.resume,
          sessionId: forked.sessionId,
          runId: forkRequest.runId,
          token: forkRequest.token,
          requestId: forkRequest.requestId,
        },
        response: { type: "text", text: "forked" },
      });
      expect(forkResult).toMatchObject({
        status: "completed",
        data: { answer: "forked" },
      });
      expect(completedBeforePause).toBe(1);
      expect(
        await second.checkpointer.getTuple({
          configurable: { thread_id: paused.runId },
        }),
      ).toBeDefined();
      await expect(
        restarted.resume({
          workflow: parent,
          resume: paused.resume,
          response: { type: "text", text: "duplicate" },
        }),
      ).rejects.toThrow();
    } finally {
      await Promise.all([first.close(), second.close()]);
      await database`DELETE FROM kortyx_runtime_pending_requests WHERE scope = ${namespace}`;
      await database`DELETE FROM kortyx_runtime_sessions WHERE scope = ${namespace}`;
      await database`DELETE FROM kortyx_runtime_runs WHERE scope = ${namespace}`;
      await database.end();
    }
  }, 20_000);
});
