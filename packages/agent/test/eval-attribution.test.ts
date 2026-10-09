import { defineWorkflow } from "@kortyx/core";
import {
  associateEvalExecution,
  getEvalAttemptId,
} from "@kortyx/core/eval-attribution";
import { createInMemoryFrameworkAdapter } from "@kortyx/runtime";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";
import {
  createEvals,
  EvalProgressSchema,
  EvalRunResultSchema,
} from "../src/evals/index";

it("automatically associates independent runtime sessions, including hooks, while isolating concurrent attempts and judge work", async () => {
  const seen: { attemptId: string | undefined; action: string }[] = [];
  const values = new Map<string, string>();
  const read = vi.fn((key: string) => values.get(key));
  const workflow = defineWorkflow({
    id: "record",
    version: "1",
    inputSchema: z.object({ key: z.string(), action: z.string() }),
    outputSchema: z.object({ value: z.string() }),
    nodes: {
      run: {
        run: async ({ input }: { input: { key: string; action: string } }) => {
          await Promise.resolve();
          seen.push({ attemptId: getEvalAttemptId(), action: input.action });
          if (input.action === "update")
            values.set(input.key, `saved-${input.key}`);
          return { data: { value: read(input.key) ?? "empty" } };
        },
      },
    },
    edges: [
      ["__start__", "run"],
      ["run", "__end__"],
    ],
  });
  const agent = createAgent({
    workflows: [workflow],
    frameworkAdapter: createInMemoryFrameworkAdapter(),
  });
  const execute = (key: string, action: string, sessionId: string) =>
    agent.execute({ workflow, input: { key, action }, sessionId });
  const progress = vi.fn();
  const late: Promise<void>[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const result = await createEvals({
    agent,
    suites: [
      {
        id: "records",
        cases: ["one", "two"].map((id) => ({
          id,
          steps: [
            {
              message: "update then verify",
              expect: { type: "answer" as const, criteria: ["saved"] },
            },
          ],
        })),
      },
    ],
    setup: async ({ case: item }) => {
      await execute(item.id, "setup", `setup-${item.id}`);
    },
    execute: async ({ case: item }) => {
      const updated = await execute(item.id, "update", `A-${item.id}`);
      const checked = await execute(item.id, "read", `B-${item.id}`);
      expect(updated.sessionId).not.toBe(checked.sessionId);
      expect(checked.status).toBe("completed");
      // Replayed association notifications must be idempotent.
      associateEvalExecution({
        sessionId: checked.sessionId,
        runId: checked.runId,
      });
      // Background work after cleanup cannot mutate an already returned result.
      late.push(
        gate.then(() =>
          associateEvalExecution({ sessionId: "late", runId: "late" }),
        ),
      );
      return {
        observation: {
          type: "answer" as const,
          text: String(read(item.id)),
          structured: [],
        },
      };
    },
    judge: {
      id: "judge",
      version: "1",
      grade: async () => {
        expect(getEvalAttemptId()).toBeUndefined();
        await execute("judge", "judge", "judge-session");
        return { passed: true, reason: "saved", evidence: [] };
      },
    },
    teardown: async ({ case: item }) => {
      await execute(item.id, "cleanup", `cleanup-${item.id}`);
    },
  }).run({ suiteId: "records", concurrency: 2, onProgress: progress });
  expect(result.status).toBe("passed");
  expect(EvalRunResultSchema.parse(result)).toEqual(result);
  expect(new Set(result.cases.map((item) => item.attemptId)).size).toBe(2);
  for (const item of result.cases) {
    expect(
      item.runtimeExecutions?.map((execution) => execution.sessionId),
    ).toEqual([
      `setup-${item.caseId}`,
      `A-${item.caseId}`,
      `B-${item.caseId}`,
      `cleanup-${item.caseId}`,
    ]);
    expect(item.sessionId).toMatch(/^eval-/);
    const events = progress.mock.calls
      .map(([event]) => EvalProgressSchema.parse(event))
      .filter(
        (event) =>
          event.type === "case-runtime-associated" &&
          event.caseId === item.caseId,
      );
    expect(events).toHaveLength(4);
    expect(
      events.every(
        (event) =>
          event.type === "case-runtime-associated" &&
          event.attemptId === item.attemptId,
      ),
    ).toBe(true);
    expect(
      seen
        .filter((entry) => entry.attemptId === item.attemptId)
        .map((entry) => entry.action),
    ).toEqual(["setup", "update", "read", "cleanup"]);
  }
  release();
  await Promise.all(late);
  expect(
    result.cases.every((item) => item.runtimeExecutions?.length === 4),
  ).toBe(true);
  expect(getEvalAttemptId()).toBeUndefined();
});
