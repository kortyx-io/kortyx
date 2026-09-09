import type {
  BaseCheckpointSaver,
  CheckpointTuple,
} from "@langchain/langgraph-checkpoint";

/** A self-contained, JSON snapshot, including pending writes needed for replay. */
export type GraphSnapshotBundle = CheckpointTuple;

export async function captureGraphSnapshot(
  saver: BaseCheckpointSaver,
  threadId: string,
  checkpointId?: string,
): Promise<GraphSnapshotBundle | undefined> {
  const tuple = await saver.getTuple({
    configurable: {
      thread_id: threadId,
      checkpoint_ns: "",
      ...(checkpointId ? { checkpoint_id: checkpointId } : {}),
    },
  });
  // Functions/services in GraphState.config are intentionally not persisted.
  return tuple
    ? (JSON.parse(JSON.stringify(tuple)) as GraphSnapshotBundle)
    : undefined;
}

export async function restoreGraphSnapshot(
  saver: BaseCheckpointSaver,
  snapshot: GraphSnapshotBundle,
  threadId: string,
): Promise<void> {
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
