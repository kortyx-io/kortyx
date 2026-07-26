import { randomUUID } from "node:crypto";
import type {
  KortyxTelemetryEvent,
  StudioRun,
} from "@kortyx/telemetry-contracts";
import { StudioChangeSchema } from "@kortyx/telemetry-contracts";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTelemetryDbClient, type TelemetryDbClient } from "../src/client";
import { STUDIO_CHANGE_CHANNEL } from "../src/repositories/studio-changes";
import { listStudioRuns } from "../src/repositories/studio-lists";
import { backfillStudioProjections } from "../src/repositories/studio-projections";
import { getStudioRunReadModel } from "../src/repositories/studio-read-models";
import { ingestTelemetryEvents } from "../src/repositories/telemetry-events";
import {
  organizations,
  projectEnvironments,
  projects,
  studioRuns,
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

    expect(projected.items).toEqual(source.runs);
  });
});
