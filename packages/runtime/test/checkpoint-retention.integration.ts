import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { connect, createServer } from "node:net";
import { resolve } from "node:path";
import { emptyCheckpoint } from "@langchain/langgraph-checkpoint";
import postgres from "postgres";
import { expect, it } from "vitest";
import { createRedisFrameworkAdapter } from "../src/framework/adapter";
import { createPostgresFrameworkAdapter } from "../src/framework/postgres/adapter";
import { createRedisClient } from "../src/framework/redis/redis-client";

const postgresUrl = process.env.KORTYX_TEST_POSTGRES_URL!;
const redisUrl = process.env.KORTYX_TEST_REDIS_URL;
const runtime = resolve(__dirname, "../dist/index.js");
const child = (
  backend: "redis" | "postgres",
  options: Record<string, unknown>,
) =>
  spawnSync(
    process.execPath,
    [
      "--max-old-space-size=64",
      "-e",
      `
const assert = require('node:assert/strict');
const runtime = require(${JSON.stringify(runtime)});
(async () => {
 const adapter = runtime.${backend === "redis" ? "createRedisFrameworkAdapter" : "createPostgresFrameworkAdapter"}(JSON.parse(process.env.CHECKPOINT_FIXTURE_OPTIONS));
 try {
  const summaries = await adapter.sessionCheckpoints.list('fixture');
  assert.equal(summaries.length, 25);
  assert.deepEqual(summaries.map(item => item.id), Array.from({length:25}, (_, i) => 'cp-' + i));
  assert.equal(JSON.stringify(summaries).includes('private-state'), false);
  console.log('25 summaries returned');
 } finally { await adapter.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
`,
    ],
    {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 100_000,
      env: {
        ...process.env,
        CHECKPOINT_FIXTURE_OPTIONS: JSON.stringify(options),
      },
    },
  );

it(
  "projects PostgreSQL history before transferring states to a 64 MiB process",
  { timeout: 60_000 },
  async () => {
    const namespace = `summary-heap-${randomUUID()}`;
    const sql = postgres(postgresUrl, { onnotice: () => {} });
    const adapter = createPostgresFrameworkAdapter({
      connectionString: postgresUrl,
      namespace,
    });
    try {
      await adapter.maintenance.setup();
      const now = Date.now();
      await sql`INSERT INTO kortyx_runtime_sessions(scope, id, head_id, last_activity, next_turn) VALUES(${namespace}, 'fixture', 'cp-24', ${now}, 25)`;
      await sql`INSERT INTO kortyx_runtime_session_checkpoints(scope, id, session_id, run_id, created_at, turn_index, active, record)
      SELECT ${namespace}, 'cp-' || turn, 'fixture', 'run', ${now}::bigint + turn, turn, turn % 2 = 0,
       jsonb_build_object('id', 'cp-' || turn, 'sessionId', 'fixture', 'runId', 'run', 'turnIndex', turn, 'createdAt', ${now}::bigint + turn,
        'workflow', 'fixture', 'nodes', jsonb_build_array('run'), 'summaryExtension', 'preserved', 'graphCheckpointId', 'private-graph',
        'state', jsonb_build_object('payload', repeat('private-state', 262144)),
        'effects', jsonb_build_object('structuredStreamIds', jsonb_build_array(), 'interruptTokens', jsonb_build_array()), 'activePendingRequests', jsonb_build_array())
       FROM generate_series(0,24) AS turn`;
      const result = child("postgres", {
        connectionString: postgresUrl,
        namespace,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("25 summaries returned");
      const summaries = await adapter.sessionCheckpoints.list("fixture");
      for (const [index, summary] of summaries.entries()) {
        expect(summary).toMatchObject({
          summaryExtension: "preserved",
          branchStatus: index % 2 === 0 ? "active" : "abandoned",
        });
        for (const field of [
          "state",
          "effects",
          "activePendingRequests",
          "runId",
          "graphCheckpointId",
        ])
          expect(summary).not.toHaveProperty(field);
      }
      expect(
        (await adapter.sessionCheckpoints.get("cp-24"))?.state,
      ).toHaveProperty("payload");
    } finally {
      await adapter.close();
      await sql`DELETE FROM kortyx_runtime_sessions WHERE scope = ${namespace}`;
      await sql.end();
    }
  },
);

it.runIf(Boolean(redisUrl))(
  "projects Redis history sequentially within a 64 MiB process",
  { timeout: 60_000 },
  async () => {
    const prefix = `summary-heap:${randomUUID()}:`;
    const client = createRedisClient({ url: redisUrl! });
    const options = { url: redisUrl!, prefix };
    const adapter = createRedisFrameworkAdapter(options);
    const keys: string[] = [];
    try {
      for (let turn = 0; turn < 25; turn++) {
        const record = {
          id: `cp-${turn}`,
          sessionId: "fixture",
          runId: "run",
          turnIndex: turn,
          createdAt: turn,
          workflow: "fixture",
          nodes: ["run"],
          state: { payload: "private-state".repeat(262144) },
          effects: { structuredStreamIds: [], interruptTokens: [] },
          activePendingRequests: [],
        };
        const key = `${prefix}kortyx:session-cp:session:fixture:${record.id}`;
        keys.push(key);
        await client.command("SET", [
          key,
          JSON.stringify(record),
          "PX",
          "60000",
        ]);
      }
      const result = child("redis", options);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("25 summaries returned");
    } finally {
      if (keys.length) await client.command("DEL", keys);
      await client.close?.();
      await adapter.close();
    }
  },
);

it.runIf(Boolean(redisUrl))(
  "atomically expires hash writes, preserves conditionals, and isolates concurrent commands",
  async () => {
    const prefix = `journal-ttl:${randomUUID()}:`;
    const client = createRedisClient({ url: redisUrl! });
    const adapter = createRedisFrameworkAdapter({
      url: redisUrl!,
      prefix,
      ttlMs: 60_000,
    });
    try {
      const checkpoint = emptyCheckpoint();
      const config = await adapter.checkpointer.put(
        { configurable: { thread_id: "run", checkpoint_ns: "" } },
        checkpoint,
        { source: "loop", step: 0, parents: {} },
        {},
      );
      const key = `${prefix}kortyx:cp:wr:run::${checkpoint.id}`;
      await Promise.all([
        adapter.checkpointer.putWrites(
          config,
          [
            ["data", { first: true }],
            ["__error__", "first"],
          ],
          "task",
        ),
        client.command("PING"),
      ]);
      expect(await client.command("PTTL", [key])).toBeGreaterThan(0);
      await adapter.checkpointer.putWrites(
        config,
        [
          ["data", { replacement: true }],
          ["__error__", "second"],
        ],
        "task",
      );
      const saved = await adapter.checkpointer.getTuple(config);
      expect(saved?.pendingWrites).toContainEqual([
        "task",
        "data",
        { first: true },
      ]);
      expect(saved?.pendingWrites).toContainEqual([
        "task",
        "__error__",
        "second",
      ]);
      await Promise.all([
        client.transaction!([["SET", [`${prefix}outside`, "outside"]]]),
        client.command("GET", [`${prefix}outside`]),
      ]);
      expect(await client.command("GET", [`${prefix}outside`])).toBe("outside");
      await client.command("DEL", [key]);
      await adapter.checkpointer.putWrites(
        config,
        [["data", "recreated"]],
        "task",
      );
      expect(await client.command("PTTL", [key])).toBeGreaterThan(0);
      // Queue-time ACL/command failures must not commit an earlier queued write.
      await expect(
        client.transaction!([
          ["SET", [`${prefix}discarded`, "must-not-commit"]],
          ["UNKNOWN_AUDIT_COMMAND", []],
        ]),
      ).rejects.toThrow();
      expect(await client.command("GET", [`${prefix}discarded`])).toBeNull();
      await client.command("SET", [`${prefix}wrongtype`, "string"]);
      await expect(
        client.transaction!([
          ["HSET", [`${prefix}wrongtype`, "field", "value"]],
        ]),
      ).rejects.toThrow();
      expect(await client.command("PING")).toBe("PONG");
      await adapter.cleanupRun?.("run", [""]);
    } finally {
      await client.command("DEL", [
        `${prefix}outside`,
        `${prefix}discarded`,
        `${prefix}wrongtype`,
      ]);
      await adapter.close();
      await client.close?.();
    }
  },
);

it.runIf(Boolean(redisUrl))(
  "supports named ACL users without Lua and rejects expiry denial before creating a hash",
  async () => {
    const prefix = `acl-journal:${randomUUID()}:`;
    const user = `journal-${randomUUID()}`;
    const admin = createRedisClient({ url: redisUrl! });
    const url = new URL(redisUrl!);
    url.username = user;
    url.password = "fixture-password";
    const adapter = createRedisFrameworkAdapter({
      url: url.toString(),
      prefix,
    });
    const config = {
      configurable: {
        thread_id: "run",
        checkpoint_ns: "",
        checkpoint_id: "checkpoint",
      },
    };
    const key = `${prefix}kortyx:cp:wr:run::checkpoint`;
    try {
      await admin.command("ACL", [
        "SETUSER",
        user,
        "on",
        ">fixture-password",
        `~${prefix}*`,
        "+multi",
        "+exec",
        "+discard",
        "+hset",
        "+hsetnx",
      ]);
      await expect(
        adapter.checkpointer.putWrites(
          config,
          [["data", "not-committed"]],
          "task",
        ),
      ).rejects.toThrow();
      expect(await admin.command("EXISTS", [key])).toBe(0);
      await admin.command("ACL", ["SETUSER", user, "+pexpire"]);
      await adapter.checkpointer.putWrites(
        config,
        [["data", "committed"]],
        "task",
      );
      expect(await admin.command("PTTL", [key])).toBeGreaterThan(0);
    } finally {
      await adapter.close();
      await admin.command("DEL", [key]);
      await admin.command("ACL", ["DELUSER", user]);
      await admin.close?.();
    }
  },
);

it.runIf(Boolean(redisUrl) && new URL(redisUrl!).protocol === "redis:")(
  "does not create journal state when the connection drops before EXEC",
  async () => {
    const original = new URL(redisUrl!);
    const prefix = `disconnect:${randomUUID()}:`;
    const server = createServer((downstream) => {
      const upstream = connect(
        Number(original.port || 6379),
        original.hostname,
      );
      upstream.pipe(downstream);
      upstream.on("error", () => downstream.destroy());
      downstream.on("close", () => upstream.destroy());
      let buffered = Buffer.alloc(0);
      downstream.on("data", (data) => {
        buffered = Buffer.concat([buffered, data]);
        while (buffered.length) {
          const line = buffered.indexOf("\r\n");
          if (line < 0) return;
          const count = Number(buffered.subarray(1, line));
          let cursor = line + 2;
          let commandName = "";
          for (let index = 0; index < count; index++) {
            const end = buffered.indexOf("\r\n", cursor);
            if (end < 0) return;
            const size = Number(buffered.subarray(cursor + 1, end));
            if (buffered.length < end + 2 + size + 2) return;
            if (index === 0)
              commandName = buffered
                .subarray(end + 2, end + 2 + size)
                .toString();
            cursor = end + 2 + size + 2;
          }
          if (commandName === "EXEC") {
            upstream.destroy();
            downstream.destroy();
            return;
          }
          upstream.write(buffered.subarray(0, cursor));
          buffered = buffered.subarray(cursor);
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing proxy address");
    const proxyUrl = new URL(redisUrl!);
    proxyUrl.hostname = "127.0.0.1";
    proxyUrl.port = String(address.port);
    const client = createRedisClient({ url: proxyUrl.toString() });
    const admin = createRedisClient({ url: redisUrl! });
    try {
      await expect(
        client.transaction!([
          ["HSET", [prefix, "field", "must-not-commit"]],
          ["PEXPIRE", [prefix, "60000"]],
        ]),
      ).rejects.toThrow();
      expect(await admin.command("EXISTS", [prefix])).toBe(0);
      expect(await client.command("PING")).toBe("PONG");
    } finally {
      await client.close?.();
      await admin.close?.();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
