import { PersistenceError } from "@kortyx/core/errors";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  copyCheckpoint,
  getCheckpointId,
  type PendingWrite,
  WRITES_IDX_MAP,
} from "@langchain/langgraph-checkpoint";
import type postgres from "postgres";
import { clone, type PostgresRuntimeStore } from "./store";

const configFor = (runId: string, ns: string, id: string): RunnableConfig => ({
  configurable: { thread_id: runId, checkpoint_ns: ns, checkpoint_id: id },
});

type StoredGraphCheckpoint = {
  checkpoint: Checkpoint;
  metadata: CheckpointMetadata;
  parentCheckpointId?: string;
};

/** Kortyx-owned checkpoint format and relational persistence, independent of LangGraph saver packages. */
export class PostgresCheckpointSaver extends BaseCheckpointSaver {
  constructor(private readonly store: PostgresRuntimeStore) {
    super({
      dumpsTyped: async (data: unknown): Promise<[string, Uint8Array]> => [
        "json",
        Buffer.from(JSON.stringify(data)),
      ],
      loadsTyped: async (_type: string, data: Uint8Array | string) =>
        JSON.parse(
          typeof data === "string" ? data : Buffer.from(data).toString("utf8"),
        ),
    });
  }

  override async getTuple(
    config: RunnableConfig,
  ): Promise<CheckpointTuple | undefined> {
    const runId = config.configurable?.thread_id as string | undefined;
    if (!runId) return undefined;
    const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
    const id = getCheckpointId(config);
    const { sql, scope } = this.store;
    const rows = await this.store.query(sql`SELECT g.id, g.position, r.revision
      FROM kortyx_runtime_graph_checkpoints g
      JOIN kortyx_runtime_runs r ON r.scope = g.scope AND r.id = g.run_id
      WHERE g.scope = ${scope} AND g.run_id = ${runId} AND g.ns = ${ns}
        AND g.record ? 'checkpoint'
        ${id ? sql`AND g.id = ${id}` : sql``}
        AND ${this.store.liveRun(sql, Date.now())}
      ORDER BY g.position DESC LIMIT 1`);
    const row = rows[0];
    if (!row) return undefined;
    // Validate existence and visibility in PostgreSQL even on a cache hit. Revision covers pending writes.
    return this.store.payload(
      ["graph", runId, ns, row.id, row.position, row.revision],
      async () => {
        const records =
          await this.store.query(sql`SELECT record FROM kortyx_runtime_graph_checkpoints
        WHERE scope = ${scope} AND run_id = ${runId} AND ns = ${ns} AND id = ${row.id}`);
        if (!records[0]) return undefined;
        const record = records[0].record as StoredGraphCheckpoint;
        const writes =
          await this.store.query(sql`SELECT task_id, channel, value FROM kortyx_runtime_graph_writes
        WHERE scope = ${scope} AND run_id = ${runId} AND ns = ${ns} AND checkpoint_id = ${row.id}
        ORDER BY task_id, idx`);
        return {
          config: configFor(runId, ns, row.id),
          checkpoint: record.checkpoint,
          metadata: record.metadata,
          ...(record.parentCheckpointId
            ? { parentConfig: configFor(runId, ns, record.parentCheckpointId) }
            : {}),
          pendingWrites: writes.map(
            (write) =>
              [
                write.task_id,
                write.channel,
                (write.value as { value: unknown }).value,
              ] as [string, string, unknown],
          ),
        };
      },
    );
  }

  override async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const { sql, scope } = this.store;
    const runId = config.configurable?.thread_id as string | undefined;
    const ns = config.configurable?.checkpoint_ns as string | undefined;
    const id = getCheckpointId(config);
    const before = options?.before
      ? getCheckpointId(options.before)
      : undefined;
    const rows =
      await this.store.query(sql`SELECT g.run_id, g.ns, g.id FROM kortyx_runtime_graph_checkpoints g
      JOIN kortyx_runtime_runs r ON r.scope = g.scope AND r.id = g.run_id
      WHERE g.scope = ${scope} AND ${this.store.liveRun(sql, Date.now())}
        AND g.record ? 'checkpoint'
        ${runId ? sql`AND g.run_id = ${runId}` : sql``}
        ${ns !== undefined ? sql`AND g.ns = ${ns}` : sql``}
        ${id ? sql`AND g.id = ${id}` : sql``}
        ${before ? sql`AND g.id < ${before}` : sql``}
        ${options?.filter ? sql`AND g.record->'metadata' @> ${sql.json(clone(options.filter))}` : sql``}
      ORDER BY g.id DESC ${options?.limit !== undefined ? sql`LIMIT ${options.limit}` : sql``}`);
    for (const row of rows) {
      const tuple = await this.getTuple(configFor(row.run_id, row.ns, row.id));
      if (tuple) yield tuple;
    }
  }

  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: Record<string, number | string>,
  ): Promise<RunnableConfig> {
    const runId = config.configurable?.thread_id as string | undefined;
    if (!runId)
      throw new PersistenceError(
        'Failed to put checkpoint: missing "thread_id".',
      );
    const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
    const parentCheckpointId = config.configurable?.checkpoint_id as
      | string
      | undefined;
    const record: StoredGraphCheckpoint = {
      checkpoint: copyCheckpoint(checkpoint),
      metadata,
      ...(parentCheckpointId ? { parentCheckpointId } : {}),
    };
    await this.store.transaction(async (sql) => {
      await this.store.touchRun(sql, runId);
      await sql`INSERT INTO kortyx_runtime_graph_checkpoints (scope, run_id, ns, id, record)
        VALUES (${this.store.scope}, ${runId}, ${ns}, ${checkpoint.id}, ${sql.json(clone(record) as unknown as postgres.JSONValue)})
        ON CONFLICT (scope, run_id, ns, id) DO UPDATE SET record = EXCLUDED.record,
          position = EXCLUDED.position`;
    });
    return configFor(runId, ns, checkpoint.id);
  }

  override async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const runId = config.configurable?.thread_id as string | undefined;
    const id = getCheckpointId(config);
    if (!runId || !id)
      throw new PersistenceError(
        'Failed to put writes: missing "thread_id" or "checkpoint_id".',
      );
    const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
    await this.store.transaction(async (sql) => {
      await this.store.touchRun(sql, runId);
      // The engine may enqueue task writes before its asynchronous checkpoint save.
      // An unreadable placeholder preserves the foreign key and cascaded cleanup;
      // put() publishes the complete record without discarding those early writes.
      await sql`INSERT INTO kortyx_runtime_graph_checkpoints (scope, run_id, ns, id, record)
        VALUES (${this.store.scope}, ${runId}, ${ns}, ${id}, ${sql.json({})})
        ON CONFLICT (scope, run_id, ns, id) DO NOTHING`;
      for (const [idx, [channel, value]] of writes.entries()) {
        const mapped = WRITES_IDX_MAP[channel] ?? idx;
        await sql`INSERT INTO kortyx_runtime_graph_writes (scope, run_id, ns, checkpoint_id, task_id, idx, channel, value)
          VALUES (${this.store.scope}, ${runId}, ${ns}, ${id}, ${taskId}, ${mapped}, ${channel}, ${sql.json({ value: clone(value ?? null) } as postgres.JSONValue)})
          ON CONFLICT (scope, run_id, ns, checkpoint_id, task_id, idx)
          ${mapped >= 0 ? sql`DO NOTHING` : sql`DO UPDATE SET channel = EXCLUDED.channel, value = EXCLUDED.value`}`;
      }
    });
  }

  override async deleteThread(runId: string): Promise<void> {
    await this.store.transaction(async (sql) => {
      await sql`DELETE FROM kortyx_runtime_runs WHERE scope = ${this.store.scope} AND id = ${runId}`;
    });
  }

  async deleteCheckpointWrites(
    runId: string,
    ns: string,
    id: string,
  ): Promise<void> {
    await this.store.transaction(async (sql) => {
      await this.store.touchRun(sql, runId);
      await sql`DELETE FROM kortyx_runtime_graph_writes
        WHERE scope = ${this.store.scope} AND run_id = ${runId} AND ns = ${ns} AND checkpoint_id = ${id}`;
    });
  }

  async getLatestCheckpointId(
    runId: string,
    ns = "",
  ): Promise<string | undefined> {
    return (
      await this.getTuple({
        configurable: { thread_id: runId, checkpoint_ns: ns },
      })
    )?.checkpoint.id;
  }
}
