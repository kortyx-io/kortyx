// Supported tool execution through the actual SDK, telemetry API, database and Studio.
// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks execute on the server.
// biome-ignore-all lint/style/noNonNullAssertion: These probes assert the concrete Studio adapter and fixture data.
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";
import {
  type KortyxTelemetryEvent,
  type StudioDetailEvent,
  TelemetryEventSchema,
} from "@kortyx/telemetry-contracts";
import {
  createTelemetryApiKey,
  createTelemetryDbClient,
  ensureLocalDevelopmentProject,
} from "@kortyx/telemetry-db";
import {
  createAgent,
  createInMemoryFrameworkAdapter,
  defineWorkflow,
  parallel,
  useInterrupt,
  useReason,
  useTool,
  useWorkflow,
} from "kortyx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../../apps/api/src/app";
import { TooltipProvider } from "../../apps/studio/src/components/ui/tooltip";
import { RunTrace } from "../../apps/studio/src/features/runs/components/run-trace";
import { buildEventStory } from "../../apps/studio/src/features/runs/lib/run-event-story";
import { buildTraceStory } from "../../apps/studio/src/features/runs/lib/run-trace-story";
import { projectWorkflowTopology } from "../../packages/agent/src/telemetry/topology";
import { z } from "../../packages/core/node_modules/zod";
import { createProvider } from "../../packages/hooks/test/helpers";
import type { KortyxTelemetryAdapter } from "../../packages/telemetry/src/types";

// Only the URL state hook needs a browser. Trace construction and JSX remain real.
vi.mock("@/lib/nuqs", () => ({
  useStudioQueryStates: () => [{ trace: "" }, vi.fn()],
}));

const denial = { status: "DENIED", reasonCode: "JOB_INFORMATION_UNAVAILABLE" };
const outcomes = {
  denialCodes: ["JOB_INFORMATION_UNAVAILABLE"],
  classifyResult: (value: unknown) =>
    value &&
    typeof value === "object" &&
    "status" in value &&
    value.status === "DENIED"
      ? { outcome: "denied" as const, code: denial.reasonCode }
      : { outcome: "success" as const },
};
const databaseUrl = process.env.KORTYX_OBSERVABILITY_PROBE_DATABASE_URL;
const sent: KortyxTelemetryEvent[] = [];
let api: ReturnType<typeof createApiApp>;
let client: ReturnType<typeof createTelemetryDbClient>;
let apiKey: string;

function adapter(): KortyxTelemetryAdapter {
  return createKortyxTelemetryAdapter({
    endpoint: "http://probe.local",
    apiKey,
    environment: "development",
    service: { name: "direct-tool-observability-probe" },
    flushIntervalMs: 60_000,
    fetch: async (url, init) => {
      if (String(url).endsWith("events:batch")) {
        const events = JSON.parse(String(init?.body)).events;
        events.forEach((event: unknown) => {
          TelemetryEventSchema.parse(event);
        });
        sent.push(...events);
      }
      const response = await api.request(String(url), init);
      expect(response.status).toBe(200);
      return response;
    },
  });
}

function workflow(run: () => Promise<Record<string, unknown>>) {
  return defineWorkflow({
    id: `tool-probe-${randomUUID()}`,
    version: "1",
    inputSchema: z.object({}),
    outputSchema: z.object({ status: z.string() }),
    nodes: { call: { run: async () => ({ data: await run() }) } },
    edges: [
      ["__start__", "call"],
      ["call", "__end__"],
    ],
  });
}

async function detail(runId: string) {
  const response = await api.request(
    `http://probe.local/v1/studio/runs/${runId}`,
    {
      headers: { authorization: `Bearer ${apiKey}` },
    },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    run: { status: string };
    events: StudioDetailEvent[];
  };
}

describe.skipIf(!databaseUrl)(
  "SDK → real telemetry routes/PostgreSQL → Studio trace rendering",
  () => {
    beforeAll(async () => {
      // This URL must point at a disposable, empty database; the runner supplies one.
      client = createTelemetryDbClient(databaseUrl!);
      const migrations = resolve(
        __dirname,
        "../../packages/telemetry-db/drizzle",
      );
      await client.sql`create table if not exists observability_probe_migrations (name text primary key)`;
      for (const file of (await readdir(migrations))
        .filter((name) => name.endsWith(".sql"))
        .sort()) {
        const [applied] =
          await client.sql`select name from observability_probe_migrations where name = ${file}`;
        if (applied) continue;
        await client.sql.begin(async (tx) => {
          await tx.unsafe(await readFile(resolve(migrations, file), "utf8"));
          await tx`insert into observability_probe_migrations (name) values (${file})`;
        });
      }
      const project = await ensureLocalDevelopmentProject(client.db);
      const key = await createTelemetryApiKey(client.db, {
        ...project,
        name: "probe",
        pepper: "probe-pepper",
        scopes: ["telemetry:write", "studio:read"],
      });
      apiKey = key.apiKey;
      api = createApiApp({ db: client.db, apiKeyPepper: "probe-pepper" });
    });
    afterAll(async () => {
      await client?.close();
    });

    it("keeps repeated tools in concurrent sibling children independently owned", async () => {
      const telemetry = adapter();
      const child = defineWorkflow({
        id: `parallel-tools-${randomUUID()}`,
        version: "1",
        inputSchema: z.object({ jobId: z.string() }),
        outputSchema: z.object({ status: z.string() }),
        nodes: {
          lookup: {
            run: async ({ input }) => {
              const jobId = (input as { jobId: string }).jobId;
              const result = await useTool({
                tool: {
                  name: "read_job_knowledge",
                  inputSchema: {},
                  outcomes,
                  execute: async () => {
                    await new Promise((resolve) =>
                      setTimeout(resolve, jobId === "denied" ? 10 : 2),
                    );
                    return jobId === "denied" ? denial : { status: "OK" };
                  },
                },
                input: { jobId },
              });
              return { data: result };
            },
          },
        },
        edges: [
          ["__start__", "lookup"],
          ["lookup", "__end__"],
        ],
      });
      const root = workflow(async () => {
        await parallel([
          useWorkflow({
            id: "denied",
            workflow: child.id,
            input: { jobId: "denied" },
          }),
          useWorkflow({
            id: "allowed",
            workflow: child.id,
            input: { jobId: "allowed" },
          }),
        ]);
        return { status: "OK" };
      });
      const result = await createAgent({
        workflows: [root, child],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      }).execute({ workflow: root, input: {} });
      expect(result.status).toBe("completed");
      await telemetry.flush();
      const record = await detail(result.runId);
      const starts = record.events.filter(
        (event) => event.type === "tool.started",
      );
      expect(starts).toHaveLength(2);
      expect(
        new Set(starts.map((event) => event.payload.invocationId)).size,
      ).toBe(2);
      expect(
        new Set(starts.map((event) => event.payload.toolCallId)).size,
      ).toBe(2);
      expect(
        starts.every(
          (event) => event.workflowId === child.id && event.nodeId === "lookup",
        ),
      ).toBe(true);
      expect(
        record.events.filter((event) => event.type === "tool.denied"),
      ).toHaveLength(1);
      expect(
        record.events.filter((event) => event.type === "tool.completed"),
      ).toHaveLength(1);
      expect(
        buildTraceStory(record.events)
          .filter((item) => item.kind === "tool")
          .map((item) => item.status)
          .sort(),
      ).toEqual(["completed", "denied"]);
      const headers = { authorization: `Bearer ${apiKey}` };
      const filtered = await api.request(
        `http://probe.local/v1/studio/runs?includeChildren=true&workflow=${child.id}&path=lookup&toolName=read_job_knowledge&toolOutcome=denied&version=1`,
        { headers },
      );
      expect(filtered.status).toBe(200);
      const matches = (await filtered.json()).runs;
      const childMatches = matches.filter(
        (run: { parentRunId?: string }) => run.parentRunId,
      );
      expect(childMatches).toHaveLength(1);
      expect(childMatches[0].status).toBe("completed");
      expect(childMatches[0].invocationId).toBe(
        record.events.find((event) => event.type === "tool.denied")?.payload
          .invocationId,
      );
    });

    it("preserves a whole cached child's tool evidence without re-execution", async () => {
      const telemetry = adapter();
      const execute = vi.fn(async () => denial);
      const child = workflow(() =>
        useTool({
          tool: {
            name: "read_job_knowledge",
            inputSchema: {},
            outcomes,
            execute,
          },
          input: {},
        }),
      );
      const root = workflow(async () => {
        const result = await useWorkflow({
          id: "child",
          workflow: child.id,
          input: {},
        });
        await useInterrupt({
          id: "continue",
          request: { kind: "text", question: "Continue?" },
        });
        return result.data;
      });
      const agent = createAgent({
        workflows: [root, child],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      });
      const first = await agent.execute({ workflow: root, input: {} });
      if (first.status !== "suspended") throw new Error("Expected interrupt");
      const checkpoints = await agent.listCheckpoints(first.sessionId);
      const fork = await agent.fork(checkpoints[0].id, {
        newSessionId: `whole-child-${randomUUID()}`,
      });
      await telemetry.flush();
      const restored = await detail(
        fork.checkpoint.activePendingRequests[0].runId,
      );
      expect(
        restored.events.filter((event) => event.type === "tool.reused"),
      ).toHaveLength(1);
      const pending = fork.checkpoint.activePendingRequests[0];
      const branch = await agent.resume({
        workflow: root,
        resume: {
          token: pending.token,
          requestId: pending.requestId,
          runId: pending.runId,
          sessionId: fork.sessionId,
        },
        response: { type: "text", text: "continue" },
      });
      expect(branch.status).toBe("completed");
      await telemetry.flush();
      const record = await detail(branch.runId);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(
        record.events.filter((event) => event.type === "tool.started"),
      ).toHaveLength(0);
      expect(
        record.events.filter((event) => event.type === "tool.reused"),
      ).toMatchObject([
        {
          workflowId: child.id,
          nodeId: "call",
          payload: { outcome: "denied", source: { runId: first.runId } },
        },
      ]);
      const rollback = await agent.rollbackTo(checkpoints[0].id);
      const restoredPending = rollback.activePendingRequests[0];
      await telemetry.flush();
      const beforeResume = await detail(restoredPending.runId);
      const restoredTool = beforeResume.events.find(
        (event) =>
          event.type === "tool.reused" &&
          event.payload.branchId !==
            record.events.find((item) => item.type === "tool.reused")?.payload
              .branchId,
      );
      expect(restoredTool).toBeDefined();
      const rolledBack = await agent.resume({
        workflow: root,
        resume: {
          token: restoredPending.token,
          requestId: restoredPending.requestId,
          runId: restoredPending.runId,
          sessionId: first.sessionId,
        },
        response: { type: "text", text: "edited continuation" },
      });
      expect(rolledBack.status).toBe("completed");
      await telemetry.flush();
      const rollbackRecord = await detail(rolledBack.runId);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(
        rollbackRecord.events.filter(
          (event) =>
            event.type === "tool.reused" &&
            event.payload.branchId === restoredTool?.payload.branchId,
        ),
      ).toHaveLength(1);
      expect(restoredTool?.payload.source).toMatchObject({
        runId: first.runId,
      });
    });

    it("publishes available tools before traffic and aggregates outcomes with filtered drill-through", async () => {
      const telemetry = adapter();
      const root = workflow(() =>
        useTool({
          tool: {
            name: "catalog_lookup",
            inputSchema: {},
            outcomes,
            execute: () => denial,
          },
          input: {},
        }),
      );
      const snapshot = projectWorkflowTopology({
        workflow: root,
        environment: "development",
        service: { name: "probe" },
      });
      snapshot.workflow.nodes[0].tools = [
        {
          name: "catalog_lookup",
          description: "Look up safe information",
          callingMode: "direct",
          provenance: "source",
          inputFields: [{ name: "jobId", type: "string", required: true }],
        },
      ];
      snapshot.workflow.nodes[0].toolDiscovery = {
        status: "unresolved",
        warnings: ["Dynamic attachment cannot be resolved"],
        publishedAt: new Date().toISOString(),
      };
      await telemetry.reporter!.ensureWorkflowTopology(snapshot);
      const read = async (path: string) => {
        const response = await api.request(`http://probe.local${path}`, {
          headers: { authorization: `Bearer ${apiKey}` },
        });
        expect(response.status).toBe(200);
        return response.json();
      };
      let catalog = await read(
        `/v1/studio/workflows?workflow=${root.id}&env=development&version=1&range=7+days`,
      );
      let tool = catalog.workflows.find(
        (item: { id: string }) => item.id === root.id,
      ).nodes[0].tools[0];
      expect(tool).toMatchObject({
        name: "catalog_lookup",
        provenance: "source",
        calls: 0,
        denials: 0,
        p50DurationMs: null,
      });
      const result = await createAgent({
        workflows: [root],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      }).execute({ workflow: root, input: {} });
      await telemetry.flush();
      catalog = await read(
        `/v1/studio/workflows?workflow=${root.id}&env=development&version=1&range=7+days`,
      );
      const model = catalog.workflows.find(
        (item: { id: string }) => item.id === root.id,
      );
      tool = model.nodes[0].tools[0];
      expect(tool).toMatchObject({
        provenance: "source",
        calls: 1,
        denials: 1,
        faults: 0,
        replays: 0,
        p50DurationMs: expect.any(Number),
      });
      expect(model.nodes[0].toolDiscovery.status).toBe("unresolved");
      const matches = await read(
        `/v1/studio/runs?workflow=${root.id}&path=call&env=development&version=1&toolName=catalog_lookup&toolMode=direct&toolOutcome=denied`,
      );
      expect(matches.runs).toMatchObject([
        { id: result.runId, status: "completed" },
      ]);
      const faults = await read(
        `/v1/studio/runs?workflow=${root.id}&toolName=catalog_lookup&toolOutcome=fault`,
      );
      expect(faults.runs).toHaveLength(0);
      const wrongEnvironment = await read(
        `/v1/studio/runs?workflow=${root.id}&env=production&toolName=catalog_lookup&toolOutcome=denied`,
      );
      expect(wrongEnvironment.runs).toHaveLength(0);
    });

    it("renders a direct denied tool inside a successfully completed workflow", async () => {
      const telemetry = adapter();
      const execute = vi.fn(async () => denial);
      const root = workflow(() =>
        useTool({
          tool: {
            name: "read_job_knowledge",
            inputSchema: {},
            outcomes,
            execute,
          },
          input: { private: "PRIVATE_INPUT" },
        }),
      );
      const agent = createAgent({
        workflows: [root],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      });
      const result = await agent.execute({ workflow: root, input: {} });
      expect(result.status).toBe("completed");
      await telemetry.flush();
      const record = await detail(result.runId);
      expect(record.run.status).toBe("completed");
      expect(
        record.events.filter((event) => event.type.startsWith("tool.")),
      ).toMatchObject([
        {
          type: "tool.started",
          payload: { executed: true, callingMode: "direct" },
        },
        {
          type: "tool.denied",
          payload: {
            outcome: "denied",
            denialCode: denial.reasonCode,
            durationMs: expect.any(Number),
          },
        },
      ]);
      expect(
        buildTraceStory(record.events).filter((item) => item.kind === "tool"),
      ).toMatchObject([{ label: "read_job_knowledge", status: "denied" }]);
      const html = renderToStaticMarkup(
        createElement(
          TooltipProvider,
          null,
          createElement(RunTrace, {
            events: record.events,
            startedAt: record.events[0].occurredAt,
            focusFailure: false,
          }),
        ),
      );
      expect(html).toContain("Denied");
      expect(
        buildEventStory(record.events, record.events[0].occurredAt).find(
          (item) => item.event.type === "tool.denied",
        )?.stateLabel,
      ).toBe("Denied");
      expect(
        JSON.stringify(
          sent.filter((event) => event.correlation.runId === result.runId),
        ),
      ).not.toMatch(/PRIVATE_INPUT|"reasonCode"/);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("supports a public generic span with inherited ownership, but renders denial as completed", async () => {
      const telemetry = adapter();
      const root = workflow(async () =>
        telemetry.trace!.withSpan!(
          {
            name: "read_job_knowledge",
            telemetry: { input: "PRIVATE_INPUT" },
          },
          async (span) => {
            span.end?.({
              attributes: { outcome: "denied", denialCode: denial.reasonCode },
              telemetry: { output: "PRIVATE_OUTPUT" },
            });
            return denial;
          },
        ),
      );
      const agent = createAgent({
        workflows: [root],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      });
      const result = await agent.execute({ workflow: root, input: {} });
      await telemetry.flush();
      const record = await detail(result.runId);
      expect(record.run.status).toBe("completed");
      const item = buildTraceStory(record.events).find(
        (entry) => entry.label === "read_job_knowledge",
      )!;
      expect(item).toMatchObject({
        kind: "span",
        status: "completed",
        durationMs: expect.any(Number),
      });
      expect(item.event).toMatchObject({
        runId: result.runId,
        workflowId: root.id,
        nodeId: "call",
      });
      expect(item.event.payload.branchId).toBeTruthy();
      expect(JSON.stringify(record.events)).not.toMatch(
        /PRIVATE_INPUT|PRIVATE_OUTPUT/,
      );
      const html = renderToStaticMarkup(
        createElement(RunTrace, {
          events: record.events,
          startedAt: record.events[0].occurredAt,
          focusFailure: false,
        }),
      );
      expect(html).toContain("read_job_knowledge");
      expect(html).not.toContain("Denied");
    });

    it("keeps legacy tool events readable and renders their explicit denial", async () => {
      const telemetry = adapter();
      const root = workflow(async () => {
        const span = telemetry.trace!.startSpan({ name: "application-tool" })!;
        span.addEvent?.("tool.started", { tool: "ignored" });
        span.addEvent?.("useReason.tool-call.start", {
          name: "read_job_knowledge",
          tool: "read_job_knowledge",
          toolCallId: "direct-1",
        });
        span.addEvent?.("useReason.tool-call.complete", {
          tool: "read_job_knowledge",
          toolCallId: "direct-1",
          outcome: "denied",
          denialCode: denial.reasonCode,
          durationMs: 7,
        });
        span.end?.();
        return denial;
      });
      const result = await createAgent({
        workflows: [root],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      }).execute({ workflow: root, input: {} });
      await telemetry.flush();
      const record = await detail(result.runId);
      expect(record.run.status).toBe("completed");
      const toolEvents = record.events.filter((event) =>
        event.type.startsWith("tool."),
      );
      expect(toolEvents).toHaveLength(2);
      expect(toolEvents[1].payload).toMatchObject({
        outcome: "denied",
        denialCode: denial.reasonCode,
      });
      expect(
        buildTraceStory(record.events).find((item) => item.kind === "tool")
          ?.status,
      ).toBe("denied");
      const html = renderToStaticMarkup(
        createElement(RunTrace, {
          events: record.events,
          startedAt: record.events[0].occurredAt,
          focusFailure: false,
        }),
      );
      expect(html).toContain("read_job_knowledge");
      expect(html).toContain("Denied");
    });

    it("records framework-neutral native calls individually with denial and success outcomes", async () => {
      const telemetry = adapter();
      const provider = createProvider({
        invokeResponses: [
          {
            content: "",
            toolCalls: [
              {
                id: "native-1",
                name: "read_job_knowledge",
                input: { private: "PRIVATE_INPUT" },
              },
              { id: "native-2", name: "read_job_knowledge", input: {} },
            ],
          },
          { content: "Handled denial successfully." },
        ],
      });
      const execute = vi
        .fn()
        .mockResolvedValueOnce(denial)
        .mockResolvedValueOnce({ status: "OK", private: "PRIVATE_RESULT" });
      const root = workflow(async () => {
        await useReason({
          id: "native-tools",
          model: provider.modelRef,
          input: "check",
          emit: false,
          stream: false,
          tools: [
            { name: "read_job_knowledge", inputSchema: {}, outcomes, execute },
          ],
        });
        return { status: "OK" };
      });
      const result = await createAgent({
        workflows: [root],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      }).execute({ workflow: root, input: {} });
      expect(result.status).toBe("completed");
      await telemetry.flush();
      const record = await detail(result.runId);
      const starts = record.events.filter(
        (event) => event.type === "tool.started",
      );
      const ends = record.events.filter(
        (event) =>
          event.type === "tool.completed" || event.type === "tool.denied",
      );
      expect(starts).toHaveLength(2);
      expect(ends).toHaveLength(2);
      expect(new Set(starts.map((event) => event.spanId)).size).toBe(2);
      expect(ends[0].payload).toMatchObject({
        outcome: "denied",
        denialCode: denial.reasonCode,
        durationMs: expect.any(Number),
      });
      const rows = buildTraceStory(record.events).filter(
        (item) => item.kind === "tool",
      );
      expect(rows).toHaveLength(2);
      expect(rows.map((item) => item.status)).toEqual(["denied", "completed"]);
      expect(rows.every((item) => item.label === "read_job_knowledge")).toBe(
        true,
      );
      expect(rows[0].durationMs).toEqual(expect.any(Number));
      expect(rows[0].endEvent?.type).toBe("tool.denied");
      expect(JSON.stringify(record.events)).not.toMatch(
        /PRIVATE_INPUT|PRIVATE_RESULT/,
      );
      expect(provider.invoke).toHaveBeenCalledTimes(2);
      expect(execute).toHaveBeenCalledTimes(2);
    });

    it("removes request-context credentials before telemetry delivery and storage", async () => {
      const telemetry = adapter();
      const root = workflow(async () => ({ status: "OK" }));
      const result = await createAgent({
        workflows: [root],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      }).execute({
        workflow: root,
        input: {},
        context: { userId: "probe-user", apiKey: "CONTEXT_CREDENTIAL_PROBE" },
      });
      await telemetry.flush();
      expect(
        JSON.stringify(
          sent.filter((event) => event.correlation.runId === result.runId),
        ),
      ).not.toContain("CONTEXT_CREDENTIAL_PROBE");
      const stored =
        await client.sql`select payload from telemetry_events where run_id = ${result.runId}`;
      expect(JSON.stringify(stored)).not.toContain("CONTEXT_CREDENTIAL_PROBE");
      const record = await detail(result.runId);
      expect(record.run.status).toBe("completed");
      expect(JSON.stringify(record.events)).not.toContain(
        "CONTEXT_CREDENTIAL_PROBE",
      );
    });

    it("renders an explicit native isError result as a fault while the workflow recovers", async () => {
      const telemetry = adapter();
      const provider = createProvider({
        invokeResponses: [
          {
            content: "",
            toolCalls: [{ id: "returned-error", name: "lookup", input: {} }],
          },
          { content: "Handled failure." },
        ],
      });
      const execute = vi.fn(async () => ({
        toolCallId: "returned-error",
        name: "lookup",
        content: "Lookup failed.",
        isError: true,
      }));
      const root = workflow(async () => {
        const result = await useReason({
          model: provider.modelRef,
          input: "check",
          emit: false,
          stream: false,
          tools: [{ name: "lookup", inputSchema: {}, execute }],
        });
        expect(result.toolResults).toMatchObject([{ isError: true }]);
        return { status: "OK" };
      });
      const result = await createAgent({
        workflows: [root],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      }).execute({ workflow: root, input: {} });
      await telemetry.flush();
      const record = await detail(result.runId);
      expect(record.run.status).toBe("completed");
      expect(
        record.events.filter((event) => event.type === "tool.completed"),
      ).toHaveLength(0);
      expect(
        record.events.filter((event) => event.type === "tool.failed"),
      ).toHaveLength(1);
      const rows = buildTraceStory(record.events).filter(
        (item) => item.kind === "tool",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("fault");
      const html = renderToStaticMarkup(
        createElement(
          TooltipProvider,
          null,
          createElement(RunTrace, {
            events: record.events,
            startedAt: record.events[0].occurredAt,
            focusFailure: false,
          }),
        ),
      );
      expect(html).toContain("Fault");
      expect(html).toContain("lookup");
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("records approval denial as unexecuted in a completed workflow", async () => {
      const telemetry = adapter();
      const provider = createProvider({
        invokeResponses: [
          {
            content: "",
            toolCalls: [
              { id: "approval-1", name: "read_job_knowledge", input: {} },
            ],
          },
          { content: "Denied, continuing." },
        ],
      });
      const execute = vi.fn(async () => denial);
      const root = workflow(async () => {
        await useReason({
          id: "approval",
          model: provider.modelRef,
          input: "check",
          emit: false,
          stream: false,
          tools: [
            { name: "read_job_knowledge", inputSchema: {}, outcomes, execute },
          ],
          toolExecution: { approval: true },
        });
        return { status: "OK" };
      });
      const agent = createAgent({
        workflows: [root],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      });
      const first = await agent.execute({ workflow: root, input: {} });
      expect(first.status).toBe("suspended");
      if (first.status !== "suspended")
        throw new Error("Expected approval interrupt");
      const resumed = await agent.resume({
        workflow: root,
        resume: first.resume,
        response: { type: "select", ids: ["deny"] },
      });
      expect(resumed.status).toBe("completed");
      await telemetry.flush();
      const record = await detail(resumed.runId);
      expect(record.run.status).toBe("completed");
      expect(execute).not.toHaveBeenCalled();
      expect(
        record.events.filter((event) => event.type === "tool.started"),
      ).toHaveLength(0);
      expect(
        record.events.filter((event) => event.type === "tool.denied"),
      ).toMatchObject([
        { payload: { executed: false, denialCode: "APPROVAL_DENIED" } },
      ]);
    });

    it("inherits child ownership across resume/fork and reexecutes direct tools", async () => {
      const telemetry = adapter();
      const execute = vi.fn(async () => denial);
      const child = defineWorkflow({
        id: `tool-child-${randomUUID()}`,
        version: "1",
        inputSchema: z.object({}),
        outputSchema: z.object({ status: z.string() }),
        nodes: {
          evidence: {
            run: async () => {
              const result = await useTool({
                tool: {
                  name: "read_job_knowledge",
                  inputSchema: {},
                  outcomes,
                  execute,
                },
                input: {},
              });
              await useInterrupt({
                id: "clarify",
                request: { kind: "text", question: "Continue?" },
              });
              return { data: result };
            },
          },
        },
        edges: [
          ["__start__", "evidence"],
          ["evidence", "__end__"],
        ],
      });
      const root = workflow(
        async () =>
          (await useWorkflow({ id: "brief", workflow: child.id, input: {} }))
            .data,
      );
      const agent = createAgent({
        workflows: [root, child],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      });
      const first = await agent.execute({ workflow: root, input: {} });
      expect(first.status).toBe("suspended");
      if (first.status !== "suspended") throw new Error("Expected interrupt");
      const checkpoints = await agent.listCheckpoints(first.sessionId);
      const fork = await agent.fork(checkpoints[0].id, {
        newSessionId: `direct-fork-${randomUUID()}`,
      });
      const request = fork.checkpoint.activePendingRequests[0];
      const forkResult = await agent.resume({
        workflow: root,
        resume: {
          token: request.token,
          requestId: request.requestId,
          runId: request.runId,
          sessionId: fork.sessionId,
        },
        response: { type: "text", text: "fork continue" },
      });
      expect(forkResult.status).toBe("completed");
      const resumed = await agent.resume({
        workflow: root,
        resume: first.resume,
        response: { type: "text", text: "continue" },
      });
      expect(resumed.status).toBe("completed");
      await telemetry.flush();
      const own = sent.filter(
        (event) =>
          event.correlation.runId === resumed.runId &&
          event.type === "tool.started" &&
          event.payload.name === "read_job_knowledge",
      );
      expect(own).toHaveLength(2);
      expect(execute).toHaveBeenCalledTimes(3);
      for (const event of own) {
        expect(event.correlation).toMatchObject({
          workflowId: child.id,
          nodeId: "evidence",
          runId: resumed.runId,
        });
        expect(event.correlation.invocationId).toBeTruthy();
        expect(event.correlation.branchId).toBeTruthy();
        expect(event.payload.invocationId).toBe(event.correlation.invocationId);
      }
      expect(own[0].correlation.invocationId).toBe(
        own[1].correlation.invocationId,
      );
      const forkSpan = sent.find(
        (event) =>
          event.correlation.runId === forkResult.runId &&
          event.type === "tool.started" &&
          event.payload.name === "read_job_knowledge",
      )!;
      expect(forkSpan.correlation).toMatchObject({
        workflowId: child.id,
        nodeId: "evidence",
        sessionId: fork.sessionId,
      });
      expect(forkSpan.correlation.invocationId).toBe(
        own[0].correlation.invocationId,
      );
      expect(forkSpan.correlation.branchId).not.toBe(
        own[0].correlation.branchId,
      );
      expect((await detail(forkResult.runId)).run.status).toBe("completed");
    });

    it("preserves invocation/branch from correlation-only reporter facts during ingestion", async () => {
      const telemetry = adapter();
      const runId = randomUUID();
      await telemetry.reporter!.emit([
        {
          schemaVersion: 1,
          eventId: randomUUID(),
          occurredAt: new Date().toISOString(),
          environment: "development",
          service: { name: "probe" },
          correlation: {
            runId,
            workflowId: "child",
            invocationId: "child-invocation",
            branchId: "fork",
          },
          type: "tool.started",
          payload: { tool: "read_job_knowledge", toolCallId: "call" },
        },
      ]);
      await telemetry.flush();
      const record = await detail(runId);
      expect(record.events[0].payload.invocationId).toBe("child-invocation");
      expect(record.events[0].payload.branchId).toBe("fork");
      expect(record.events[0]).not.toHaveProperty("invocationId");
    });

    it("records distinct native fault and cancellation terminals", async () => {
      for (const cancelled of [false, true]) {
        const telemetry = adapter();
        const controller = new AbortController();
        const provider = createProvider({
          invokeResponses: [
            {
              content: "",
              toolCalls: [
                { id: "attempt-1", name: "read_job_knowledge", input: {} },
              ],
            },
            { content: "Recovered from tool fault." },
          ],
        });
        const root = workflow(async () => {
          await useReason({
            id: "attempt",
            model: provider.modelRef,
            input: "check",
            emit: false,
            stream: false,
            tools: [
              {
                name: "read_job_knowledge",
                inputSchema: {},
                execute: async () => {
                  if (cancelled) controller.abort();
                  throw new Error("PRIVATE_FAULT_MESSAGE");
                },
              },
            ],
          });
          return { status: "OK" };
        });
        const result = await createAgent({
          workflows: [root],
          telemetry,
          frameworkAdapter: createInMemoryFrameworkAdapter(),
        }).execute({
          workflow: root,
          input: {},
          abortSignal: controller.signal,
        });
        expect(result.status).toBe(cancelled ? "cancelled" : "completed");
        await telemetry.flush();
        const record = await detail(result.runId);
        expect(
          record.events.filter((event) => event.type === "tool.started"),
        ).toHaveLength(1);
        expect(
          record.events.filter((event) => event.type === "tool.failed"),
        ).toHaveLength(cancelled ? 0 : 1);
        expect(
          record.events.filter((event) => event.type === "tool.completed"),
        ).toHaveLength(0);
        expect(
          record.events.filter((event) => event.type === "tool.cancelled"),
        ).toHaveLength(cancelled ? 1 : 0);
        expect(JSON.stringify(record.events)).not.toContain(
          "PRIVATE_FAULT_MESSAGE",
        );
      }
    });

    it("adopts useTool inside a native execute adapter without duplicate observations", async () => {
      const telemetry = adapter();
      const provider = createProvider({
        invokeResponses: [
          {
            content: "",
            toolCalls: [
              { id: "duplicate-1", name: "read_job_knowledge", input: {} },
            ],
          },
          { content: "Handled denial." },
        ],
      });
      const innerExecute = vi.fn(async () => denial);
      const shared = {
        name: "read_job_knowledge",
        inputSchema: {},
        outcomes,
        execute: innerExecute,
      };
      const execute = vi.fn(async (input: unknown) => {
        const legacy = telemetry.trace!.startSpan({
          name: "legacy-application-tool",
        });
        legacy?.addEvent?.("useReason.tool-call.start", {
          tool: shared.name,
          toolCallId: "legacy",
        });
        legacy?.addEvent?.("useReason.tool-call.complete", {
          tool: shared.name,
          toolCallId: "legacy",
        });
        legacy?.end?.();
        return useTool({ tool: shared, input });
      });
      const root = workflow(async () => {
        await useReason({
          id: "duplicate",
          model: provider.modelRef,
          input: "check",
          emit: false,
          stream: false,
          tools: [
            { name: "read_job_knowledge", inputSchema: {}, outcomes, execute },
          ],
        });
        return { status: "OK" };
      });
      const result = await createAgent({
        workflows: [root],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      }).execute({ workflow: root, input: {} });
      await telemetry.flush();
      const record = await detail(result.runId);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(innerExecute).toHaveBeenCalledTimes(1);
      expect(
        record.events.filter((event) => event.type === "tool.started"),
      ).toHaveLength(1);
      expect(
        record.events.filter((event) => event.type === "tool.denied"),
      ).toHaveLength(1);
      expect(
        buildTraceStory(record.events).filter((item) => item.kind === "tool"),
      ).toHaveLength(1);
    });

    it("rejects incomplete canonical denial, cancellation and replay payloads", async () => {
      for (const type of ["tool.denied", "tool.cancelled", "tool.reused"]) {
        const response = await api.request(
          "http://probe.local/v1/telemetry/events:batch",
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              events: [
                {
                  schemaVersion: 1,
                  eventId: randomUUID(),
                  occurredAt: new Date().toISOString(),
                  environment: "development",
                  service: { name: "probe" },
                  correlation: { runId: randomUUID(), workflowId: "root" },
                  type,
                  payload: {},
                },
              ],
            }),
          },
        );
        expect(response.status).toBe(400);
      }
    });

    it("links native cached reuse to its original execution across resume/fork", async () => {
      const telemetry = adapter();
      const provider = createProvider({
        invokeResponses: [
          {
            content: "",
            toolCalls: [
              { id: "cached-1", name: "read_job_knowledge", input: {} },
            ],
          },
          { content: "Handled denial." },
        ],
      });
      const execute = vi.fn(async () => denial);
      const child = defineWorkflow({
        id: `cached-child-${randomUUID()}`,
        version: "1",
        inputSchema: z.object({}),
        outputSchema: z.object({ status: z.string() }),
        nodes: {
          evidence: {
            run: async () => {
              await useReason({
                id: "cached-tool",
                model: provider.modelRef,
                input: "check",
                emit: false,
                stream: false,
                tools: [
                  {
                    name: "read_job_knowledge",
                    inputSchema: {},
                    outcomes,
                    execute,
                  },
                ],
              });
              await useInterrupt({
                id: "clarify",
                request: { kind: "text", question: "Continue?" },
              });
              return { data: { status: "OK" } };
            },
          },
        },
        edges: [
          ["__start__", "evidence"],
          ["evidence", "__end__"],
        ],
      });
      const root = workflow(
        async () =>
          (await useWorkflow({ id: "brief", workflow: child.id, input: {} }))
            .data,
      );
      const agent = createAgent({
        workflows: [root, child],
        telemetry,
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      });
      const first = await agent.execute({
        workflow: root,
        input: {},
        sessionId: `source-${randomUUID()}`,
      });
      expect(first.status).toBe("suspended");
      if (first.status !== "suspended") throw new Error("Expected interrupt");
      const checkpoints = await agent.listCheckpoints(first.sessionId);
      const checkpoint = checkpoints[0];
      expect(checkpoint).toBeTruthy();
      const fork = await agent.fork(checkpoint.id, {
        newSessionId: `fork-${randomUUID()}`,
      });
      const request = fork.checkpoint.activePendingRequests[0];
      const forkResult = await agent.resume({
        workflow: root,
        resume: {
          token: request.token,
          requestId: request.requestId,
          runId: request.runId,
          sessionId: fork.sessionId,
        },
        response: { type: "text", text: "fork continue" },
      });
      const sourceResult = await agent.resume({
        workflow: root,
        resume: first.resume,
        response: { type: "text", text: "source continue" },
      });
      expect(forkResult.status).toBe("completed");
      expect(sourceResult.status).toBe("completed");
      expect(execute).toHaveBeenCalledTimes(1);
      expect(provider.invoke).toHaveBeenCalledTimes(2);
      await telemetry.flush();
      const source = await detail(sourceResult.runId);
      const branch = await detail(forkResult.runId);
      expect(source.run.status).toBe("completed");
      expect(branch.run.status).toBe("completed");
      expect(
        source.events.filter((event) => event.type === "tool.started"),
      ).toHaveLength(1);
      expect(
        branch.events.filter((event) => event.type === "tool.started"),
      ).toHaveLength(0);
      expect(
        branch.events.filter((event) => event.type === "tool.reused"),
      ).toMatchObject([
        {
          payload: {
            executed: false,
            outcome: "denied",
            source: { runId: first.runId },
          },
        },
      ]);
      expect(
        buildTraceStory(branch.events).filter((item) => item.kind === "tool"),
      ).toMatchObject([{ status: "replayed", durationMs: null }]);
      const sourceResumed = source.events.find(
        (event) => event.type === "workflow.call.resumed",
      )!;
      const forkResumed = branch.events.find(
        (event) => event.type === "workflow.call.resumed",
      )!;
      expect(sourceResumed.payload.invocationId).toBe(
        forkResumed.payload.invocationId,
      );
      expect(sourceResumed.payload.branchId).not.toBe(
        forkResumed.payload.branchId,
      );
    });
  },
);

describe("public tracing boundaries without a database", () => {
  it("swallows telemetry delivery failure without altering a direct business denial", async () => {
    const telemetry = createKortyxTelemetryAdapter({
      endpoint: "http://offline.local",
      apiKey: "fixture-key",
      environment: "test",
      service: { name: "probe" },
      flushIntervalMs: 60_000,
      fetch: async () => {
        throw new Error("Telemetry offline");
      },
    });
    const result = await telemetry.trace!.withSpan!(
      {
        name: "read_job_knowledge",
        attributes: { runId: "run", workflowId: "root" },
      },
      async () => denial,
    );
    await expect(telemetry.flush()).resolves.toBeUndefined();
    expect(result).toBe(denial);
  });

  it("does not export a standalone uncorrelated span or an arbitrary tool event", async () => {
    const batches: unknown[] = [];
    const telemetry = createKortyxTelemetryAdapter({
      endpoint: "http://fixture.local",
      apiKey: "fixture-key",
      environment: "test",
      service: { name: "probe" },
      flushIntervalMs: 60_000,
      fetch: async (_url, init) => {
        batches.push(JSON.parse(String(init?.body)));
        return new Response("{}");
      },
    });
    await telemetry.trace!.withSpan!(
      { name: "standalone-tool" },
      async () => denial,
    );
    await telemetry.flush();
    expect(batches).toEqual([]);
    await telemetry.trace!.withSpan!(
      { name: "direct", attributes: { runId: "run", workflowId: "root" } },
      async (span) => {
        span.addEvent?.("tool.started", { tool: "test" });
        return denial;
      },
    );
    await telemetry.flush();
    expect(JSON.stringify(batches)).not.toContain('"type":"tool.started"');
  });
});
