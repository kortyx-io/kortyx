import type {
  GraphState,
  InterruptInput,
  TokenUsage,
  WorkflowDefinition,
} from "@kortyx/core";
import { isExecutionLimitReached, throwIfExecutionAborted } from "@kortyx/core";
import type { WorkflowCallService } from "@kortyx/hooks";
import { workflowCallFingerprint } from "@kortyx/hooks";
import { AsyncLocalStorageProviderSingleton } from "@langchain/core/singletons";
import { Command } from "@langchain/langgraph";
import {
  captureGraphSnapshot,
  type GraphSnapshotBundle,
  restoreGraphSnapshot,
} from "../framework/graph-snapshot";
import { createInMemoryCheckpointSaver } from "../framework/in-memory-checkpointer";
import {
  createExecutionGraph,
  type ExecutionControl,
  type ExecutionRuntimeConfig,
} from "./create-execution-graph";

type ChildSnapshot = {
  version: string;
  checkpoint: GraphSnapshotBundle;
  request?: InterruptInput;
  limitPaused?: boolean;
};

function assertSequentialWorkflow(workflow: WorkflowDefinition) {
  const groups = new Map<string, { plain: number; conditional: number }>();
  for (const [from, , condition] of workflow.edges) {
    const group = groups.get(from) ?? { plain: 0, conditional: 0 };
    if (condition) group.conditional++;
    else group.plain++;
    groups.set(from, group);
    if (group.plain > 1 || (group.plain > 0 && group.conditional > 0)) {
      throw new Error(
        `Workflow '${workflow.id}' has parallel edges; child calls require sequential graphs.`,
      );
    }
  }
}

/** Children have private engine state. Their snapshots travel in parent hook state. */
export function createWorkflowCallService(
  config: ExecutionRuntimeConfig,
  parent?: WorkflowDefinition,
  execution: ExecutionControl = {},
): WorkflowCallService {
  return async (args) => {
    const execute = async () => {
      throwIfExecutionAborted(execution.abortSignal);
      if (parent) assertSequentialWorkflow(parent);
      const depth = (config.workflowCallDepth ?? 0) + 1;
      if (depth > 16)
        throw new Error("Maximum child workflow depth (16) exceeded.");
      const workflow = await config.selectWorkflow?.(args.workflow);
      if (!workflow || workflow.id !== args.workflow)
        throw new Error(`Workflow '${args.workflow}' is not registered.`);
      if (!workflow.inputSchema || !workflow.outputSchema)
        throw new Error(
          `Callable workflow '${workflow.id}' requires inputSchema and outputSchema.`,
        );
      if (
        args.definition &&
        (args.definition.version !== workflow.version ||
          args.definition.inputSchema !== workflow.inputSchema ||
          args.definition.outputSchema !== workflow.outputSchema)
      ) {
        throw new Error(
          "The typed workflow contract does not match the registered definition.",
        );
      }
      assertSequentialWorkflow(workflow);
      const snapshot = args.snapshot as ChildSnapshot | undefined;
      if (snapshot && snapshot.version !== workflow.version)
        throw new Error(
          `Workflow '${workflow.id}' changed since the call was suspended.`,
        );
      // The checkpoint already contains parsed input. Re-running a transform
      // during resume could change its meaning or repeat validation effects.
      const input = snapshot
        ? undefined
        : workflow.inputSchema.parse(args.input);
      if (!snapshot) workflowCallFingerprint(input);
      const saver = createInMemoryCheckpointSaver();
      const threadId = "child";
      let request: InterruptInput | undefined;
      const invocationPath = `${config.invocationPath ?? "root"}/${encodeURIComponent(args.id)}:${args.invocationId}`;
      let childConfig: ExecutionRuntimeConfig = {
        executionBranchId: config.executionBranchId,
        prepareChildTelemetry: config.prepareChildTelemetry,
        context: config.context,
        session: config.session,
        selectWorkflow: config.selectWorkflow,
        getProvider: config.getProvider,
        telemetry: config.telemetry
          ? {
              ...config.telemetry,
              correlation: {
                runId: config.telemetry.correlation?.runId,
                sessionId: config.telemetry.correlation?.sessionId,
                workflowId: workflow.id,
                invocationId: args.invocationId,
                parentInvocationId: config.telemetry.correlation?.invocationId,
                branchId: config.executionBranchId ?? config.executionRunId,
              },
            }
          : undefined,
        reasonTrace: config.reasonTrace,
        checkpointer: saver,
        executionRunId: config.executionRunId,
        workflowCallDepth: depth,
        invocationPath,
        emit: (event, payload) => {
          if (event === "interrupt") {
            const original = (payload as { input: InterruptInput }).input;
            request = {
              ...original,
              meta: {
                ...original.meta,
                workflowCallPath: [
                  {
                    workflowId: workflow.id,
                    invocationId: args.invocationId,
                    callId: args.id,
                  },
                  ...(Array.isArray(original.meta?.workflowCallPath)
                    ? original.meta.workflowCallPath
                    : []),
                ],
                workflowCall: original.meta?.workflowCall ?? {
                  invocationId: args.invocationId,
                  workflowId: workflow.id,
                  nodeId: (payload as { node?: string }).node,
                },
              },
            };
            return;
          }
          if (event === "error")
            throw new Error(
              String(
                (payload as { message?: unknown }).message ??
                  "Child workflow failed.",
              ),
            );
          if (event === "transition")
            throw new Error(
              "transitionTo is not supported inside child workflows; useWorkflow returns to its caller.",
            );
          const value = payload as Record<string, unknown>;
          const scoped = { ...value, workflow: workflow.id, invocationPath };
          for (const key of ["node", "streamId", "opId", "segmentId"]) {
            if (typeof value[key] === "string")
              (scoped as Record<string, unknown>)[key] =
                `${config.executionRunId ?? "run"}/${args.invocationId}/${value[key]}`;
          }
          config.emit?.(event, scoped);
        },
      };
      childConfig =
        config.prepareChildTelemetry?.(workflow, childConfig) ?? childConfig;
      if (snapshot) {
        if (snapshot.limitPaused)
          snapshot.checkpoint.checkpoint.channel_values.config = childConfig;
        await restoreGraphSnapshot(saver, snapshot.checkpoint, threadId);
      }
      const graph = await createExecutionGraph(
        workflow,
        childConfig,
        execution,
      );
      const initial: GraphState = {
        input,
        data: {},
        runtime: {},
        config: childConfig,
        currentWorkflow: workflow.id,
        lastNode: "__start__",
        awaitingHumanInput: false,
        conversationHistory: [],
      };
      const resumePatch = snapshot?.request?.meta?.__kortyxResumeStatePatch;
      const command = snapshot?.limitPaused
        ? null
        : snapshot
          ? new Command({
              resume: args.response,
              update: {
                config: childConfig,
                ...(resumePatch ? { runtime: resumePatch } : {}),
              },
            })
          : initial;
      // Do not inherit the parent's engine task/scratchpad/callbacks. Child
      // interrupts are bridged deliberately, and child completion stays internal.
      let result: GraphState;
      try {
        result = (await AsyncLocalStorageProviderSingleton.runWithConfig(
          {},
          () =>
            graph.invoke(command, {
              configurable: { thread_id: threadId, checkpoint_ns: "" },
              callbacks: [],
            }),
        )) as GraphState;
      } catch (error) {
        const checkpoint = await captureGraphSnapshot(saver, threadId);
        const state = checkpoint?.checkpoint.channel_values as
          | GraphState
          | undefined;
        const patch = (
          error as { __kortyxHookStatePatch?: Record<string, unknown> } | null
        )?.__kortyxHookStatePatch;
        const usage = (patch?.tokenUsage ?? state?.runtime.tokenUsage) as
          | TokenUsage
          | undefined;
        if (error && typeof error === "object")
          Object.assign(error, { __kortyxChildUsage: usage });
        try {
          throwIfExecutionAborted(execution.abortSignal);
        } catch (cancelled) {
          Object.assign(cancelled as object, { __kortyxChildUsage: usage });
          throw cancelled;
        }
        if (isExecutionLimitReached(error)) {
          if (checkpoint && state) {
            if (patch) state.runtime = { ...state.runtime, ...patch };
            Object.assign(error, {
              __kortyxChildSnapshot: {
                version: workflow.version,
                checkpoint,
                limitPaused: true,
              } satisfies ChildSnapshot,
              __kortyxChildUsage: state.runtime.tokenUsage,
            });
          }
        }
        throw error;
      }
      throwIfExecutionAborted(execution.abortSignal);
      if (request) {
        const checkpoint = await captureGraphSnapshot(saver, threadId);
        if (!checkpoint)
          throw new Error("Child interrupted without a graph checkpoint.");
        return {
          status: "interrupted" as const,
          usage:
            (
              request.meta?.__kortyxResumeStatePatch as
                | { tokenUsage?: TokenUsage }
                | undefined
            )?.tokenUsage ?? result.runtime.tokenUsage,
          request,
          snapshot: {
            version: workflow.version,
            checkpoint,
            request,
          } satisfies ChildSnapshot,
        };
      }
      const data = workflow.outputSchema.parse(result.data ?? {});
      workflowCallFingerprint(data);
      return {
        status: "completed" as const,
        data,
        usage: result.runtime.tokenUsage,
      };
    };
    const trace = config.telemetry?.trace ?? config.reasonTrace;
    return trace?.withSpan
      ? trace.withSpan(
          {
            name: "kortyx.workflow.call",
            attributes: {
              workflowId: args.workflow,
              runId: config.executionRunId,
              branchId: config.executionBranchId ?? config.executionRunId,
              parentInvocationId: config.telemetry?.correlation?.invocationId,
              callerNodeExecutionId: args.callerNodeExecutionId,
              callId: args.id,
              invocationId: args.invocationId,
            },
          },
          execute,
        )
      : execute();
  };
}
