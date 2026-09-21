import type { WorkflowDefinition } from "@kortyx/core";
import { createExecutionGraph, type FrameworkAdapter } from "@kortyx/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseResumeMeta,
  tryPrepareResumeStream,
} from "../src/interrupt/resume-handler";
import { orchestrateGraphStream } from "../src/orchestrator";

const mocks = vi.hoisted(() => ({
  createExecutionGraph: vi.fn(async () => ({
    config: {},
    streamEvents: vi.fn(),
  })),
  orchestrateGraphStream: vi.fn(async function* () {
    yield { type: "done" };
  }),
}));

vi.mock("@kortyx/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@kortyx/runtime")>();
  return {
    ...actual,
    createExecutionGraph: mocks.createExecutionGraph,
  };
});

vi.mock("../src/orchestrator", () => ({
  orchestrateGraphStream: mocks.orchestrateGraphStream,
}));

const workflowDefinition = (id: string): WorkflowDefinition => ({
  id,
  version: "1.0.0",
  nodes: {},
  edges: [],
});

const pendingBase = {
  token: "token-1",
  requestId: "request-1",
  sessionId: "session-1",
  runId: "run-1",
  workflow: "workflow-1",
  node: "node-1",
  state: {
    input: "previous",
    lastNode: "node-1",
    currentWorkflow: "workflow-1",
    config: {},
    runtime: {},
    conversationHistory: [],
    awaitingHumanInput: true,
    data: { existing: true },
  },
  schema: {
    kind: "choice",
    multiple: false,
    question: "Choose",
  },
  options: [],
  createdAt: 1,
  ttlMs: 100,
};

describe("parseResumeMeta", () => {
  it("preserves a structured custom interrupt response", () => {
    expect(
      parseResumeMeta({
        role: "user",
        content: "Selected job",
        metadata: {
          resume: {
            token: "t",
            requestId: "r",
            value: { type: "select", jobId: "job-2" },
          },
        },
      }),
    ).toEqual({
      token: "t",
      requestId: "r",
      selected: [],
      cancel: false,
      hasValue: true,
      value: { type: "select", jobId: "job-2" },
    });
  });

  it("normalizes supported resume metadata shapes", () => {
    expect(parseResumeMeta(undefined)).toBeNull();
    expect(parseResumeMeta({ role: "user", content: "x" })).toBeNull();
    expect(
      parseResumeMeta({
        role: "user",
        content: "x",
        metadata: { resume: "bad" },
      }),
    ).toBeNull();
    expect(
      parseResumeMeta({
        role: "user",
        content: "x",
        metadata: { resume: { token: "", requestId: "r" } },
      }),
    ).toBeNull();
    expect(
      parseResumeMeta({
        role: "user",
        content: "x",
        metadata: { resume: { token: 1, requestId: 2 } },
      }),
    ).toBeNull();
    expect(
      parseResumeMeta({
        role: "user",
        content: "x",
        metadata: {
          resume: {
            token: "t",
            requestId: "r",
            selected: "one",
            cancel: true,
          },
        },
      }),
    ).toEqual({ token: "t", requestId: "r", selected: ["one"], cancel: true });
    expect(
      parseResumeMeta({
        role: "user",
        content: "x",
        metadata: {
          resume: { token: "t", requestId: "r", selected: [1, "two"] },
        },
      }),
    ).toEqual({
      token: "t",
      requestId: "r",
      selected: ["1", "two"],
      cancel: false,
    });
    expect(
      parseResumeMeta({
        role: "user",
        content: "x",
        metadata: {
          resume: { token: "t", requestId: "r", choice: { id: "choice-id" } },
        },
      }),
    ).toEqual({
      token: "t",
      requestId: "r",
      selected: ["choice-id"],
      cancel: false,
    });
    expect(
      parseResumeMeta({
        role: "user",
        content: "x",
        metadata: {
          resume: {
            token: "t",
            requestId: "r",
            choices: [{ id: "a" }, { nope: true }, "bad", { id: "b" }],
          },
        },
      }),
    ).toEqual({
      token: "t",
      requestId: "r",
      selected: ["a", "b"],
      cancel: false,
    });
  });
});

describe("tryPrepareResumeStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createExecutionGraph.mockResolvedValue({
      config: {},
      streamEvents: vi.fn(),
    });
    mocks.orchestrateGraphStream.mockImplementation(async function* () {
      yield { type: "done" };
    });
  });

  it("acquires protection before consuming approval and transfers the lease to execution", async () => {
    const release = vi.fn(async () => {});
    const order: string[] = [];
    const store = {
      get: vi.fn(async () => pendingBase),
      take: vi.fn(async () => {
        order.push("take");
        return {
          ...pendingBase,
          state: { ...pendingBase.state, data: { authoritative: true } },
        };
      }),
      delete: vi.fn(async () => {}),
      save: vi.fn(async () => {}),
    };
    const acquire = vi.fn(async () => {
      order.push("lease");
      return release;
    });
    await tryPrepareResumeStream({
      meta: {
        token: pendingBase.token,
        requestId: pendingBase.requestId,
        selected: [],
      },
      sessionId: pendingBase.sessionId,
      config: {},
      selectWorkflow: async (id) => workflowDefinition(id),
      frameworkAdapter: {
        pendingRequests: store,
        acquireRunLease: acquire,
      } as unknown as FrameworkAdapter,
    });
    expect(order).toEqual(["lease", "take"]);
    expect(mocks.orchestrateGraphStream).toHaveBeenCalledWith(
      expect.objectContaining({
        executionLeaseRelease: release,
        state: expect.objectContaining({ data: { authoritative: true } }),
      }),
    );
    expect(release).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("does not consume or recreate an approval when lease acquisition or atomic consumption fails", async () => {
    const release = vi.fn(async () => {});
    const store = {
      get: vi.fn(async () => pendingBase),
      take: vi.fn(async () => null),
      save: vi.fn(async () => {}),
    };
    const acquire = vi.fn(async () => release);
    const args = {
      meta: {
        token: pendingBase.token,
        requestId: pendingBase.requestId,
        selected: [],
      },
      sessionId: pendingBase.sessionId,
      config: {},
      selectWorkflow: vi.fn(),
      frameworkAdapter: {
        pendingRequests: store,
        acquireRunLease: acquire,
      } as unknown as FrameworkAdapter,
    };
    acquire.mockRejectedValueOnce(new Error("already executing"));
    await expect(tryPrepareResumeStream(args)).rejects.toThrow(
      "already executing",
    );
    expect(store.take).not.toHaveBeenCalled();
    await expect(tryPrepareResumeStream(args)).rejects.toThrow(
      "already been resumed",
    );
    expect(store.save).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect(mocks.orchestrateGraphStream).not.toHaveBeenCalled();
  });

  it("releases preparation leases after cancellation or errors and does not republish after ownership loss", async () => {
    const release = vi.fn(async () => {});
    const store = {
      get: vi.fn(async () => pendingBase),
      take: vi.fn(async () => pendingBase),
      delete: vi.fn(async () => {}),
      save: vi.fn(async () => {}),
    };
    let lose: (cause: unknown) => void = () => {};
    const acquire = vi.fn(
      async (args: { onLost: (cause: unknown) => void }) => {
        lose = args.onLost;
        return release;
      },
    );
    const args = {
      meta: {
        token: pendingBase.token,
        requestId: pendingBase.requestId,
        selected: [],
      },
      sessionId: pendingBase.sessionId,
      config: {},
      selectWorkflow: vi.fn(async (id: string) => workflowDefinition(id)),
      frameworkAdapter: {
        pendingRequests: store,
        acquireRunLease: acquire,
      } as unknown as FrameworkAdapter,
    };
    await tryPrepareResumeStream({
      ...args,
      meta: { ...args.meta, cancel: true },
    });
    expect(release).toHaveBeenCalledTimes(1);
    args.selectWorkflow.mockRejectedValueOnce(new Error("preparation failed"));
    await expect(tryPrepareResumeStream(args)).rejects.toThrow(
      "preparation failed",
    );
    expect(store.save).toHaveBeenCalledTimes(1);
    args.selectWorkflow.mockImplementationOnce(async (id) => {
      lose(new Error("lease lost"));
      return workflowDefinition(id);
    });
    await expect(tryPrepareResumeStream(args)).rejects.toThrow("lease lost");
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(3);
  });

  it("resumes legacy requests without a saved state", async () => {
    const { state: _state, ...pending } = pendingBase;
    const store = {
      get: vi.fn(async () => pending),
      delete: vi.fn(async () => undefined),
    };
    await tryPrepareResumeStream({
      meta: {
        token: pending.token,
        requestId: pending.requestId,
        selected: ["yes"],
      },
      sessionId: pending.sessionId,
      config: {},
      selectWorkflow: async (id) => workflowDefinition(id),
      frameworkAdapter: {
        pendingRequests: store,
      } as unknown as FrameworkAdapter,
    });
    expect(mocks.orchestrateGraphStream).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({ input: "" }),
      }),
    );
  });

  it("ignores non-resume messages and missing stores", async () => {
    await expect(
      tryPrepareResumeStream({
        lastMessage: { role: "user", content: "hello" },
        sessionId: "session-1",
        config: {},
        selectWorkflow: vi.fn(),
      }),
    ).resolves.toBeNull();

    await expect(
      tryPrepareResumeStream({
        lastMessage: {
          role: "user",
          content: "resume",
          metadata: { resume: { token: "token-1", requestId: "request-1" } },
        },
        sessionId: "session-1",
        config: {},
        selectWorkflow: vi.fn(),
      }),
    ).resolves.toBeNull();
  });

  it("rejects expired/mismatched requests and terminates cancellation without a new run", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const store = {
      get: vi.fn(async () => ({ ...pendingBase, requestId: "other" })),
      delete: vi.fn(async () => undefined),
    };

    await expect(
      tryPrepareResumeStream({
        lastMessage: {
          role: "user",
          content: "resume",
          metadata: { resume: { token: "token-1", requestId: "request-1" } },
        },
        sessionId: "session-1",
        config: {},
        selectWorkflow: vi.fn(),
        frameworkAdapter: {
          pendingRequests: store,
        } as unknown as FrameworkAdapter,
      }),
    ).rejects.toThrow("Interrupt is expired");

    store.get.mockResolvedValueOnce({
      ...pendingBase,
      schema: {
        ...pendingBase.schema,
        contract: "approval",
      } as typeof pendingBase.schema & { contract: string },
    });
    await expect(
      tryPrepareResumeStream({
        lastMessage: {
          role: "user",
          content: "resume",
          metadata: {
            resume: { token: "token-1", requestId: "request-1", cancel: true },
          },
        },
        sessionId: "session-1",
        config: {},
        selectWorkflow: vi.fn(),
        frameworkAdapter: {
          pendingRequests: store,
        } as unknown as FrameworkAdapter,
      }),
    ).resolves.not.toBeNull();
    expect(store.delete).toHaveBeenCalledWith("token-1");

    log.mockRestore();
  });

  it("prepares resume graphs with selected values and state patches", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const pending = {
      ...pendingBase,
      graphCheckpointId: "graph-cp-1",
      schema: {
        ...pendingBase.schema,
        kind: "multi-choice",
        meta: { __kortyxResumeStatePatch: { step: "patched" } },
      },
      state: {
        ...pendingBase.state,
        data: { existing: true },
      },
    };
    const store = {
      get: vi.fn(async () => pending),
      delete: vi.fn(async () => undefined),
    };
    const selectWorkflow = vi.fn(async (id: string) => workflowDefinition(id));
    const applyResumeSelection = vi.fn(() => ({ custom: "value" }));

    const stream = await tryPrepareResumeStream({
      lastMessage: {
        role: "user",
        content: "resume",
        metadata: {
          resume: {
            token: "token-1",
            requestId: "request-1",
            selected: ["a", "b"],
          },
        },
      },
      sessionId: "session-1",
      config: { feature: true },
      selectWorkflow,
      defaultWorkflowId: "fallback-workflow",
      applyResumeSelection,
      frameworkAdapter: {
        pendingRequests: store,
      } as unknown as FrameworkAdapter,
    });

    expect(stream).not.toBeNull();
    expect(applyResumeSelection).toHaveBeenCalledWith({
      pending,
      selected: ["a", "b"],
    });
    expect(selectWorkflow).toHaveBeenCalledWith("workflow-1");
    expect(createExecutionGraph).toHaveBeenCalledWith(
      workflowDefinition("workflow-1"),
      {
        feature: true,
        resume: true,
        resumeValue: ["a", "b"],
        resumeCheckpointId: "graph-cp-1",
        resumeUpdate: {
          data: { existing: true, custom: "value" },
          runtime: { step: "patched" },
        },
      },
    );
    expect(store.delete).toHaveBeenCalledWith("token-1");
    expect(orchestrateGraphStream).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        runId: "run-1",
        state: expect.objectContaining({
          currentWorkflow: "workflow-1",
          data: { existing: true, custom: "value" },
        }),
        config: expect.objectContaining({
          resume: true,
          resumeValue: ["a", "b"],
          resumeCheckpointId: "graph-cp-1",
        }),
      }),
    );

    log.mockRestore();
  });

  it("falls back to coordinates data and default workflow ids", async () => {
    const pending = {
      ...pendingBase,
      workflow: "",
      schema: {
        ...pendingBase.schema,
        kind: "choice",
        meta: "not-object",
      },
      state: {
        ...pendingBase.state,
        data: undefined,
      },
    };
    const store = {
      get: vi.fn(async () => pending),
      delete: vi.fn(async () => undefined),
    };
    const selectWorkflow = vi.fn(async (id: string) => workflowDefinition(id));

    await tryPrepareResumeStream({
      lastMessage: {
        role: "user",
        content: "resume",
        metadata: {
          resume: {
            token: "token-1",
            requestId: "request-1",
            selected: ["c7"],
          },
        },
      },
      sessionId: "session-1",
      config: {},
      selectWorkflow,
      defaultWorkflowId: "fallback-workflow",
      frameworkAdapter: {
        pendingRequests: store,
      } as unknown as FrameworkAdapter,
    });

    expect(selectWorkflow).toHaveBeenCalledWith("fallback-workflow");
    expect(createExecutionGraph).toHaveBeenCalledWith(
      workflowDefinition("fallback-workflow"),
      {
        resume: true,
        resumeValue: "c7",
        resumeUpdate: { data: { coordinates: "c7" } },
      },
    );
  });

  it("supports empty selections without resume values or updates", async () => {
    const pending = {
      ...pendingBase,
      workflow: " ",
      state: {
        ...pendingBase.state,
        data: "not-object",
      },
    };
    const store = {
      get: vi.fn(async () => pending),
      delete: vi.fn(async () => undefined),
    };
    const selectWorkflow = vi.fn(async (id: string) => workflowDefinition(id));

    await tryPrepareResumeStream({
      lastMessage: {
        role: "user",
        content: "resume",
        metadata: {
          resume: {
            token: "token-1",
            requestId: "request-1",
            selected: [],
          },
        },
      },
      sessionId: "session-1",
      config: {},
      selectWorkflow,
      frameworkAdapter: {
        pendingRequests: store,
      } as unknown as FrameworkAdapter,
    });

    expect(selectWorkflow).toHaveBeenCalledWith("job-search");
    expect(createExecutionGraph).toHaveBeenCalledWith(
      workflowDefinition("job-search"),
      { resume: true },
    );
  });

  it("ignores non-object resume patches and omits framework adapter when absent", async () => {
    const pending = {
      ...pendingBase,
      schema: {
        ...pendingBase.schema,
        kind: "choice",
        meta: { __kortyxResumeStatePatch: "bad" },
      },
    };
    const store = {
      get: vi.fn(async () => pending),
      delete: vi.fn(async () => undefined),
    };
    const selectWorkflow = vi.fn(async (id: string) => workflowDefinition(id));

    await tryPrepareResumeStream({
      lastMessage: {
        role: "user",
        content: "resume",
        metadata: {
          resume: {
            token: "token-1",
            requestId: "request-1",
            selected: ["value"],
          },
        },
      },
      sessionId: "session-1",
      config: {},
      selectWorkflow,
      applyResumeSelection: () => null,
      frameworkAdapter: {
        pendingRequests: store,
      } as unknown as FrameworkAdapter,
    });

    expect(createExecutionGraph).toHaveBeenCalledWith(
      workflowDefinition("workflow-1"),
      { resume: true, resumeValue: "value" },
    );
    expect(orchestrateGraphStream).toHaveBeenCalledWith(
      expect.not.objectContaining({ frameworkAdapter: undefined }),
    );
  });

  it("captures a human response only when input content capture is enabled", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const store = {
      get: vi.fn(async () => pendingBase),
      delete: vi.fn(async () => undefined),
    };

    await tryPrepareResumeStream({
      lastMessage: {
        role: "user",
        content: "resume",
        metadata: {
          resume: {
            token: "token-1",
            requestId: "request-1",
            selected: ["private-choice"],
          },
        },
      },
      sessionId: "session-1",
      config: {
        telemetry: {
          environment: "test",
          service: { name: "app" },
          captureContent: { input: true, output: false },
          correlation: { runId: "run-1", workflowId: "workflow-1" },
          reporter: {
            ensureWorkflowTopology: async () => ({
              workflowRevisionId: "revision-1",
              created: false,
            }),
            emit: async (events: Array<Record<string, unknown>>) => {
              emitted.push(...events);
            },
          },
        },
      },
      selectWorkflow: vi.fn(async (id: string) => workflowDefinition(id)),
      frameworkAdapter: {
        pendingRequests: store,
      } as unknown as FrameworkAdapter,
    });

    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "interrupt.resolved",
        payload: expect.objectContaining({
          response: "private-choice",
          responseCaptured: true,
        }),
      }),
    );
  });

  it("captures structured contract responses and carries contract identity into resumed telemetry", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const pending = {
      ...pendingBase,
      schema: {
        ...pendingBase.schema,
        kind: "custom",
        contract: "jobPicker",
        schemaId: "wolly.job-picker",
        schemaVersion: "1",
        request: { question: "Which engineering job?" },
      },
    };
    const store = {
      get: vi.fn(async () => pending),
      delete: vi.fn(async () => undefined),
    };

    await tryPrepareResumeStream({
      lastMessage: {
        role: "user",
        content: "Selected job",
        metadata: {
          resume: {
            token: "token-1",
            requestId: "request-1",
            value: { type: "select", jobId: "job-2" },
          },
        },
      },
      sessionId: "session-1",
      config: {
        telemetry: {
          environment: "test",
          service: { name: "app" },
          captureContent: { input: true, output: false },
          correlation: { runId: "run-1", workflowId: "workflow-1" },
          reporter: {
            ensureWorkflowTopology: async () => ({
              workflowRevisionId: "revision-1",
              created: false,
            }),
            emit: async (events: Array<Record<string, unknown>>) => {
              emitted.push(...events);
            },
          },
        },
      },
      selectWorkflow: vi.fn(async (id: string) => workflowDefinition(id)),
      frameworkAdapter: {
        pendingRequests: store,
      } as unknown as FrameworkAdapter,
    });

    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "interrupt.resolved",
        payload: expect.objectContaining({
          contract: "jobPicker",
          schemaId: "wolly.job-picker",
          schemaVersion: "1",
          responseCaptured: true,
          responseValue: { type: "select", jobId: "job-2" },
        }),
      }),
    );
    expect(orchestrateGraphStream).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          telemetryInterruptContract: "jobPicker",
          telemetryInterruptSchemaId: "wolly.job-picker",
          telemetryInterruptSchemaVersion: "1",
        }),
      }),
    );
  });
});
