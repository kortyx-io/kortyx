import { randomUUID } from "node:crypto";
import {
  type KortyxTelemetryEvent,
  StudioRunDetailResponseSchema,
  StudioRunsResponseSchema,
  StudioScoreResponseSchema,
  StudioSessionDetailResponseSchema,
} from "@kortyx/telemetry-contracts";
import {
  createTelemetryApiKey,
  createTelemetryDbClient,
  ingestTelemetryEvents,
  type TelemetryDbClient,
} from "@kortyx/telemetry-db";
import {
  organizations,
  projectEnvironments,
  projects,
} from "@kortyx/telemetry-db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp } from "../src/app";

const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("native feedback API (PostgreSQL)", () => {
  let client: TelemetryDbClient;
  let app: ReturnType<typeof createApiApp>;
  const organizationId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const pepper = "scores-integration-pepper";
  const runId = `feedback-${randomUUID()}`;
  const sessionId = `session-${randomUUID()}`;
  const unratedRunId = `unrated-${randomUUID()}`;
  let telemetryKey: string;
  let readKey: string;
  let reviewKey: string;
  let otherKey: string;

  const call = (path: string, key: string, method = "GET", body?: unknown) =>
    app.request(`http://api.test${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const rating = (value: 0 | 1, changes: Record<string, unknown> = {}) =>
    call("/v1/telemetry/scores", telemetryKey, "POST", {
      runId,
      actorId: "user-a",
      value,
      ...changes,
    });

  beforeAll(async () => {
    client = createTelemetryDbClient(databaseUrl as string);
    await client.db
      .insert(organizations)
      .values({ id: organizationId, name: "Score test" });
    await client.db.insert(projects).values([
      { id: projectId, organizationId, name: "Scores" },
      { id: otherProjectId, organizationId, name: "Other scores" },
    ]);
    await client.db.insert(projectEnvironments).values([
      { organizationId, projectId, name: "test" },
      { organizationId, projectId: otherProjectId, name: "test" },
    ]);
    const key = async (scopes: string[], project = projectId) =>
      (
        await createTelemetryApiKey(client.db, {
          organizationId,
          projectId: project,
          pepper,
          name: "test",
          scopes,
        })
      ).apiKey;
    telemetryKey = await key(["telemetry:write"]);
    readKey = await key(["studio:read"]);
    reviewKey = await key(["studio:read", "studio:write"]);
    otherKey = await key(
      ["telemetry:write", "studio:read", "studio:write"],
      otherProjectId,
    );
    const events: KortyxTelemetryEvent[] = [runId, unratedRunId].flatMap(
      (id) => {
        const base = {
          schemaVersion: 1 as const,
          environment: "test",
          service: { name: "test" },
          correlation: {
            runId: id,
            sessionId,
            workflowId: "answer",
            traceId: `trace-${id}`,
            spanId: `span-${id}`,
          },
          context: { userId: "user-a" },
        };
        return [
          {
            ...base,
            eventId: `${id}-start`,
            occurredAt: new Date(Date.now() - 1000).toISOString(),
            type: "span.started" as const,
            payload: { name: "kortyx.run" },
          },
          {
            ...base,
            eventId: `${id}-end`,
            occurredAt: new Date().toISOString(),
            type: "span.ended" as const,
            payload: { name: "kortyx.run", output: "answer" },
          },
        ];
      },
    );
    await ingestTelemetryEvents(client.db, {
      organizationId,
      projectId,
      events,
    });
    app = createApiApp({ db: client.db, apiKeyPepper: pepper });
  });
  afterAll(async () => {
    if (client) {
      await client.sql`delete from organizations where id = ${organizationId}`;
      await client.close();
    }
  });

  it("upserts one current vote per actor, preserves its ID, and records reasons/comments", async () => {
    const first = await rating(0, {
      reasons: ["incorrect", "incorrect"],
      comment: "Wrong account",
    });
    expect(first.status).toBe(200);
    const { score } = StudioScoreResponseSchema.parse(await first.json());
    expect(score).toMatchObject({
      source: "end-user",
      name: "user-feedback",
      dataType: "BOOLEAN",
      value: 0,
      reasons: ["incorrect"],
      comment: "Wrong account",
    });
    const second = await rating(1);
    expect(
      StudioScoreResponseSchema.parse(await second.json()).score,
    ).toMatchObject({
      id: score.id,
      value: 1,
      comment: null,
      reasons: [],
    });
    const rows =
      await client.sql`select * from telemetry_scores where run_id = ${runId}`;
    expect(rows).toHaveLength(1);
  });
  it("keeps reviewer identity server-derived and reviews out of satisfaction counts", async () => {
    expect(
      (
        await call(`/v1/studio/runs/${runId}/review`, readKey, "POST", {
          value: "incorrect",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(`/v1/studio/runs/${runId}/review`, reviewKey, "POST", {
          value: "incorrect",
          actorId: "forged",
        })
      ).status,
    ).toBe(400);
    const saved = await call(
      `/v1/studio/runs/${runId}/review`,
      reviewKey,
      "POST",
      { value: "incorrect", comment: "Reviewed" },
    );
    expect(saved.status).toBe(200);
    const { score } = StudioScoreResponseSchema.parse(await saved.json());
    expect(score.actorId).toMatch(/^studio-key:/);
    await rating(0);
    const detail = StudioRunDetailResponseSchema.parse(
      await (await call(`/v1/studio/runs/${runId}`, reviewKey)).json(),
    );
    expect(detail.run).toMatchObject({
      status: "completed",
      feedback: { positive: 0, negative: 1 },
    });
    expect(detail.scores).toHaveLength(2);
    expect(detail.canReview).toBe(true);
    expect(detail.reviewActorId).toBe(score.actorId);
    expect(
      StudioRunDetailResponseSchema.parse(
        await (await call(`/v1/studio/runs/${runId}`, readKey)).json(),
      ).canReview,
    ).toBe(false);
  });
  it("filters before pagination, reports counts, and shows session feedback", async () => {
    await rating(1, { actorId: "user-b" });
    for (const feedback of ["positive", "negative"] as const) {
      const page = StudioRunsResponseSchema.parse(
        await (
          await call(
            `/v1/studio/runs?range=All%20time&feedback=${feedback}&pageSize=1`,
            readKey,
          )
        ).json(),
      );
      expect(page.totalCount).toBe(1);
      expect(page.runs[0]).toMatchObject({
        id: runId,
        feedback: { positive: 1, negative: 1 },
      });
    }
    const unrated = StudioRunsResponseSchema.parse(
      await (
        await call("/v1/studio/runs?range=All%20time&feedback=unrated", readKey)
      ).json(),
    );
    expect(unrated.runs.map((run: { id: string }) => run.id)).toEqual([
      unratedRunId,
    ]);
    expect(
      (await call("/v1/studio/runs?feedback=invalid", readKey)).status,
    ).toBe(400);
    const session = StudioSessionDetailResponseSchema.parse(
      await (await call(`/v1/studio/sessions/${sessionId}`, readKey)).json(),
    );
    expect(session.runs.find((run) => run.id === runId)?.feedback).toEqual({
      positive: 1,
      negative: 1,
    });
  });
  it("rejects missing credentials, wrong scopes, unknown runs, and cross-project writes/reads/deletes", async () => {
    expect(
      (
        await app.request("http://api.test/v1/telemetry/scores", {
          method: "POST",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call("/v1/telemetry/scores", readKey, "POST", {
          runId,
          actorId: "user-a",
          value: 0,
        })
      ).status,
    ).toBe(403);
    expect((await rating(0, { runId: "missing" })).status).toBe(404);
    expect(
      (
        await call("/v1/telemetry/scores", otherKey, "POST", {
          runId,
          actorId: "user-a",
          value: 0,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("/v1/telemetry/scores", otherKey, "DELETE", {
          runId,
          actorId: "user-a",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(`/v1/studio/runs/${runId}/review`, otherKey, "POST", {
          value: "correct",
        })
      ).status,
    ).toBe(404);
    expect((await call(`/v1/studio/runs/${runId}`, otherKey)).status).toBe(404);
  });
  it("handles concurrent re-ratings without duplicates and enforces typed values in PostgreSQL", async () => {
    const results = await Promise.all([rating(0), rating(1), rating(0)]);
    expect(results.map((response) => response.status)).toEqual([200, 200, 200]);
    const rows =
      await client.sql`select * from telemetry_scores where run_id = ${runId}`;
    expect(
      rows.filter(
        (row) => row.source === "end-user" && row.actor_id === "user-a",
      ),
    ).toHaveLength(1);
    await expect(
      client.sql`update telemetry_scores set value = '2'::jsonb where run_id = ${runId} and source = 'end-user'`,
    ).rejects.toThrow();
  });
  it("preserves scores when later telemetry refreshes the run projection", async () => {
    const before = StudioRunDetailResponseSchema.parse(
      await (await call(`/v1/studio/runs/${runId}`, readKey)).json(),
    );
    await ingestTelemetryEvents(client.db, {
      organizationId,
      projectId,
      events: [
        {
          schemaVersion: 1,
          eventId: `${runId}-later-end`,
          occurredAt: new Date().toISOString(),
          environment: "test",
          service: { name: "test" },
          correlation: {
            runId,
            sessionId,
            workflowId: "answer",
            traceId: `trace-${runId}`,
            spanId: `span-${runId}`,
          },
          context: { userId: "user-a" },
          type: "span.ended",
          payload: { name: "kortyx.run", output: "answer" },
        },
      ],
    });
    const after = StudioRunDetailResponseSchema.parse(
      await (await call(`/v1/studio/runs/${runId}`, readKey)).json(),
    );
    expect(after.scores).toEqual(before.scores);
    expect(after.run.feedback).toEqual(before.run.feedback);
  });
  it("clears only the requested actor/source, is repeatable, and leaves execution unchanged", async () => {
    await rating(0);
    const path = `/v1/studio/runs/${runId}/review`;
    expect((await call(path, readKey, "DELETE")).status).toBe(403);
    expect((await call(path, reviewKey, "DELETE")).status).toBe(200);
    expect((await call(path, reviewKey, "DELETE")).status).toBe(200);
    expect(
      (
        await call("/v1/telemetry/scores", telemetryKey, "DELETE", {
          runId,
          actorId: "user-a",
        })
      ).status,
    ).toBe(200);
    const detail = StudioRunDetailResponseSchema.parse(
      await (await call(`/v1/studio/runs/${runId}`, readKey)).json(),
    );
    expect(detail.scores).toHaveLength(1);
    expect(detail.scores?.[0]?.actorId).toBe("user-b");
    expect(detail.run).toMatchObject({
      status: "completed",
      feedback: { positive: 1, negative: 0 },
    });
  });
});
