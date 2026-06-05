import { randomUUID } from "node:crypto";
import type {
  AppendSessionCheckpointArgs,
  CheckpointId,
  CheckpointSummary,
  ForkSessionCheckpointResult,
  RollbackSessionCheckpointResult,
  SessionCheckpointRecord,
  SessionCheckpointStore,
  SessionCheckpointStoreOptions,
} from "../session-checkpoints";
import type { RedisFrameworkStore } from "./redis-store";

export type RedisSessionCheckpointStoreOptions =
  SessionCheckpointStoreOptions & {
    store: RedisFrameworkStore;
    prefix?: string;
    ttlMs: number;
  };

const DEFAULT_MAX_CHECKPOINTS_PER_SESSION = 50;

const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

const uniqueStrings = (values: Iterable<string | undefined>): string[] =>
  Array.from(
    new Set(
      Array.from(values).filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  );

const createId = (prefix: string): string => {
  return `${prefix}-${randomUUID()}`;
};
const createResumeToken = (): string => randomUUID();

const toSummary = (record: SessionCheckpointRecord): CheckpointSummary => ({
  id: record.id,
  sessionId: record.sessionId,
  turnIndex: record.turnIndex,
  createdAt: record.createdAt,
  nodes: [...record.nodes],
  workflow: record.workflow,
  ...(record.label ? { label: record.label } : {}),
  ...(record.parentCheckpointId
    ? { parentCheckpointId: record.parentCheckpointId }
    : {}),
  ...(record.parentSessionId
    ? { parentSessionId: record.parentSessionId }
    : {}),
  ...(record.forkedFrom ? { forkedFrom: record.forkedFrom } : {}),
  ...(record.workflowVersion
    ? { workflowVersion: record.workflowVersion }
    : {}),
  ...(record.buildId ? { buildId: record.buildId } : {}),
});

export function createRedisSessionCheckpointStore(
  options: RedisSessionCheckpointStoreOptions,
): SessionCheckpointStore {
  const store = options.store;
  const ttlMs = options.ttlMs;
  const prefix = options.prefix ?? "kortyx:session-cp:";
  const maxCheckpointsPerSession =
    options.maxCheckpointsPerSession ?? DEFAULT_MAX_CHECKPOINTS_PER_SESSION;

  const byIdKey = (id: string) => `${prefix}by-id:${id}`;
  const sessionRecordKey = (sessionId: string, id: string) =>
    `${prefix}session:${sessionId}:${id}`;
  const sessionPrefix = (sessionId: string) => `${prefix}session:${sessionId}:`;
  const headKey = (sessionId: string) => `${prefix}head:${sessionId}`;

  const saveRecord = async (record: SessionCheckpointRecord): Promise<void> => {
    const serialized = JSON.stringify(record);
    await Promise.all([
      store.set(byIdKey(record.id), serialized, ttlMs),
      store.set(
        sessionRecordKey(record.sessionId, record.id),
        serialized,
        ttlMs,
      ),
      store.set(headKey(record.sessionId), record.id, ttlMs),
    ]);
  };

  const deleteRecord = async (
    record: SessionCheckpointRecord,
  ): Promise<void> => {
    await Promise.all([
      store.del(byIdKey(record.id)),
      store.del(sessionRecordKey(record.sessionId, record.id)),
    ]);
  };

  const getRecord = async (
    id: string,
  ): Promise<SessionCheckpointRecord | null> => {
    const raw = await store.get(byIdKey(id));
    return raw ? (JSON.parse(raw) as SessionCheckpointRecord) : null;
  };

  const sortedRecords = async (
    sessionId: string,
  ): Promise<SessionCheckpointRecord[]> => {
    const keys = await store.scanKeys(sessionPrefix(sessionId));
    const records = await Promise.all(
      keys.map(async (rawKey) => {
        const logicalKey = rawKey.includes(sessionPrefix(sessionId))
          ? rawKey.slice(rawKey.indexOf(sessionPrefix(sessionId)))
          : rawKey;
        const raw = await store.get(logicalKey);
        return raw ? (JSON.parse(raw) as SessionCheckpointRecord) : null;
      }),
    );
    return records
      .filter((record): record is SessionCheckpointRecord => Boolean(record))
      .sort((a, b) => a.turnIndex - b.turnIndex || a.createdAt - b.createdAt);
  };

  const prune = async (sessionId: string): Promise<void> => {
    const records = await sortedRecords(sessionId);
    const overflow = Math.max(0, records.length - maxCheckpointsPerSession);
    await Promise.all(records.slice(0, overflow).map(deleteRecord));
  };

  const getHead = async (
    sessionId: string,
  ): Promise<SessionCheckpointRecord | null> => {
    const headId = await store.get(headKey(sessionId));
    if (!headId) return null;
    const record = await getRecord(headId);
    return record ? clone(record) : null;
  };

  return {
    async list(sessionId) {
      return (await sortedRecords(sessionId)).map(toSummary);
    },

    async get(id) {
      const record = await getRecord(id);
      return record ? clone(record) : null;
    },

    getHead,

    async append(args: AppendSessionCheckpointArgs) {
      const previousHead = await getHead(args.sessionId);
      const pendingRequests = args.pendingRequests ?? [];
      const record: SessionCheckpointRecord = {
        id: createId("cp"),
        sessionId: args.sessionId,
        runId: args.runId,
        ...(args.graphCheckpointId
          ? { graphCheckpointId: args.graphCheckpointId }
          : {}),
        turnIndex: previousHead ? previousHead.turnIndex + 1 : 0,
        createdAt: Date.now(),
        workflow: args.workflow,
        state: clone(args.state),
        nodes: uniqueStrings(args.nodes ?? []),
        effects: {
          structuredStreamIds: uniqueStrings(args.structuredStreamIds ?? []),
          interruptTokens: uniqueStrings(
            pendingRequests.map((request) => request.token),
          ),
        },
        activePendingRequests: clone(pendingRequests),
        ...(previousHead ? { parentCheckpointId: previousHead.id } : {}),
        ...(args.label ? { label: args.label } : {}),
        ...(args.workflowVersion
          ? { workflowVersion: args.workflowVersion }
          : {}),
        ...(args.buildId ? { buildId: args.buildId } : {}),
      };

      await saveRecord(record);
      await prune(args.sessionId);
      return clone(record);
    },

    async rollbackTo(
      id: CheckpointId,
    ): Promise<RollbackSessionCheckpointResult> {
      const target = await getRecord(id);
      if (!target) throw new Error(`Checkpoint "${id}" not found.`);

      const records = await sortedRecords(target.sessionId);
      const trailing = records.filter(
        (record) => record.turnIndex > target.turnIndex,
      );
      const invalidatedStructuredStreamIds = uniqueStrings(
        trailing.flatMap((record) => record.effects.structuredStreamIds),
      );
      const invalidatedInterruptTokens = uniqueStrings(
        trailing.flatMap((record) => [
          ...record.effects.interruptTokens,
          ...record.activePendingRequests.map((request) => request.token),
        ]),
      );

      await Promise.all(trailing.map(deleteRecord));
      await store.set(headKey(target.sessionId), target.id, ttlMs);

      return {
        sessionId: target.sessionId,
        head: target.id,
        invalidatedStructuredStreamIds,
        invalidatedInterruptTokens,
        activePendingRequests: clone(target.activePendingRequests),
      };
    },

    async fork(
      id: CheckpointId,
      options?: { newSessionId?: string },
    ): Promise<ForkSessionCheckpointResult> {
      const source = await getRecord(id);
      if (!source) throw new Error(`Checkpoint "${id}" not found.`);

      const sessionId = options?.newSessionId || createId("session");
      const { parentCheckpointId: _parentCheckpointId, ...sourceRecord } =
        clone(source);
      const forked: SessionCheckpointRecord = {
        ...sourceRecord,
        id: createId("cp"),
        sessionId,
        parentSessionId: source.sessionId,
        forkedFrom: source.id,
        activePendingRequests: clone(source.activePendingRequests).map(
          (request) => ({
            ...request,
            token: createResumeToken(),
            requestId: createId("human"),
            sessionId,
          }),
        ),
      };

      await saveRecord(forked);
      return {
        sessionId,
        parentSessionId: source.sessionId,
        forkedFrom: source.id,
        checkpoint: clone(forked),
      };
    },
  };
}
