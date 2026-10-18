import { randomUUID } from "node:crypto";
import { projectWorkflowTopology } from "@kortyx/agent";
import type {
  EnsureWorkflowTopologyRequest,
  KortyxTelemetryEvent,
  StudioInterrupt,
  StudioRun,
} from "@kortyx/telemetry-contracts";
import {
  StudioChangeSchema,
  TelemetryEventBatchSchema,
} from "@kortyx/telemetry-contracts";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTelemetryDbClient, type TelemetryDbClient } from "../src/client";
import { STUDIO_CHANGE_CHANNEL } from "../src/repositories/studio-changes";
import {
  listStudioInterrupts,
  listStudioRuns,
  listStudioSessions,
} from "../src/repositories/studio-lists";
import { backfillStudioProjections } from "../src/repositories/studio-projections";
import {
  getStudioRunReadModel,
  getStudioSessionReadModel,
} from "../src/repositories/studio-read-models";
import { listStudioWorkflows } from "../src/repositories/studio-workflows";
import { listStudioFilterValues } from "../src/repositories/table-filters";
import { ingestTelemetryEvents } from "../src/repositories/telemetry-events";
import { ensureWorkflowRevision } from "../src/repositories/workflow-revisions";
import {
  organizations,
  projectEnvironments,
  projects,
  studioInterrupts,
  studioRuns,
  studioSessions,
} from "../src/schema";

const databaseUrl = process.env.DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

const runDocument = (
  id: string,
  startedAt: Date,
  overrides: Partial<StudioRun> = {},
): StudioRun => ({
  id,
  status: "completed",
  startedAt: startedAt.toISOString(),
  endedAt: new Date(startedAt.getTime() + 1_000).toISOString(),
  workflowId: "workflow-a",
  workflowIds: ["workflow-a"],
  workflowRefs: [
    {
      workflowId: "workflow-a",
      workflowRevisionId: null,
      declaredVersion: "1.0.0",
    },
  ],
  workflowRevisionId: null,
  declaredVersion: "1.0.0",
  transitionIds: [],
  path: ["start"],
  sessionId: null,
  provider: "provider-a",
  model: "model-a",
  models: ["model-a"],
  durationMs: 1_000,
  tokens: 100,
  cost: 0.01,
  pricingStatus: "priced",
  pricingSource: "custom",
  currency: "USD",
  result: "ok",
  environment: "test",
  userId: "user-a",
  tenantId: "tenant-a",
  hasTool: false,
  hasRetry: false,
  interruptNodeId: null,
  ...overrides,
});

const projectionValue = (
  organizationId: string,
  projectId: string,
  data: StudioRun,
) => ({
  organizationId,
  projectId,
  runId: data.id,
  sessionId: data.sessionId,
  status: data.status,
  startedAt: new Date(data.startedAt),
  endedAt: data.endedAt ? new Date(data.endedAt) : null,
  durationMs: data.durationMs,
  tokens: data.tokens,
  cost: data.cost,
  environment: data.environment,
  provider: data.provider,
  model: data.model,
  userId: data.userId,
  tenantId: data.tenantId,
  hasTool: data.hasTool,
  workflowIds: data.workflowIds,
  workflowVersions: ["1.0.0"],
  transitionIds: data.transitionIds,
  path: data.path,
  models: data.models,
  searchText: [
    data.id,
    ...data.workflowIds,
    data.userId,
    data.tenantId,
    data.model,
    data.result,
  ]
    .filter(Boolean)
    .join(" "),
  data,
  updatedAt: new Date(),
});

integration("Studio SQL projections", () => {
  let client: TelemetryDbClient;
  let organizationA: string;
  let organizationB: string;
  let projectA: string;
  let projectB: string;

  it("publishes source calls without runs, preserves them on runtime ensure, and replaces them on republish", async () => {
    const options = {
      environment: "test",
      service: { name: "catalog-test" },
    };
    const request = projectWorkflowTopology({
      ...options,
      workflow: {
        id: "catalog-parent",
        version: "1",
        nodes: { chat: { run: () => ({ transitionTo: "handoff" }) } },
        edges: [],
      },
    });
    const bundled = projectWorkflowTopology({
      ...options,
      workflow: {
        id: "catalog-parent",
        version: "1",
        nodes: {
          chat: { run: new Function("return () => ({ transitionTo: a.b })")() },
        },
        edges: [],
      },
    });
    expect(bundled.workflow.transitions).toBeUndefined();
    expect(bundled.workflow.topologyHash).toBe(request.workflow.topologyHash);
    const ensure = (value: EnsureWorkflowTopologyRequest) =>
      ensureWorkflowRevision(client.db, {
        organizationId: organizationA,
        projectId: projectA,
        request: value,
      });
    const initial = await ensure(request);
    const withCalls = {
      ...request,
      workflow: {
        ...request.workflow,
        calls: [{ sourceNodeId: "chat", targetWorkflowId: "catalog-child" }],
      },
    };
    const published = await ensure(withCalls);
    expect(published.workflowRevisionId).toBe(initial.workflowRevisionId);
    const runtime = await ensure(bundled);
    expect(runtime.workflowRevisionId).toBe(published.workflowRevisionId);
    const read = () =>
      listStudioWorkflows(client.db, {
        organizationId: organizationA,
        projectId: projectA,
        query: { range: "All time", env: "test" },
      });
    const catalog = await read();
    expect(
      catalog.transitions.filter(
        (edge) => edge.sourceWorkflowId === "catalog-parent",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "call",
          sourceNodeId: "chat",
          targetWorkflowId: "catalog-child",
          volume: 0,
        }),
        expect.objectContaining({ targetWorkflowId: "handoff", volume: 0 }),
      ]),
    );
    expect(
      catalog.transitions.filter((edge) => edge.kind === "call"),
    ).toHaveLength(1);
    const other = await listStudioWorkflows(client.db, {
      organizationId: organizationB,
      projectId: projectB,
      query: { range: "All time" },
    });
    expect(other.transitions.some((edge) => edge.kind === "call")).toBe(false);
    await ensure({ ...request, workflow: { ...request.workflow, calls: [] } });
    expect(
      (await read()).transitions.some((edge) => edge.kind === "call"),
    ).toBe(false);
  });

  beforeAll(async () => {
    if (!databaseUrl) return;
    client = createTelemetryDbClient(databaseUrl);
    const [orgA, orgB] = await client.db
      .insert(organizations)
      .values([
        { name: `studio-projection-a-${randomUUID()}` },
        { name: `studio-projection-b-${randomUUID()}` },
      ])
      .returning({ id: organizations.id });
    if (!orgA || !orgB) throw new Error("Test organizations were not created.");
    organizationA = orgA.id;
    organizationB = orgB.id;
    const [createdProjectA, createdProjectB] = await client.db
      .insert(projects)
      .values([
        { organizationId: organizationA, name: "project-a" },
        { organizationId: organizationB, name: "project-b" },
      ])
      .returning({ id: projects.id, organizationId: projects.organizationId });
    if (!createdProjectA || !createdProjectB) {
      throw new Error("Test projects were not created.");
    }
    projectA =
      createdProjectA.organizationId === organizationA
        ? createdProjectA.id
        : createdProjectB.id;
    projectB =
      createdProjectB.organizationId === organizationB
        ? createdProjectB.id
        : createdProjectA.id;
    await client.db.insert(projectEnvironments).values([
      { organizationId: organizationA, projectId: projectA, name: "test" },
      { organizationId: organizationB, projectId: projectB, name: "test" },
    ]);

    const base = Date.now() - 10_000;
    const documents = Array.from({ length: 260 }, (_, index) =>
      runDocument(
        `run-page-${String(index).padStart(3, "0")}`,
        new Date(base + index),
        {
          status: index % 3 === 0 ? "failed" : "completed",
          environment: index % 2 === 0 ? "test" : "production",
          ...(index === 0
            ? {
                workflowId: "workflow-special",
                workflowIds: ["workflow-special"],
                workflowRefs: [
                  {
                    workflowId: "workflow-special",
                    workflowRevisionId: null,
                    declaredVersion: "1.0.0",
                  },
                ],
              }
            : {}),
        },
      ),
    );
    await client.db
      .insert(studioRuns)
      .values(
        documents.map((document) =>
          projectionValue(organizationA, projectA, document),
        ),
      );
    const shadow = runDocument("run-tenant-shadow", new Date(base + 1_000));
    await client.db
      .insert(studioRuns)
      .values(projectionValue(organizationB, projectB, shadow));
  });

  afterAll(async () => {
    if (!databaseUrl || !client) return;
    await client.db
      .delete(organizations)
      .where(eq(organizations.id, organizationA));
    await client.db
      .delete(organizations)
      .where(eq(organizations.id, organizationB));
    await client.close();
  });

  it("applies tenant scope, filters, count, and pagination in SQL", async () => {
    const firstPage = await listStudioRuns(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      query: { range: "All time", pageSize: "250" },
    });
    const secondPage = await listStudioRuns(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      query: { range: "All time", pageSize: "250", cursor: "250" },
    });
    const filtered = await listStudioRuns(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      query: {
        range: "All time",
        pageSize: "250",
        status: "failed",
        env: "test",
      },
    });

    expect(firstPage.totalCount).toBe(260);
    expect(firstPage.items).toHaveLength(250);
    expect(secondPage.totalCount).toBe(260);
    expect(secondPage.items).toHaveLength(10);
    expect(
      new Set([...firstPage.items, ...secondPage.items].map((run) => run.id))
        .size,
    ).toBe(260);
    expect(filtered.items).toHaveLength(
      Array.from({ length: 260 }, (_, index) => index).filter(
        (index) => index % 3 === 0 && index % 2 === 0,
      ).length,
    );
    expect(
      [...firstPage.items, ...secondPage.items].some(
        (run) => run.id === "run-tenant-shadow",
      ),
    ).toBe(false);
  });

  it("includes child rows before filtering and pagination without changing root counts", async () => {
    const now = new Date().toISOString();
    const correlation = { runId: "run-child-list", workflowId: "parent" };
    const facts = [
      { type: "span.started", payload: { name: "kortyx.run" } },
      ...["first", "second"].flatMap((invocationId) => [
        {
          type: "workflow.call.started",
          payload: {
            invocationId,
            branchId: "branch",
            callId: "research",
            targetWorkflowId: "research-child",
            sourceWorkflowId: "parent",
            sequence: 1,
          },
        },
        {
          type: "workflow.call.completed",
          payload: {
            invocationId,
            branchId: "branch",
            callId: "research",
            targetWorkflowId: "research-child",
            sourceWorkflowId: "parent",
            sequence: 2,
          },
        },
      ]),
      { type: "span.ended", payload: { name: "kortyx.run" } },
    ].map((fact) => ({
      ...fact,
      schemaVersion: 1,
      eventId: randomUUID(),
      occurredAt: now,
      environment: "test",
      service: { name: "integration-test" },
      correlation,
    })) as KortyxTelemetryEvent[];
    await ingestTelemetryEvents(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      events: facts,
    });
    const input = { organizationId: organizationA, projectId: projectA };
    const roots = await listStudioRuns(client.db, {
      ...input,
      query: { range: "All time", q: "run-child-list" },
    });
    const page = await listStudioRuns(client.db, {
      ...input,
      query: {
        range: "All time",
        includeChildren: "true",
        workflow: "research-child",
        pageSize: "1",
        cursor: "1",
      },
    });
    expect(roots.totalCount).toBe(1);
    expect(page.totalCount).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      parentRunId: "run-child-list",
      workflowId: "research-child",
      status: "completed",
      branchId: "branch",
    });
    const otherProject = await listStudioRuns(client.db, {
      organizationId: organizationB,
      projectId: projectB,
      query: {
        range: "All time",
        includeChildren: "true",
        workflow: "research-child",
      },
    });
    expect(otherProject.totalCount).toBe(0);
  });

  it("derives pending and expired interrupt filters without new telemetry", async () => {
    const marker = `expiry-${randomUUID()}`;
    const now = Date.now();
    const interrupt = (
      id: string,
      expiresAt: Date,
      status: StudioInterrupt["status"] = "pending",
    ): StudioInterrupt => ({
      id,
      status,
      type: "choice",
      interactionMode: "dynamic-picker",
      contract: null,
      schemaId: "pick-agent",
      schemaVersion: "1",
      createdAt: new Date(now - 60_000).toISOString(),
      resolvedAt: null,
      expiresAt: expiresAt.toISOString(),
      question: "Choose an agent",
      contentCaptured: true,
      request: null,
      requestCaptured: false,
      optionCount: 0,
      options: null,
      workflowId: "canvas-creation",
      nodeId: "collectAgent",
      sessionId: `session-${id}`,
      userId: "user",
      tenantId: "tenant",
      response: null,
      responseValue: null,
      responseCaptured: false,
      resumeOutcome: null,
      resumeError: null,
      runId: `run-${id}`,
      resumeToken: null,
      resolvedBy: null,
      environment: "test",
    });
    const future = interrupt(`${marker}-future`, new Date(now + 60_000));
    const expired = interrupt(`${marker}-expired`, new Date(now - 1_000));
    await client.db.insert(studioInterrupts).values(
      [future, expired].map((data) => ({
        organizationId: organizationA,
        projectId: projectA,
        interruptId: data.id,
        runId: data.runId,
        sessionId: data.sessionId,
        status: data.status,
        type: data.type,
        createdAt: new Date(data.createdAt),
        resolvedAt: null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        workflowId: data.workflowId,
        nodeId: data.nodeId,
        environment: data.environment,
        userId: data.userId,
        tenantId: data.tenantId,
        resolvedBy: null,
        resumeOutcome: null,
        hasError: false,
        searchText: marker,
        data,
        updatedAt: new Date(),
      })),
    );

    const pending = await listStudioInterrupts(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      query: { range: "All time", q: marker, status: "pending" },
    });
    const expiredPage = await listStudioInterrupts(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      query: { range: "All time", q: marker, status: "expired" },
    });
    const expiredOutcome = await listStudioInterrupts(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      query: {
        range: "All time",
        q: marker,
        outcome: "expired before resume",
      },
    });

    expect(pending.items.map((item) => item.id)).toEqual([future.id]);
    expect(expiredPage.items).toMatchObject([
      {
        id: expired.id,
        status: "expired",
        resumeOutcome: "expired before resume",
      },
    ]);
    expect(expiredOutcome.items.map((item) => item.id)).toEqual([expired.id]);

    const indexes = await client.db.execute(sql`
      select indexname
      from pg_indexes
      where schemaname = current_schema()
        and tablename = 'studio_interrupts'
    `);
    expect(
      indexes.map((row) => String(row.indexname ?? "")).join("\n"),
    ).toContain("studio_interrupts_scope_status_expires_idx");
  });

  it("matches all/any across the full dataset without widening project, time or environment scope", async () => {
    const input = { organizationId: organizationA, projectId: projectA };
    const rules = [
      { field: "workflowIds", operator: "contains", values: ["special"] },
      { field: "status", operator: "is", values: ["completed"] },
    ];
    const all = await listStudioRuns(client.db, {
      ...input,
      query: {
        range: "All time",
        env: "test",
        pageSize: "1",
        tableFilters: JSON.stringify({ match: "all", rules }),
      },
    });
    expect(all.totalCount).toBe(0);
    const any = await listStudioRuns(client.db, {
      ...input,
      query: {
        range: "All time",
        env: "test",
        pageSize: "1",
        tableFilters: JSON.stringify({ match: "any", rules }),
      },
    });
    expect(any.totalCount).toBeGreaterThan(1);
    expect(any.items).toHaveLength(1);
    expect(any.items[0]?.environment).toBe("test");
    const isolated = await listStudioRuns(client.db, {
      organizationId: organizationB,
      projectId: projectB,
      query: {
        range: "All time",
        tableFilters: JSON.stringify({
          match: "any",
          rules: [
            { field: "id", operator: "is", values: ["run-page-000"] },
            { field: "workflowIds", operator: "contains", values: ["special"] },
          ],
        }),
      },
    });
    expect(isolated.totalCount).toBe(0);
    const outside = await listStudioRuns(client.db, {
      ...input,
      query: {
        range: "Custom range",
        startedAfter: "2000-01-01T00:00:00Z",
        startedBefore: "2000-01-02T00:00:00Z",
        tableFilters: JSON.stringify({ match: "any", rules }),
      },
    });
    expect(outside.totalCount).toBe(0);
    const suggestions = await listStudioFilterValues(client.db, {
      ...input,
      resource: "runs",
      field: "workflowIds",
      search: "special",
      environment: "test",
    });
    expect(suggestions).toEqual(["workflow-special"]);
    const otherSuggestions = await listStudioFilterValues(client.db, {
      organizationId: organizationB,
      projectId: projectB,
      resource: "runs",
      field: "workflowIds",
      search: "special",
    });
    expect(otherSuggestions).toEqual([]);
  });

  it("filters zero numeric bounds and unknown values consistently with the client contract", async () => {
    const input = { organizationId: organizationA, projectId: projectA };
    const free = await listStudioRuns(client.db, {
      ...input,
      query: {
        range: "All time",
        tableFilters: JSON.stringify({
          match: "all",
          rules: [{ field: "cost", operator: "lte", values: [0] }],
        }),
      },
    });
    expect(free.totalCount).toBe(0);
    const missing = await listStudioRuns(client.db, {
      ...input,
      query: {
        range: "All time",
        tableFilters: JSON.stringify({
          match: "all",
          rules: [{ field: "sessionId", operator: "missing", values: [] }],
        }),
      },
    });
    expect(missing.totalCount).toBeGreaterThan(0);
    await expect(
      listStudioRuns(client.db, {
        ...input,
        query: {
          tableFilters: JSON.stringify({
            match: "any",
            rules: [
              {
                field: "organizationId",
                operator: "is",
                values: [organizationB],
              },
            ],
          }),
        },
      }),
    ).rejects.toThrow("Invalid table filters");
  });

  it("keeps common status/time and workflow filters indexable", async () => {
    await client.db.execute(sql`analyze studio_runs`);
    const plans = await client.db.transaction(async (transaction) => {
      await transaction.execute(sql`set local enable_seqscan = off`);
      return Promise.all([
        transaction.execute(sql`
          explain (format text)
          select "data"
          from "studio_runs"
          where "organization_id" = ${organizationA}
            and "project_id" = ${projectA}
            and "status" = 'failed'
            and "started_at" >= now() - interval '1 day'
          order by "started_at" desc
          limit 20
        `),
        transaction.execute(sql`
          explain (format text)
          select "data"
          from "studio_runs"
          where "workflow_ids" @> '["workflow-special"]'::jsonb
        `),
      ]);
    });
    const text = plans
      .flat()
      .map((row) => String(row["QUERY PLAN"] ?? ""))
      .join("\n");

    expect(text).toContain("studio_runs_scope_status_started_idx");
    expect(text).toContain("studio_runs_workflow_ids_gin_idx");
  });

  it("maintains projections transactionally and leaves duplicates unchanged", async () => {
    const now = new Date();
    const event: KortyxTelemetryEvent = {
      schemaVersion: 1,
      eventId: `event-${randomUUID()}`,
      occurredAt: now.toISOString(),
      environment: "test",
      service: { name: "integration-test" },
      correlation: {
        runId: "run-ingested",
        sessionId: "session-ingested",
        workflowId: "workflow-a",
      },
      type: "span.started",
      payload: { name: "kortyx.run" },
    };

    const first = await ingestTelemetryEvents(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      events: [event],
    });
    const duplicate = await ingestTelemetryEvents(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      events: [event],
    });
    const projected = await listStudioRuns(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      query: { range: "All time", q: "run-ingested" },
    });

    expect(first).toEqual({ accepted: 1, inserted: 1, duplicates: 0 });
    expect(duplicate).toEqual({ accepted: 1, inserted: 0, duplicates: 1 });
    expect(projected.items.map((run) => run.id)).toEqual(["run-ingested"]);
  });

  it.each([
    false,
    true,
  ])("preserves zero-usage and missing-pricing semantics in session projections (missing pricing: %s)", async (missingPricing) => {
    const sessionId = `session-cost-${randomUUID()}`;
    const modelRunId = `model-${sessionId}`;
    const zeroRunId = `zero-${sessionId}`;
    let occurredAt = Date.now();
    const fact = (
      runId: string,
      type: KortyxTelemetryEvent["type"],
      payload: Record<string, unknown>,
      spanId = `root-${runId}`,
    ): KortyxTelemetryEvent => ({
      schemaVersion: 1,
      eventId: randomUUID(),
      occurredAt: new Date(occurredAt++).toISOString(),
      environment: "test",
      service: { name: "cost-regression" },
      correlation: { runId, sessionId, workflowId: "workflow-a", spanId },
      type,
      payload,
    });
    const ingest = (events: KortyxTelemetryEvent[]) =>
      ingestTelemetryEvents(client.db, {
        organizationId: organizationA,
        projectId: projectA,
        events: TelemetryEventBatchSchema.parse({ events }).events,
      });
    await ingest([
      fact(modelRunId, "span.started", { name: "kortyx.run" }),
      fact(
        modelRunId,
        "generation.completed",
        {
          provider: "custom",
          model: "priced-model",
          usage: { input: 100, output: 50 },
          pricing: {
            source: "custom",
            currency: "USD",
            actualCostMicros: 250000,
          },
        },
        "model-span",
      ),
      ...(missingPricing
        ? [
            fact(
              modelRunId,
              "generation.completed",
              {
                provider: "custom",
                model: "missing-price-model",
                usage: { input: 100, output: 50 },
              },
              "unpriced-span",
            ),
          ]
        : []),
      fact(modelRunId, "span.ended", { name: "kortyx.run" }),
    ]);
    const zeroStart = fact(zeroRunId, "span.started", { name: "kortyx.run" });
    await ingest([zeroStart]);
    const read = () =>
      listStudioSessions(client.db, {
        organizationId: organizationA,
        projectId: projectA,
        query: { range: "All time", q: sessionId },
      });
    expect((await read()).items[0]?.cost).toBeNull();
    await ingest([fact(zeroRunId, "span.ended", { name: "kortyx.run" })]);
    const expected = {
      id: sessionId,
      runs: 2,
      cost: missingPricing ? null : 0.25,
      currency: missingPricing ? null : "USD",
      pricingStatus: missingPricing ? "unpriced" : "priced",
      costSummary: {
        amounts: [{ amount: 0.25, currency: "USD" }],
        complete: !missingPricing,
      },
    };
    expect((await read()).items[0]).toMatchObject(expected);
    const filtered = await listStudioSessions(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      query: { range: "All time", q: sessionId, minCost: "0.2" },
    });
    expect(filtered.items[0]).toMatchObject(expected);
    const detail = await getStudioSessionReadModel(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      sessionId,
    });
    expect(detail.sessions[0]).toMatchObject(expected);
    expect(detail.runs.find((run) => run.id === zeroRunId)).toMatchObject({
      cost: 0,
      pricingStatus: "priced",
      currency: null,
      pricingSource: null,
    });

    // Rebuild stale materialized totals using the existing operational backfill.
    await client.db
      .update(studioSessions)
      .set({
        cost: null,
        data: { ...detail.sessions[0], cost: null, pricingStatus: "unknown" },
      })
      .where(eq(studioSessions.sessionId, sessionId));
    await backfillStudioProjections(client.db, {
      organizationId: organizationA,
      projectId: projectA,
    });
    expect((await read()).items[0]).toMatchObject(expected);
  });

  it("keeps a human interrupt visible when suspension and checkpoint facts share its batch", async () => {
    const runId = `run-interrupt-${randomUUID()}`;
    const interruptId = `interrupt-${randomUUID()}`;
    const occurredAt = Date.now();
    const correlation = {
      runId,
      sessionId: `session-${randomUUID()}`,
      workflowId: "workflow-a",
      nodeId: "approval",
    };
    const facts: KortyxTelemetryEvent[] = [
      { type: "span.started", payload: { name: "kortyx.run" } },
      { type: "workflow.suspended", payload: { reason: "interrupt" } },
      {
        type: "interrupt.created",
        payload: { interruptId, kind: "text", nodeId: "approval" },
      },
      {
        type: "session.checkpointed",
        payload: { checkpointId: `checkpoint-${randomUUID()}`, turnIndex: 1 },
      },
    ].map((fact, index) => ({
      ...fact,
      schemaVersion: 1,
      eventId: `event-${randomUUID()}`,
      occurredAt: new Date(occurredAt + index).toISOString(),
      environment: "test",
      service: { name: "integration-test" },
      correlation,
    }));

    const accepted = await ingestTelemetryEvents(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      events: TelemetryEventBatchSchema.parse({ events: facts }).events,
    });
    const interrupts = await listStudioInterrupts(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      query: { range: "All time", q: interruptId },
    });
    const run = await getStudioRunReadModel(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      runId,
    });

    expect(accepted).toEqual({ accepted: 4, inserted: 4, duplicates: 0 });
    expect(interrupts.items).toEqual([
      expect.objectContaining({ id: interruptId, status: "pending", runId }),
    ]);
    expect(run.interrupts).toEqual([
      expect.objectContaining({ id: interruptId, status: "pending" }),
    ]);
  });

  it("reprojects an earlier start-only run when its session later completes", async () => {
    const sessionId = `session-lifecycle-${randomUUID()}`;
    const incompleteRunId = `run-incomplete-${randomUUID()}`;
    const completedRunId = `run-completed-${randomUUID()}`;
    const occurredAt = Date.now();
    const lifecycleEvents: KortyxTelemetryEvent[] = [
      {
        schemaVersion: 1,
        eventId: `event-${randomUUID()}`,
        occurredAt: new Date(occurredAt).toISOString(),
        environment: "test",
        service: { name: "integration-test" },
        correlation: {
          runId: incompleteRunId,
          sessionId,
          workflowId: "workflow-a",
          traceId: `trace-${incompleteRunId}`,
          spanId: `span-${incompleteRunId}`,
        },
        type: "span.started",
        payload: { name: "kortyx.run" },
      },
      {
        schemaVersion: 1,
        eventId: `event-${randomUUID()}`,
        occurredAt: new Date(occurredAt + 1_000).toISOString(),
        environment: "test",
        service: { name: "integration-test" },
        correlation: {
          runId: completedRunId,
          sessionId,
          workflowId: "workflow-a",
          traceId: `trace-${completedRunId}`,
          spanId: `span-${completedRunId}`,
        },
        type: "span.started",
        payload: { name: "kortyx.run" },
      },
      {
        schemaVersion: 1,
        eventId: `event-${randomUUID()}`,
        occurredAt: new Date(occurredAt + 2_000).toISOString(),
        environment: "test",
        service: { name: "integration-test" },
        correlation: {
          runId: completedRunId,
          sessionId,
          workflowId: "workflow-a",
          traceId: `trace-${completedRunId}`,
          spanId: `span-${completedRunId}`,
        },
        type: "span.ended",
        payload: { name: "kortyx.run", durationMs: 1_000 },
      },
    ];

    await ingestTelemetryEvents(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      events: lifecycleEvents,
    });
    const projected = await listStudioRuns(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      query: { range: "All time", session: sessionId },
    });
    const incompleteDetail = await getStudioRunReadModel(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      runId: incompleteRunId,
    });

    expect(
      projected.items.find((run) => run.id === incompleteRunId),
    ).toMatchObject({
      status: "incomplete",
      endedAt: null,
      durationMs: null,
    });
    expect(
      projected.items.find((run) => run.id === completedRunId),
    ).toMatchObject({
      status: "completed",
    });
    expect(
      incompleteDetail.runs.find((run) => run.id === incompleteRunId),
    ).toMatchObject({
      status: "incomplete",
    });
  });

  it("publishes one compact invalidation only after a new event commits", async () => {
    const event: KortyxTelemetryEvent = {
      schemaVersion: 1,
      eventId: `event-${randomUUID()}`,
      occurredAt: new Date().toISOString(),
      environment: "test",
      service: { name: "integration-test" },
      correlation: {
        runId: `run-change-${randomUUID()}`,
        sessionId: `session-change-${randomUUID()}`,
        workflowId: "workflow-a",
      },
      type: "span.started",
      payload: { name: "kortyx.run", privateValue: "never-forwarded" },
    };
    const changes: unknown[] = [];
    const listener = await client.sql.listen(
      STUDIO_CHANGE_CHANNEL,
      (payload) => {
        changes.push(JSON.parse(payload) as unknown);
      },
    );

    try {
      await ingestTelemetryEvents(client.db, {
        organizationId: organizationA,
        projectId: projectA,
        events: [event],
      });
      await vi.waitFor(() => expect(changes).toHaveLength(1));
      const change = StudioChangeSchema.parse(changes[0]);
      expect(change).toMatchObject({
        organizationId: organizationA,
        projectId: projectA,
        resources: ["runs", "sessions"],
      });
      expect(JSON.stringify(change)).not.toContain("privateValue");

      await ingestTelemetryEvents(client.db, {
        organizationId: organizationA,
        projectId: projectA,
        events: [event],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(changes).toHaveLength(1);
    } finally {
      await listener.unlisten();
    }
  });

  it("rebuilds a missing projection with parity from immutable events", async () => {
    await client.db
      .delete(studioRuns)
      .where(eq(studioRuns.runId, "run-ingested"));
    const source = await getStudioRunReadModel(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      runId: "run-ingested",
    });
    await backfillStudioProjections(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      batchSize: 10,
    });
    const projected = await listStudioRuns(client.db, {
      organizationId: organizationA,
      projectId: projectA,
      query: { range: "All time", q: "run-ingested" },
    });

    expect(projected.items).toEqual(
      source.runs.map((run) => ({
        ...run,
        feedback: { positive: 0, negative: 0 },
      })),
    );
  });
});
