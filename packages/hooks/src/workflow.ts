import { randomUUID } from "node:crypto";
import type {
  InterruptInput,
  TokenUsage,
  WorkflowDefinition,
} from "@kortyx/core";
import type { z } from "zod";
import { accumulateTokenUsage, getHookContext } from "./context";
import { awaitInterruptInternal } from "./interrupt";
import { emitWorkflowCall, workflowCallContent } from "./workflow-telemetry";

export type WorkflowCallOutcome =
  | {
      status: "completed";
      data: Record<string, unknown>;
      usage?: TokenUsage | undefined;
    }
  | { status: "interrupted"; request: InterruptInput; snapshot: unknown };

export type WorkflowCallService = (args: {
  id: string;
  workflow: string;
  input: unknown;
  snapshot?: unknown;
  definition?: WorkflowDefinition | undefined;
  invocationId: string;
  response?: string | string[] | undefined;
  callerNodeExecutionId?: string | undefined;
}) => Promise<WorkflowCallOutcome>;

type CallRecord = {
  fingerprint: string;
  sequence?: number;
  telemetry?: Record<string, unknown>;
  invocationId: string;
  status: "running" | "interrupted" | "completed" | "failed";
  snapshot?: unknown;
  data?: Record<string, unknown>;
  error?: string;
  interrupts: Array<{ request: InterruptInput; response?: string | string[] }>;
};

export class WorkflowCallError extends Error {
  constructor(
    public readonly workflow: string,
    message: string,
  ) {
    super(`Workflow '${workflow}': ${message}`);
    this.name = "WorkflowCallError";
  }
}

// Canonicalize JSON so object insertion order cannot change call identity.
export function workflowCallFingerprint(value: unknown): string {
  const seen = new Set<object>();
  const canonical = (v: unknown): unknown => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "object" || !v || seen.has(v)) {
      throw new Error("Workflow input and output must be JSON serializable.");
    }
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype) {
      throw new Error(
        "Workflow input and output must contain plain JSON objects.",
      );
    }
    seen.add(v);
    const result = Array.isArray(v)
      ? v.map(canonical)
      : Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((key) => [
              key,
              canonical((v as Record<string, unknown>)[key]),
            ]),
        );
    seen.delete(v);
    return result;
  };
  return JSON.stringify(canonical(value));
}

type SchematizedWorkflow = WorkflowDefinition & {
  inputSchema: z.ZodType;
  outputSchema: z.ZodType<Record<string, unknown>>;
};

/** Bind string workflow ids to the same definitions registered with the agent. */
export function createWorkflowHooks<
  const W extends Record<string, SchematizedWorkflow>,
>(workflows: W) {
  return {
    useWorkflow: <K extends keyof W & string>(args: {
      id: string;
      workflow: K;
      input: z.input<W[K]["inputSchema"]>;
    }): Promise<{ data: z.output<W[K]["outputSchema"]> }> => {
      const workflow = workflows[args.workflow];
      if (!workflow || workflow.id !== args.workflow)
        throw new Error("Workflow registry keys must match definition ids.");
      return useWorkflow({ ...args, workflow }) as Promise<{
        data: z.output<W[K]["outputSchema"]>;
      }>;
    },
  };
}

/** Typed references avoid caller-supplied result type assertions. */
export function useWorkflow<W extends SchematizedWorkflow>(args: {
  id: string;
  workflow: W;
  input: z.input<W["inputSchema"]>;
}): Promise<{ data: z.output<W["outputSchema"]> }>;
export function useWorkflow(args: {
  id: string;
  workflow: string;
  input: unknown;
}): Promise<{ data: Record<string, unknown> }>;
export async function useWorkflow(args: {
  id: string;
  workflow: string | SchematizedWorkflow;
  input: unknown;
}): Promise<{ data: Record<string, unknown> }> {
  const ctx = getHookContext();
  const service = ctx.node.callWorkflow;
  if (!service)
    throw new Error("useWorkflow requires an agent workflow registry.");
  if (!args.id.trim())
    throw new Error("useWorkflow requires a stable, nonempty id.");
  if (ctx.workflowCallActive)
    throw new Error(
      "Concurrent workflow calls are not supported; await each call.",
    );
  if (ctx.workflowCallIds.has(args.id))
    throw new Error(
      `Duplicate workflow call id '${args.id}' in one node activation.`,
    );
  if (ctx.workflowCallIds.size >= 64)
    throw new Error(
      "A node may call at most 64 child workflows per activation.",
    );
  ctx.workflowCallIds.add(args.id);
  const definition =
    typeof args.workflow === "string" ? undefined : args.workflow;
  const workflow = definition?.id ?? (args.workflow as string);
  const input = args.input;
  const fingerprint = workflowCallFingerprint({
    workflow,
    input,
    version: definition?.version ?? null,
  });
  const key = `__useWorkflow:${args.id}`;
  let record = ctx.currentNodeState.byKey[key] as CallRecord | undefined;
  if (record && record.fingerprint !== fingerprint)
    throw new WorkflowCallError(
      workflow,
      "call input or target changed during replay",
    );
  record ??= {
    fingerprint,
    invocationId: randomUUID(),
    status: "running",
    interrupts: [],
  };
  ctx.currentNodeState.byKey[key] = record;
  ctx.stateDirty = true;
  ctx.workflowCallActive = true;
  const telemetry = ctx.node.workflowCallTelemetry;
  const activationKey = "__useWorkflowActivation";
  ctx.currentNodeState.byKey[activationKey] ??= randomUUID();
  const callerNodeExecutionId = ctx.currentNodeState.byKey[
    activationKey
  ] as string;
  const metadata = {
    invocationId: record.invocationId,
    parentInvocationId: telemetry?.correlation?.invocationId ?? null,
    branchId:
      telemetry?.correlation?.branchId ??
      telemetry?.correlation?.runId ??
      "unknown",
    callId: args.id,
    callerNodeId: ctx.node.graph.node,
    callerNodeExecutionId,
    sourceWorkflowId: ctx.node.graph.name,
    targetWorkflowId: workflow,
    targetVersion: definition?.version ?? null,
  };
  record.telemetry = metadata;
  const report = (
    status:
      | "started"
      | "suspended"
      | "resumed"
      | "completed"
      | "failed"
      | "reused",
    content: Record<string, unknown> = {},
  ) => {
    record.sequence = (record.sequence ?? 0) + 1;
    emitWorkflowCall(telemetry, `workflow.call.${status}`, {
      ...metadata,
      sequence: record.sequence,
      ...content,
    });
  };
  const cached = record.status === "completed";

  try {
    // Replay every bridged interrupt, even for a completed call. The parent
    // graph assigns resume values by interrupt position within its node.
    for (const interruption of record.interrupts) {
      interruption.response = await awaitInterruptInternal({
        request: interruption.request,
        ...(interruption.request.meta
          ? { meta: interruption.request.meta }
          : {}),
      });
    }
    if (record.status === "failed")
      throw new WorkflowCallError(workflow, record.error ?? "child failed");
    while (record.status !== "completed") {
      let outcome: WorkflowCallOutcome;
      try {
        report(
          record.snapshot ? "resumed" : "started",
          workflowCallContent(telemetry, "input", input),
        );
        outcome = await service({
          callerNodeExecutionId,
          id: args.id,
          workflow,
          input,
          definition,
          invocationId: record.invocationId,
          ...(record.snapshot ? { snapshot: record.snapshot } : {}),
          ...(record.interrupts.length
            ? { response: record.interrupts.at(-1)?.response }
            : {}),
        });
      } catch (error) {
        record.status = "failed";
        record.error = error instanceof Error ? error.message : String(error);
        report("failed", { error: "Child workflow failed" });
        throw new WorkflowCallError(workflow, record.error);
      }
      if (outcome.status === "completed") {
        // Validate cached and live outputs against the caller's actual contract.
        record.data = outcome.data;
        accumulateTokenUsage(outcome.usage);
        workflowCallFingerprint(record.data);
        record.status = "completed";
        delete record.snapshot;
        report(
          "completed",
          workflowCallContent(telemetry, "output", record.data),
        );
      } else {
        record.status = "interrupted";
        record.snapshot = outcome.snapshot;
        report("suspended", {
          leaf: outcome.request.meta?.workflowCall ?? null,
        });
        const interruption: CallRecord["interrupts"][number] = {
          request: outcome.request,
        };
        record.interrupts.push(interruption);
        interruption.response = await awaitInterruptInternal({
          request: interruption.request,
          ...(interruption.request.meta
            ? { meta: interruption.request.meta }
            : {}),
        });
      }
    }
    if (cached)
      report("reused", workflowCallContent(telemetry, "output", record.data));
    const data = record.data ?? {};
    return {
      data: JSON.parse(JSON.stringify(data)) as Record<string, unknown>,
    };
  } finally {
    ctx.workflowCallActive = false;
  }
}
