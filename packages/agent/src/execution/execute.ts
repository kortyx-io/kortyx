import type { WorkflowDefinition } from "@kortyx/core";
import { isExecutionCancelled, throwIfExecutionAborted } from "@kortyx/core";
import type { GetProviderFn } from "@kortyx/providers";
import {
  buildInitialGraphState,
  createExecutionGraph,
  type ExecutionRuntimeConfig,
  type FrameworkAdapter,
  makeRequestId,
  type PendingRequestRecord,
  type WorkflowRegistry,
} from "@kortyx/runtime";
import { z } from "zod";
import { tryPrepareResumeStream } from "../interrupt/resume-handler";
import {
  type OrchestrationOutcome,
  orchestrateGraphStream,
} from "../orchestrator";
import { prepareWorkflowTelemetry } from "../telemetry/topology";
import { parseExecutionInput, resolveExecutionWorkflow } from "./contracts";
import {
  ExecutionRequestError,
  type ExecutionResult,
  type ResumeHandle,
  type ResumeResponse,
} from "./types";

export interface ExecutionServices {
  registry: WorkflowRegistry;
  frameworkAdapter: FrameworkAdapter;
  getProvider: GetProviderFn;
  telemetry?: ExecutionRuntimeConfig["telemetry"];
  knownWorkflowIds?: readonly string[] | undefined;
}

const handleSchema = z
  .object({
    token: z.string().min(1),
    requestId: z.string().min(1),
    sessionId: z.string().min(1),
    runId: z.string().min(1),
  })
  .strict();
const responseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal("select"),
      ids: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z.object({ type: z.literal("cancel") }).strict(),
]);

export function resultFromOutcome(
  outcome: OrchestrationOutcome,
  runId: string,
  sessionId: string,
): ExecutionResult {
  const usage =
    (
      outcome.pending?.schema.meta?.__kortyxResumeStatePatch as
        | { tokenUsage?: import("@kortyx/core").TokenUsage }
        | undefined
    )?.tokenUsage ?? outcome.state.runtime?.tokenUsage;
  const info = {
    runId,
    sessionId,
    ...(outcome.checkpointId ? { checkpointId: outcome.checkpointId } : {}),
    ...(usage ? { usage } : {}),
  };
  if (isExecutionCancelled(outcome.error))
    return { ...info, status: "cancelled", reason: "Execution cancelled." };
  if (outcome.error) {
    const error = outcome.error;
    return {
      ...info,
      status: "failed",
      error: {
        code:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : "EXECUTION_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
  if (outcome.cancelled)
    return { ...info, status: "cancelled", reason: "cancelled_by_client" };
  if (outcome.pending) {
    const pending = outcome.pending;
    const meta = Object.fromEntries(
      Object.entries(pending.schema.meta ?? {}).filter(
        ([key]) => !key.startsWith("__kortyx"),
      ),
    );
    return {
      ...info,
      status: "suspended",
      interrupt: {
        workflow: pending.workflow,
        node: pending.node,
        input: {
          ...pending.schema,
          meta,
          options: pending.options.map(({ id, label, description }) => ({
            id,
            label,
            description,
          })),
        },
      },
      resume: {
        token: pending.token,
        requestId: pending.requestId,
        sessionId,
        runId,
      },
    };
  }
  return { ...info, status: "completed", data: outcome.state.data ?? {} };
}

function runtimeConfig(
  services: ExecutionServices,
  sessionId: string,
  context?: Record<string, unknown>,
): ExecutionRuntimeConfig {
  return {
    session: { id: sessionId },
    ...(context ? { context } : {}),
    getProvider: services.getProvider,
    checkpointer: services.frameworkAdapter.checkpointer,
    selectWorkflow: (id) => services.registry.select(id),
    ...(services.telemetry ? { telemetry: services.telemetry } : {}),
  };
}

export async function executeWorkflow(
  services: ExecutionServices,
  args: {
    abortSignal?: AbortSignal;
    workflow: WorkflowDefinition | string;
    input: unknown;
    sessionId?: string;
    context?: Record<string, unknown>;
  },
): Promise<ExecutionResult> {
  const select = (id: string) => services.registry.select(id);
  const workflow = await resolveExecutionWorkflow(select, args.workflow);
  const input = parseExecutionInput(workflow, args.input);
  if (args.sessionId !== undefined && !args.sessionId.trim())
    throw new ExecutionRequestError(
      "INVALID_SESSION",
      "sessionId must not be empty.",
    );
  const sessionId = args.sessionId ?? makeRequestId("session");
  const runId = makeRequestId("run");
  const config = prepareWorkflowTelemetry({
    config: {
      ...runtimeConfig(services, sessionId, args.context),
      executionContract: { id: workflow.id, version: workflow.version },
    },
    workflow,
    runId,
    sessionId,
    knownWorkflowIds: services.knownWorkflowIds,
  });
  const state = await buildInitialGraphState({
    input,
    runtime: {},
    config,
    defaultWorkflowId: workflow.id,
  });
  return new Promise<ExecutionResult>((resolve) => {
    const onOutcome = (outcome: OrchestrationOutcome) =>
      resolve(resultFromOutcome(outcome, runId, sessionId));
    void (async () => {
      throwIfExecutionAborted(args.abortSignal);
      const graph = await createExecutionGraph(workflow, config);
      await orchestrateGraphStream({
        graph,
        state,
        config,
        runId,
        sessionId,
        selectWorkflow: select,
        frameworkAdapter: services.frameworkAdapter,
        knownWorkflowIds: services.knownWorkflowIds,
        abortSignal: args.abortSignal,
        emitOutput: false,
        onOutcome,
      });
    })().catch((error) => onOutcome({ state, error }));
  });
}

export async function resumeWorkflow(
  services: ExecutionServices,
  args: {
    abortSignal?: AbortSignal;
    workflow: WorkflowDefinition | string;
    resume: ResumeHandle;
    response: ResumeResponse;
  },
): Promise<ExecutionResult> {
  const parsed = z
    .object({ resume: handleSchema, response: responseSchema })
    .safeParse(args);
  if (!parsed.success)
    throw new ExecutionRequestError("INVALID_RESUME", parsed.error.message);
  const { resume: handle, response } = parsed.data;
  const select = (id: string) => services.registry.select(id);
  const workflow = await resolveExecutionWorkflow(select, args.workflow);
  const validatePending = async (pending: PendingRequestRecord) => {
    const contract = pending.state?.config?.executionContract ?? {
      id: pending.workflow,
    };
    if (
      pending.runId !== handle.runId ||
      contract.id !== workflow.id ||
      (contract.version && contract.version !== workflow.version)
    )
      throw new ExecutionRequestError(
        "RESUME_MISMATCH",
        "Resume handle does not match the root execution and workflow version.",
      );
    if (response.type === "cancel") return;
    if (response.type === "text") {
      if (pending.schema.kind !== "text")
        throw new ExecutionRequestError(
          "INVALID_RESPONSE",
          "This interrupt requires a selection.",
        );
    } else {
      const multi =
        pending.schema.kind === "multi-choice" || pending.schema.multiple;
      if (
        pending.schema.kind === "text" ||
        (!multi && response.ids.length !== 1) ||
        new Set(response.ids).size !== response.ids.length
      )
        throw new ExecutionRequestError(
          "INVALID_RESPONSE",
          "Invalid selection for this interrupt.",
        );
      if (
        pending.options.length &&
        response.ids.some(
          (id) => !pending.options.some((option) => option.id === id),
        )
      )
        throw new ExecutionRequestError(
          "INVALID_RESPONSE",
          "Selection contains an unknown option.",
        );
    }
  };
  return new Promise<ExecutionResult>((resolve, reject) => {
    void tryPrepareResumeStream({
      abortSignal: args.abortSignal,
      meta: {
        token: handle.token,
        requestId: handle.requestId,
        selected:
          response.type === "text"
            ? [response.text]
            : response.type === "select"
              ? response.ids
              : [],
        cancel: response.type === "cancel",
      },
      sessionId: handle.sessionId,
      config: runtimeConfig(services, handle.sessionId),
      selectWorkflow: select,
      frameworkAdapter: services.frameworkAdapter,
      knownWorkflowIds: services.knownWorkflowIds,
      validatePending,
      applyResumeSelection: () => ({}),
      emitOutput: false,
      onOutcome: (outcome) =>
        resolve(resultFromOutcome(outcome, handle.runId, handle.sessionId)),
    })
      .then((stream) => {
        if (!stream)
          reject(
            new ExecutionRequestError(
              "INVALID_RESUME",
              "No waiting execution found.",
            ),
          );
      })
      .catch((error) =>
        reject(
          error instanceof ExecutionRequestError
            ? error
            : new ExecutionRequestError(
                "INVALID_RESUME",
                error instanceof Error ? error.message : String(error),
              ),
        ),
      );
  });
}
