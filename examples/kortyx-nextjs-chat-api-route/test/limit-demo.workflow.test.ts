import { createAgent } from "kortyx";
import { expect, it } from "vitest";
import {
  limitDemoWorkflow,
  limitStepWorkflow,
} from "@/workflows/limit-demo.workflow";

it("runs the chat example through limit, fork and Continue without a model", async () => {
  const agent = createAgent({
    workflows: [limitDemoWorkflow, limitStepWorkflow],
    limits: { maxChildInvocations: 1 },
  });
  const stopped = await agent.execute({
    workflow: limitDemoWorkflow,
    input: "go",
  });
  expect(stopped.status).toBe("suspended");
  if (stopped.status !== "suspended") throw new Error("Expected a limit pause");
  expect(stopped.reason).toBe("limit_reached");
  const fork = await agent.fork(stopped.checkpointId!);
  const pending = fork.checkpoint.activePendingRequests[0]!;
  expect(
    await agent.resume({
      workflow: limitDemoWorkflow,
      resume: stopped.resume,
      response: { type: "select", ids: ["continue"] },
    }),
  ).toMatchObject({
    status: "completed",
    data: { steps: ["Research", "Review"] },
  });
  expect(
    await agent.resume({
      workflow: limitDemoWorkflow,
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
    data: { steps: ["Research", "Review"] },
  });
});
