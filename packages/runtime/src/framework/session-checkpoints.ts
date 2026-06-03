import { randomUUID } from "node:crypto";
import type { GraphState } from "@kortyx/core";
import type { PendingRequestRecord } from "./pending-requests";

export type CheckpointId = string;

export type CheckpointSummary = {
  id: CheckpointId;
  sessionId: string;
  turnIndex: number;
  createdAt: number;
  nodes: string[];
  workflow: string;
  label?: string;
  parentCheckpointId?: string;
  parentSessionId?: string;
  forkedFrom?: string;
  workflowVersion?: string;
  buildId?: string;
};

export type SessionCheckpointRecord = CheckpointSummary & {
  runId: string;
  state: GraphState;
  effects: {
    structuredStreamIds: string[];
    interruptTokens: string[];
  };
  activePendingRequests: PendingRequestRecord[];
};

export type AppendSessionCheckpointArgs = {
  sessionId: string;
  runId: string;
  workflow: string;
  state: GraphState;
  nodes?: string[];
  structuredStreamIds?: string[];
  pendingRequests?: PendingRequestRecord[];
  label?: string;
  workflowVersion?: string;
  buildId?: string;
};

export type RollbackSessionCheckpointResult = {
  sessionId: string;
  head: CheckpointId;
  invalidatedStructuredStreamIds: string[];
  invalidatedInterruptTokens: string[];
  activePendingRequests: PendingRequestRecord[];
};

export type ForkSessionCheckpointResult = {
  sessionId: string;
  parentSessionId: string;
  forkedFrom: CheckpointId;
  checkpoint: SessionCheckpointRecord;
};

export type SessionCheckpointStore = {
  list: (sessionId: string) => Promise<CheckpointSummary[]>;
  get: (id: CheckpointId) => Promise<SessionCheckpointRecord | null>;
  getHead: (sessionId: string) => Promise<SessionCheckpointRecord | null>;
  append: (
    args: AppendSessionCheckpointArgs,
  ) => Promise<SessionCheckpointRecord>;
  rollbackTo: (id: CheckpointId) => Promise<RollbackSessionCheckpointResult>;
  fork: (
    id: CheckpointId,
    options?: { newSessionId?: string },
  ) => Promise<ForkSessionCheckpointResult>;
};

export type SessionCheckpointStoreOptions = {
  maxCheckpointsPerSession?: number;
};

const DEFAULT_MAX_CHECKPOINTS_PER_SESSION = 50;

const createCheckpointId = (): string => `cp-${randomUUID()}`;
const createSessionId = (): string => `session-${randomUUID()}`;
const createResumeToken = (): string => randomUUID();
const createRequestId = (): string => `human-${randomUUID()}`;

const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

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

const uniqueStrings = (values: Iterable<string | undefined>): string[] =>
  Array.from(
    new Set(
      Array.from(values).filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  );

export function createInMemorySessionCheckpointStore(
  options?: SessionCheckpointStoreOptions,
): SessionCheckpointStore {
  const maxCheckpointsPerSession =
    options?.maxCheckpointsPerSession ?? DEFAULT_MAX_CHECKPOINTS_PER_SESSION;
  const byId = new Map<string, SessionCheckpointRecord>();
  const bySession = new Map<string, string[]>();
  const headBySession = new Map<string, string>();

  const sortedRecords = (sessionId: string): SessionCheckpointRecord[] =>
    (bySession.get(sessionId) ?? [])
      .map((id) => byId.get(id))
      .filter((record): record is SessionCheckpointRecord => Boolean(record))
      .sort((a, b) => a.turnIndex - b.turnIndex || a.createdAt - b.createdAt);

  const saveRecord = (record: SessionCheckpointRecord): void => {
    byId.set(record.id, clone(record));
    const ids = bySession.get(record.sessionId) ?? [];
    if (!ids.includes(record.id)) ids.push(record.id);
    bySession.set(record.sessionId, ids);
    headBySession.set(record.sessionId, record.id);
  };

  const deleteRecord = (record: SessionCheckpointRecord): void => {
    byId.delete(record.id);
    bySession.set(
      record.sessionId,
      (bySession.get(record.sessionId) ?? []).filter((id) => id !== record.id),
    );
  };

  const prune = (sessionId: string): void => {
    const records = sortedRecords(sessionId);
    const overflow = Math.max(0, records.length - maxCheckpointsPerSession);
    for (const record of records.slice(0, overflow)) {
      deleteRecord(record);
    }
  };

  const getHead = async (
    sessionId: string,
  ): Promise<SessionCheckpointRecord | null> => {
    const headId = headBySession.get(sessionId);
    if (!headId) return null;
    const record = byId.get(headId);
    return record ? clone(record) : null;
  };

  return {
    async list(sessionId) {
      return sortedRecords(sessionId).map(toSummary);
    },

    async get(id) {
      const record = byId.get(id);
      return record ? clone(record) : null;
    },

    getHead,

    async append(args) {
      const previousHead = await getHead(args.sessionId);
      const turnIndex = previousHead ? previousHead.turnIndex + 1 : 0;
      const pendingRequests = args.pendingRequests ?? [];
      const record: SessionCheckpointRecord = {
        id: createCheckpointId(),
        sessionId: args.sessionId,
        runId: args.runId,
        turnIndex,
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

      saveRecord(record);
      prune(args.sessionId);
      return clone(record);
    },

    async rollbackTo(id) {
      const target = byId.get(id);
      if (!target) {
        throw new Error(`Checkpoint "${id}" not found.`);
      }

      const records = sortedRecords(target.sessionId);
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

      for (const record of trailing) deleteRecord(record);
      headBySession.set(target.sessionId, target.id);

      return {
        sessionId: target.sessionId,
        head: target.id,
        invalidatedStructuredStreamIds,
        invalidatedInterruptTokens,
        activePendingRequests: clone(target.activePendingRequests),
      };
    },

    async fork(id, options) {
      const source = byId.get(id);
      if (!source) {
        throw new Error(`Checkpoint "${id}" not found.`);
      }

      const sessionId = options?.newSessionId || createSessionId();
      const { parentCheckpointId: _parentCheckpointId, ...sourceRecord } =
        clone(source);
      const forked: SessionCheckpointRecord = {
        ...sourceRecord,
        id: createCheckpointId(),
        sessionId,
        parentSessionId: source.sessionId,
        forkedFrom: source.id,
        activePendingRequests: clone(source.activePendingRequests).map(
          (request) => ({
            ...request,
            token: createResumeToken(),
            requestId: createRequestId(),
            sessionId,
          }),
        ),
      };

      saveRecord(forked);
      return {
        sessionId,
        parentSessionId: source.sessionId,
        forkedFrom: source.id,
        checkpoint: clone(forked),
      };
    },
  };
}
