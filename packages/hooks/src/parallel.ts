import {
  isExecutionCancelled,
  isExecutionLimitReached,
  throwIfExecutionAborted,
} from "@kortyx/core";
import { getHookContext } from "./context";
import { awaitInterruptInternal } from "./interrupt";
import type { CallRecord } from "./workflow";

type ParallelRecord = {
  version: 1;
  calls: string[];
  interrupts: Array<{ callId: string; index: number }>;
};

export type ParallelGroup = {
  key: string;
  record: ParallelRecord;
  restored: boolean;
  ready: Promise<void>;
};

export type WorkflowTask = {
  id: string;
  group?: ParallelGroup;
  done: Promise<void>;
  finish: () => void;
  completed: boolean;
};

/** Internal control flow: the child snapshot is ready for its owning join. */
export class ParallelChildWaiting extends Error {}

/** All siblings have settled; results retain the order passed to parallel(). */
export class ParallelError extends AggregateError {
  constructor(
    public readonly results: readonly PromiseSettledResult<unknown>[],
  ) {
    super(
      results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      ),
      "One or more parallel operations failed.",
    );
    this.name = "ParallelError";
  }
}

export function registerWorkflowTask(id: string): WorkflowTask {
  const ctx = getHookContext();
  if (ctx.workflowControlError) throw ctx.workflowControlError;
  if (ctx.workflowContextClosed)
    throw new Error("The workflow node activation has finished.");
  const group = ctx.parallelGroup;
  if (group?.restored && !group.record.calls.includes(id)) {
    throw new Error(`Parallel call membership changed during replay: '${id}'.`);
  }
  let finish!: () => void;
  const task: WorkflowTask = {
    id,
    ...(group ? { group } : {}),
    completed: false,
    done: new Promise<void>((resolve) => {
      finish = resolve;
    }),
    finish: () => {
      task.completed = true;
      finish();
    },
  };
  ctx.workflowTasks.push(task);
  if (group && !group.record.calls.includes(id)) group.record.calls.push(id);
  return task;
}

/** Join concurrent child calls, preserving their snapshots before suspending. */
export function parallel<const T extends readonly unknown[]>(
  values: T,
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  // Observe inputs immediately, including when context/group validation rejects.
  const settled = Promise.allSettled(values);
  let ctx: ReturnType<typeof getHookContext>;
  try {
    ctx = getHookContext();
  } catch (error) {
    return Promise.reject(error);
  }
  const join = async () => {
    if (ctx.workflowControlError) throw ctx.workflowControlError;
    if (ctx.parallelGroup)
      throw new Error(
        "Await each parallel group before starting another in the same node.",
      );
    const key = `__parallel:${ctx.parallelIndex++}`;
    const saved = ctx.currentNodeState.byKey[key] as
      | ParallelRecord
      | null
      | undefined;
    const tasks = ctx.workflowTasks.filter(
      (task) => !task.completed && !task.group,
    );
    const ids = tasks.map((task) => task.id);
    if (
      saved &&
      (saved.version !== 1 || ids.some((id) => !saved.calls.includes(id)))
    ) {
      throw new Error("Parallel call membership changed during replay.");
    }
    const group: ParallelGroup = {
      key,
      record: saved ?? { version: 1, calls: ids, interrupts: [] },
      restored: Boolean(saved),
      ready: Promise.resolve(),
    };
    ctx.currentNodeState.byKey[key] = group.record;
    ctx.stateDirty = true;
    ctx.parallelGroup = group;
    for (const task of tasks) task.group = group;
    const callRecord = (id: string) =>
      ctx.currentNodeState.byKey[`__useWorkflow:${id}`] as
        | CallRecord
        | undefined;
    const bridge = async (callId: string, index: number) => {
      const interruption = callRecord(callId)?.interrupts[index];
      if (!interruption)
        throw new Error(
          "Parallel interrupt history does not match the saved child.",
        );
      try {
        interruption.response = await awaitInterruptInternal({
          request: interruption.request,
          ...(interruption.request.meta
            ? { meta: interruption.request.meta }
            : {}),
        });
      } catch (error) {
        ctx.workflowControlError = error;
        throw error;
      }
    };
    group.ready = (async () => {
      // One deterministic parent interrupt journal, independent of child finish order.
      for (const entry of group.record.interrupts)
        await bridge(entry.callId, entry.index);
    })();
    try {
      // Even a replay suspension must settle every already-created child promise.
      const [ready, outcomes] = await Promise.all([
        Promise.allSettled([group.ready]),
        settled,
      ]);
      // Also own calls made by asynchronous custom-hook wrappers in this group.
      let drained = -1;
      while (drained !== ctx.workflowTasks.length) {
        drained = ctx.workflowTasks.length;
        await Promise.all(
          ctx.workflowTasks
            .filter((task) => task.group === group)
            .map((task) => task.done),
        );
      }
      if (ready[0]?.status === "rejected") throw ready[0].reason;
      throwIfExecutionAborted(ctx.node.abortSignal);
      if (ctx.workflowControlError) throw ctx.workflowControlError;
      const rejected = outcomes.filter(
        (outcome) => outcome.status === "rejected",
      );
      const control = rejected.find(
        (outcome) =>
          isExecutionCancelled(outcome.reason) ||
          isExecutionLimitReached(outcome.reason),
      );
      if (control) {
        ctx.workflowControlError = control.reason;
        throw control.reason;
      }
      const actual = ctx.workflowTasks
        .filter((task) => task.group === group)
        .map((task) => task.id);
      if (
        group.record.calls.length !== actual.length ||
        group.record.calls.some((id) => !actual.includes(id))
      ) {
        throw new Error("Parallel call membership changed during replay.");
      }
      for (const callId of group.record.calls) {
        const record = callRecord(callId);
        if (record?.status !== "interrupted") continue;
        const index = record.interrupts.length - 1;
        if (record.interrupts[index]?.response !== undefined) continue;
        group.record.interrupts.push({ callId, index });
        await bridge(callId, index);
        // An unseen interrupt suspends; it must not become a partial result.
        throw new Error(
          "Parallel interrupt unexpectedly resumed without replay.",
        );
      }
      if (rejected.length) throw new ParallelError(outcomes);
      return outcomes.map(
        (outcome) => (outcome as PromiseFulfilledResult<unknown>).value,
      ) as { -readonly [K in keyof T]: Awaited<T[K]> };
    } finally {
      ctx.parallelGroup = undefined;
    }
  };
  const promise = join();
  ctx.parallelJoins.push(promise);
  // The node owns this join even if user code forgets to await it.
  void promise.catch(() => {});
  return promise;
}
