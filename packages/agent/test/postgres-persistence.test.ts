// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks run in server workflow nodes.
import { randomUUID } from "node:crypto";
import { defineWorkflow } from "@kortyx/core";
import { useInterrupt, useWorkflow } from "@kortyx/hooks";
import { createPostgresFrameworkAdapter } from "@kortyx/runtime";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";

const url = process.env.KORTYX_TEST_POSTGRES_URL;
describe.skipIf(!url)("PostgreSQL-backed agent recovery", () => {
  it("publishes rollback/fork approvals once and protects snapshot restoration before resume", async () => {
    const namespace = `agent-race-${randomUUID()}`;
    const database = postgres(url!);
    const first = createPostgresFrameworkAdapter({
      connectionString: url!,
      namespace,
    });
    const second = createPostgresFrameworkAdapter({
      connectionString: url!,
      namespace,
    });
    const workflow = defineWorkflow({
      id: "approval",
      version: "1",
      inputSchema: z.object({}),
      outputSchema: z.object({ answer: z.string() }),
      nodes: {
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
        ["__start__", "ask"],
        ["ask", "__end__"],
      ],
    });
    try {
      await first.maintenance.setup();
      const agent = createAgent({
        workflows: [workflow],
        frameworkAdapter: first,
      });
      const paused = await agent.execute({
        workflow,
        input: {},
        sessionId: "session",
      });
      if (paused.status !== "suspended")
        throw new Error(JSON.stringify(paused));
      const checkpoint = (await agent.listCheckpoints("session")).at(-1)!;
      const rollback = first.sessionCheckpoints.rollbackTo.bind(
        first.sessionCheckpoints,
      );
      const rollbackSpy = vi
        .spyOn(first.sessionCheckpoints, "rollbackTo")
        .mockImplementation(async (...args) => {
          const result = await rollback(...args);
          // Another worker consumes the published token before the agent method returns.
          const taken = await second.pendingRequests.take!(
            result.activePendingRequests[0]!.token,
          );
          expect(taken?.state?.config.executionBranchId).toBeTruthy();
          return result;
        });
      await agent.rollbackTo(checkpoint.id);
      expect(await second.pendingRequests.get(paused.resume.token)).toBeNull();
      rollbackSpy.mockRestore();
      const fork = first.sessionCheckpoints.fork.bind(first.sessionCheckpoints);
      const forkSpy = vi
        .spyOn(first.sessionCheckpoints, "fork")
        .mockImplementation(async (...args) => {
          const result = await fork(...args);
          const taken = await second.pendingRequests.take!(
            result.checkpoint.activePendingRequests[0]!.token,
          );
          expect(taken?.state?.config.executionBranchId).toBeTruthy();
          return result;
        });
      const forked = await agent.fork(checkpoint.id);
      expect(
        await second.pendingRequests.get(
          forked.checkpoint.activePendingRequests[0]!.token,
        ),
      ).toBeNull();
      forkSpy.mockRestore();
      await agent.rollbackTo(checkpoint.id);
      const held = await second.acquireRunLease!({
        runId: paused.runId,
        sessionId: "session",
        onLost: () => {},
      });
      const put = first.checkpointer.put.bind(first.checkpointer);
      const putSpy = vi.spyOn(first.checkpointer, "put");
      await expect(
        agent.resume({
          workflow,
          resume: paused.resume,
          response: { type: "text", text: "blocked" },
        }),
      ).rejects.toThrow("already executing");
      expect(putSpy).not.toHaveBeenCalled();
      expect(
        await second.pendingRequests.get(paused.resume.token),
      ).not.toBeNull();
      await held();
      putSpy.mockImplementationOnce(async (...args) => {
        await expect(
          second.sessionCheckpoints.rollbackTo(checkpoint.id),
        ).rejects.toMatchObject({ code: "SESSION_BUSY" });
        const rows =
          await database`SELECT lease_until FROM kortyx_runtime_runs WHERE scope = ${namespace} AND id = ${paused.runId}`;
        expect(Number(rows[0]!.lease_until)).toBeGreaterThan(Date.now());
        return put(...args);
      });
      const result = await agent.resume({
        workflow,
        resume: paused.resume,
        response: { type: "text", text: "protected" },
      });
      expect(result).toMatchObject({
        status: "completed",
        data: { answer: "protected" },
      });
    } finally {
      vi.restoreAllMocks();
      await Promise.all([first.close(), second.close()]);
      await database`DELETE FROM kortyx_runtime_pending_requests WHERE scope = ${namespace}`;
      await database`DELETE FROM kortyx_runtime_sessions WHERE scope = ${namespace}`;
      await database`DELETE FROM kortyx_runtime_runs WHERE scope = ${namespace}`;
      await database.end();
    }
  }, 20_000);
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
