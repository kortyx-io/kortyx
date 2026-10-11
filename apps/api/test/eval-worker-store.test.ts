import { createEvals, getEvalSuiteRevision } from "@kortyx/agent";
import type { EvalSuite } from "@kortyx/agent/evals";
import type { TelemetryDb } from "@kortyx/telemetry-db";
import { describe, expect, it, vi } from "vitest";
import {
  createEvalWorker,
  type EvalJobStore,
  type EvalWorkerRun,
} from "../src/evals/worker";

describe("restricted evaluation job store composition", () => {
  it("runs the SDK protocol through injected transport/store without broad database access", async () => {
    const suite: EvalSuite = {
      id: "smoke",
      cases: [
        {
          id: "answer",
          steps: [{ message: "Hello", expect: { type: "answer" } }],
        },
      ],
    };
    const result = await createEvals({
      agent: { streamChat: vi.fn() },
      suites: [suite],
      execute: () => ({
        observation: { type: "answer", text: "Hello", structured: [] },
      }),
    }).run({ suiteId: suite.id });
    const run = {
      id: "11111111-1111-4111-8111-111111111111",
      organizationId: "org-a",
      projectId: "project-a",
      environment: "default",
      targetId: "endpoint-a",
      suiteId: suite.id,
      suiteRevision: getEvalSuiteRevision(suite),
      suite,
      request: {
        suiteId: suite.id,
        suiteRevision: getEvalSuiteRevision(suite),
        repetitions: 1,
        concurrency: 1,
        grading: "app",
      },
    } as EvalWorkerRun;
    let complete!: () => void;
    const done = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const finish = vi.fn(async () => {
      complete();
    });
    const claim = vi
      .fn()
      .mockResolvedValueOnce(run)
      .mockResolvedValue(undefined);
    const store: EvalJobStore = {
      claim,
      finish,
      heartbeat: vi.fn(async () => ({ cancelRequestedAt: null })),
      progress: vi.fn(),
    };
    const target = {
      id: run.targetId,
      name: "Endpoint",
      organizationId: run.organizationId,
      projectId: run.projectId,
      environment: "default",
      url: "https://example.test/evals",
      serviceKey: "private",
      allowInsecureHttp: false,
    };
    const resolveTarget = vi.fn(async () => target);
    const request = vi.fn(
      async () =>
        new Response(`${JSON.stringify({ type: "result", result })}\n`, {
          headers: { "content-type": "application/x-ndjson" },
        }),
    );
    const worker = createEvalWorker({} as TelemetryDb, [], undefined, {
      store,
      resolveTarget,
      request,
    });
    worker.start();
    try {
      await done;
      expect(finish).toHaveBeenCalledWith(run.id, expect.any(String), {
        result,
      });
      expect(resolveTarget).toHaveBeenCalledWith(run, expect.any(String));
      expect(request).toHaveBeenCalledWith(
        target,
        JSON.stringify(run.request),
        expect.any(AbortSignal),
        run.id,
      );
    } finally {
      await worker.stop();
    }
  });
  it("does not send a request if lease-bound target resolution fails", async () => {
    let complete!: () => void;
    const done = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const store: EvalJobStore = {
      claim: vi
        .fn()
        .mockResolvedValueOnce({ id: "run", request: {} })
        .mockResolvedValue(undefined),
      heartbeat: vi.fn(),
      progress: vi.fn(),
      finish: vi.fn(async () => {
        complete();
      }),
    };
    const request = vi.fn();
    const worker = createEvalWorker({} as TelemetryDb, [], undefined, {
      store,
      request,
      resolveTarget: async () => {
        throw new Error("Lease lost");
      },
    });
    worker.start();
    try {
      await done;
      expect(request).not.toHaveBeenCalled();
      expect(store.finish).toHaveBeenCalledWith(
        "run",
        expect.any(String),
        expect.objectContaining({ error: expect.any(String) }),
      );
    } finally {
      await worker.stop();
    }
  });
});
