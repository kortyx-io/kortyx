import { createEvals, getEvalSuiteRevision } from "@kortyx/agent";
import type { EvalSuite } from "@kortyx/agent/evals";
import type { TelemetryDb } from "@kortyx/telemetry-db";
import {
  createUsageTelemetry,
  type UsageRecord,
} from "@kortyx/usage-telemetry";
import { configureUsageTelemetry } from "@kortyx/usage-telemetry/node";
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
    let commit!: () => void;
    const persisted = new Promise<void>((resolve) => {
      commit = resolve;
    });
    const finish = vi.fn(async () => {
      complete();
      await persisted;
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
    const records: UsageRecord[] = [];
    const usage = createUsageTelemetry({
      context: {
        product: "oss_studio",
        component: "studio_api",
        version: "1.0.0",
      },
      identity: () => crypto.randomUUID(),
      transport: async (batch) => {
        records.push(...batch);
      },
    });
    configureUsageTelemetry("studio_api", usage);
    const worker = createEvalWorker({} as TelemetryDb, [], undefined, {
      store,
      resolveTarget,
      request,
      usage,
    });
    worker.start();
    try {
      await done;
      await usage.flush();
      expect(records).toHaveLength(0); // Request completion is not durable completion.
      commit();
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
      commit();
      await worker.stop();
      await usage.flush();
      usage.dispose();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        operation: "studio.eval.execution",
        outcome: "success",
        count: 1,
        properties: { measurement_kind: "execution", origin: "server" },
      });
      expect(JSON.stringify(records)).not.toContain("Hello");
      expect(JSON.stringify(records)).not.toContain("org-a");
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
    const records: UsageRecord[] = [];
    const usage = createUsageTelemetry({
      context: {
        product: "oss_studio",
        component: "studio_api",
        version: "1.0.0",
      },
      identity: () => crypto.randomUUID(),
      transport: async (batch) => {
        records.push(...batch);
      },
    });
    configureUsageTelemetry("studio_api", usage);
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
      await usage.flush();
      usage.dispose();
      expect(records).toHaveLength(0); // A custom store retains ownership of its existing emitter.
    }
  });
});
it("does not report a terminal result when durable finish rejects", async () => {
  const records: UsageRecord[] = [];
  const usage = createUsageTelemetry({
    context: {
      product: "oss_studio",
      component: "studio_api",
      version: "1.0.0",
    },
    identity: () => crypto.randomUUID(),
    transport: async (batch) => {
      records.push(...batch);
    },
  });
  let finished!: () => void;
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const worker = createEvalWorker({} as TelemetryDb, [], undefined, {
    usage,
    store: {
      claim: vi
        .fn()
        .mockResolvedValueOnce({ id: "private-run", request: {} })
        .mockResolvedValue(undefined),
      heartbeat: vi.fn(),
      progress: vi.fn(),
      finish: async () => {
        finished();
        throw new Error("private-storage-failure");
      },
    },
    resolveTarget: async () => {
      throw new Error("private-target-failure");
    },
  });
  worker.start();
  try {
    await done;
  } finally {
    await worker.stop();
    await usage.flush();
    usage.dispose();
  }
  expect(records).toHaveLength(0);
});
