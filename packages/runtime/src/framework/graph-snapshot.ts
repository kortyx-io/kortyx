import type { InterruptInput } from "@kortyx/core";
import { WorkflowContractError } from "@kortyx/core/errors";
import { mergeRuntimeState } from "@kortyx/utils";
import type {
  BaseCheckpointSaver,
  CheckpointTuple,
} from "@langchain/langgraph-checkpoint";

/** Internal: A submitted answer is addressed to an occurrence, never its value. */
export type ResumeDelivery = {
  id: string;
  nodeId: string;
  position: number;
  value: unknown;
  delivered: boolean;
  engineInterruptId?: string | undefined;
};

/** Internal: Backend details stay at this snapshot translation boundary. */
const COMMAND_TASK = "00000000-0000-0000-0000-000000000000";
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Internal: Legacy imports infer the outstanding occurrence from saved replay history. */
export function createResumeDelivery(
  id: string,
  nodeId: string,
  request: Pick<InterruptInput, "meta">,
  value: unknown,
  snapshot?: GraphSnapshotBundle,
): ResumeDelivery {
  const target = request.meta?.__kortyxInterruptOccurrence;
  if (
    target !== undefined &&
    (!record(target) ||
      target.nodeId !== nodeId ||
      !Number.isSafeInteger(target.position) ||
      Number(target.position) < 0)
  )
    throw new WorkflowContractError(
      "Invalid interrupt occurrence in the checkpoint. Restart the paused operation.",
    );
  let position =
    record(target) && typeof target.position === "number" ? target.position : 0;
  if (!record(target)) {
    const journal = snapshot?.checkpoint.channel_values.runtime;
    const stored = record(journal) ? journal.__kortyxParallelGraph : undefined;
    const parallel = Array.isArray(stored) ? stored[0] : stored;
    const nodes =
      record(parallel) && record(parallel.nodes) ? parallel.nodes : undefined;
    const node = nodes?.[nodeId];
    if (record(node) && Array.isArray(node.responses))
      position = node.responses.length;
    else {
      const histories =
        snapshot?.pendingWrites?.filter(
          ([task, channel, response]) =>
            task !== COMMAND_TASK &&
            channel === "__resume__" &&
            Array.isArray(response),
        ) ?? [];
      if (histories.length > 1)
        throw new WorkflowContractError(
          "Cannot identify the response occurrence in this legacy checkpoint. Restart the paused operation.",
        );
      position = histories.length ? (histories[0]![2] as unknown[]).length : 0;
    }
  }
  const interrupts = (snapshot?.pendingWrites ?? [])
    .flatMap(([, channel, entry]) => {
      if (channel !== "__interrupt__") return [];
      return Array.isArray(entry) ? entry : [entry];
    })
    .filter((entry) => record(entry) && typeof entry.id === "string");
  return {
    id,
    nodeId,
    position,
    value,
    delivered: false,
    ...(interrupts.length === 1
      ? { engineInterruptId: (interrupts[0] as { id: string }).id }
      : {}),
  };
}

/** Address the engine wake-up too; an empty/false/null answer remains a response. */
export function resumeDeliveryInput(delivery: ResumeDelivery): unknown {
  return delivery.engineInterruptId
    ? { [delivery.engineInterruptId]: delivery.value }
    : delivery.value;
}

/** Internal: Called only after the addressed response has entered its replay owner. */
export function acknowledgeResumeDelivery(
  delivery: ResumeDelivery | undefined,
  nodeId: string,
  position: number,
): void {
  if (delivery?.nodeId === nodeId && delivery.position === position)
    delivery.delivered = true;
}

/** A self-contained, JSON snapshot, including pending writes needed for replay. */
export type GraphSnapshotBundle = CheckpointTuple & {
  /** Kortyx-owned continuation state; absent in legacy engine snapshots. */
  suspension?: { version: 1; response?: ResumeDelivery };
};

/** Preserve readable legacy pauses; never guess whether an old command was consumed. */
export function prepareSuspensionSnapshot(
  snapshot: GraphSnapshotBundle,
): GraphSnapshotBundle {
  if (snapshot.suspension) {
    if (snapshot.suspension.version !== 1)
      throw new WorkflowContractError(
        "Unsupported execution suspension version.",
      );
    const response = snapshot.suspension.response;
    if (
      response !== undefined &&
      (!record(response) ||
        typeof response.id !== "string" ||
        typeof response.nodeId !== "string" ||
        !Number.isSafeInteger(response.position) ||
        response.position < 0 ||
        response.delivered !== false ||
        !Object.hasOwn(response, "value") ||
        (response.engineInterruptId !== undefined &&
          typeof response.engineInterruptId !== "string"))
    )
      throw new WorkflowContractError(
        "Invalid undelivered response in the checkpoint. Restart the paused operation.",
      );
    return snapshot;
  }
  if (
    snapshot.pendingWrites?.some(
      ([task, channel]) =>
        task === COMMAND_TASK &&
        ["__resume__", "runtime", "config"].includes(channel),
    )
  )
    throw new WorkflowContractError(
      "This legacy budget checkpoint has ambiguous pending command state. Restart the paused operation.",
    );
  return snapshot;
}

export async function captureGraphSnapshot(
  saver: BaseCheckpointSaver,
  threadId: string,
  checkpointId?: string,
  suspension?: {
    runtimePatch?: Record<string, unknown> | undefined;
    response?: ResumeDelivery | undefined;
  },
): Promise<GraphSnapshotBundle | undefined> {
  const tuple = await saver.getTuple({
    configurable: {
      thread_id: threadId,
      checkpoint_ns: "",
      ...(checkpointId ? { checkpoint_id: checkpointId } : {}),
    },
  });
  // Functions/services in GraphState.config are intentionally not persisted.
  if (!tuple) return undefined;
  const snapshot = JSON.parse(JSON.stringify(tuple)) as GraphSnapshotBundle;
  if (suspension) {
    const delivered = suspension.response;
    if (delivered?.delivered) {
      const interrupted = (snapshot.pendingWrites ?? []).filter(
        ([task, channel, value]) => {
          if (task === COMMAND_TASK || channel !== "__interrupt__")
            return false;
          const requests = Array.isArray(value) ? value : [value];
          return requests.some((entry) => {
            const request =
              record(entry) && record(entry.value) ? entry.value : undefined;
            const target =
              request && record(request.meta)
                ? request.meta.__kortyxInterruptOccurrence
                : undefined;
            return record(target)
              ? target.nodeId === delivered.nodeId &&
                  target.position === delivered.position
              : requests.length === 1;
          });
        },
      );
      // The engine's async write journal can lag the hook's acknowledgment.
      // Seal the addressed response into that task's replay history explicitly.
      if (interrupted.length === 1) {
        const task = interrupted[0]![0];
        const writes = snapshot.pendingWrites!;
        const history = writes.find(
          ([owner, channel]) => owner === task && channel === "__resume__",
        );
        const responses =
          history && Array.isArray(history[2]) ? history[2] : [];
        const runtime = snapshot.checkpoint.channel_values.runtime;
        const position =
          record(runtime) && runtime.__kortyxParallelGraph
            ? 0
            : delivered.position;
        if (responses.length === position) {
          const update: [string, string, unknown] = [
            task,
            "__resume__",
            [...responses, delivered.value],
          ];
          if (history) history[2] = update[2];
          else writes.push(update);
        }
      }
    }
    let runtime = snapshot.checkpoint.channel_values.runtime as
      | Record<string, unknown>
      | undefined;
    // Command updates may not yet be reflected in channel_values when admission
    // fails. Fold them before publishing the newest authoritative hook records.
    snapshot.pendingWrites = (snapshot.pendingWrites ?? []).filter(
      ([task, channel, value]) => {
        if (
          task === suspension.response?.engineInterruptId &&
          channel === "__resume__"
        )
          return false;
        if (task !== COMMAND_TASK) return true;
        if (channel === "runtime") {
          runtime = mergeRuntimeState(
            runtime ?? {},
            record(value) ? value : {},
          );
          return false;
        }
        return channel !== "config" && channel !== "__resume__";
      },
    );
    snapshot.checkpoint.channel_values.runtime = mergeRuntimeState(
      runtime ?? {},
      suspension.runtimePatch ?? {},
    );
    snapshot.suspension = {
      version: 1,
      ...(suspension.response && !suspension.response.delivered
        ? {
            response: JSON.parse(
              JSON.stringify(suspension.response),
            ) as ResumeDelivery,
          }
        : {}),
    };
  }
  return snapshot;
}

export async function restoreGraphSnapshot(
  saver: BaseCheckpointSaver,
  snapshot: GraphSnapshotBundle,
  threadId: string,
): Promise<void> {
  if (snapshot.suspension) prepareSuspensionSnapshot(snapshot);
  const copy = JSON.parse(JSON.stringify(snapshot)) as GraphSnapshotBundle;
  const config = await saver.put(
    { configurable: { thread_id: threadId, checkpoint_ns: "" } },
    copy.checkpoint,
    copy.metadata!,
    copy.checkpoint.channel_versions,
  );
  const reset = saver as BaseCheckpointSaver & {
    deleteCheckpointWrites?: (
      threadId: string,
      ns: string,
      id: string,
    ) => Promise<void>;
  };
  if (reset.deleteCheckpointWrites)
    await reset.deleteCheckpointWrites(threadId, "", copy.checkpoint.id);
  const writes = new Map<string, Array<[string, unknown]>>();
  for (const [task, channel, value] of copy.pendingWrites ?? []) {
    const group = writes.get(task) ?? [];
    group.push([channel, value]);
    writes.set(task, group);
  }
  for (const [task, group] of writes)
    await saver.putWrites(config, group, task);
}
