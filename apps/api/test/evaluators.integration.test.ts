import { randomUUID } from "node:crypto";
import {
  DEFAULT_ASSESSMENT_GROUP,
  EvaluatorExecutionSchema,
  EvaluatorRuleSchema,
  EvaluatorSchema,
  ScoreGroupSchema,
} from "@kortyx/telemetry-contracts";
import {
  claimEvaluatorExecution,
  createTelemetryApiKey,
  createTelemetryDbClient,
  enqueueEvaluatorExecution,
  finishEvaluatorExecution,
  ingestTelemetryEvents,
  publishedEvaluator,
  scheduleEvaluatorRules,
  setEvaluatorDataset,
  type TelemetryDbClient,
} from "@kortyx/telemetry-db";
import {
  organizations,
  projectEnvironments,
  projects,
} from "@kortyx/telemetry-db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApiApp } from "../src/app";
import type { EvaluatorModelService } from "../src/evaluators/model";
import { createEvaluatorWorker } from "../src/evaluators/worker";

const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("Evaluator API and durable worker", () => {
  let client: TelemetryDbClient;
  let app: ReturnType<typeof createApiApp>;
  let key: string, readKey: string, otherKey: string;
  const organizationId = randomUUID(),
    projectId = randomUUID(),
    otherProject = randomUUID();
  const runId = `evaluator-test-${randomUUID()}`;
  const scope = { organizationId, projectId };
  let evaluatorId: string, revision: number;
  let groupId: string;
  let calls = 0;
  let malformed = false;
  const models: EvaluatorModelService = {
    models: ["test/judge"],
    async invoke(_model, _messages, _signal, onUsage) {
      calls++;
      onUsage({ inputTokens: 12, outputTokens: 8, costUsd: 0.001 });
      return {
        scores: malformed
          ? [
              {
                fieldId: "assessment",
                status: "scored",
                value: "Invalid partial score",
                evidence: [],
              },
            ]
          : [
              {
                fieldId: "assessment",
                status: "scored",
                value: "The recorded result matches the supplied evidence.",
                evidence: [],
              },
              {
                fieldId: "correct",
                status: "scored",
                value: false,
                evidence: [],
              },
            ],
      };
    },
  };
  const request = async (path: string, body?: unknown, credential = key) =>
    app.request(`http://test/v1/studio/evaluators${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  beforeAll(async () => {
    if (!databaseUrl)
      throw new Error("Set DATABASE_URL to run this integration test.");
    client = createTelemetryDbClient(databaseUrl);
    await client.db
      .insert(organizations)
      .values({ id: organizationId, name: "Evaluator integration" });
    await client.db.insert(projects).values([
      { id: projectId, organizationId, name: "Evaluator A" },
      { id: otherProject, organizationId, name: "Evaluator B" },
    ]);
    await client.db.insert(projectEnvironments).values([
      { organizationId, projectId, name: "test" },
      { organizationId, projectId, name: "staging" },
      { organizationId, projectId: otherProject, name: "test" },
    ]);
    const makeKey = async (scopes: string[], project = projectId) =>
      (
        await createTelemetryApiKey(client.db, {
          organizationId,
          projectId: project,
          pepper: "evaluator-test",
          name: "integration",
          scopes,
        })
      ).apiKey;
    key = await makeKey(["studio:read", "studio:write", "eval:run"]);
    readKey = await makeKey(["studio:read"]);
    otherKey = await makeKey(["studio:read"], otherProject);
    app = createApiApp({
      db: client.db,
      apiKeyPepper: "evaluator-test",
      evaluatorModels: models,
      evaluatorWorkerAvailable: true,
    });
    const promptResponse = await app.request(
      "http://test/v1/studio/prompts/actions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "create",
          key: `evaluators/test-${randomUUID()}`,
          name: "Test judge",
          note: "Integration",
          content: {
            format: "system-user",
            messages: [
              { role: "system", content: "Judge the supplied evidence." },
              { role: "user", content: "{{evidence}}" },
            ],
            variablesSchema: {
              type: "object",
              properties: { evidence: { type: "string" } },
              required: ["evidence"],
              additionalProperties: false,
            },
            configSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            config: {},
            dependencies: [],
          },
        }),
      },
    );
    expect(promptResponse.status).toBe(200);
    const prompt = z
      .object({ id: z.uuid() })
      .parse(await promptResponse.json());
    const group = ScoreGroupSchema.parse(
      await (
        await request("/score-groups", {
          name: "Integration quality",
          fields: [
            {
              id: "assessment",
              label: "Assessment",
              type: "text",
              description: "Explain the conclusion.",
              maxLength: 2000,
              abstain: false,
            },
            {
              id: "correct",
              label: "Correct",
              type: "boolean",
              description: "Whether the recorded answer is correct.",
              abstain: true,
            },
          ],
        })
      ).json(),
    );
    groupId = group.id;
    const created = await request("", {
      name: "Integration judge",
      prompt: { id: prompt.id, version: 1 },
      model: "test/judge",
      scoreGroup: { id: group.id, version: 1 },
      evidence: "trajectory",
    });
    expect(created.status).toBe(201);
    const evaluator = EvaluatorSchema.parse(await created.json());
    evaluatorId = evaluator.id;
    revision = evaluator.revision;
    const time = new Date().toISOString();
    await ingestTelemetryEvents(client.db, {
      organizationId,
      projectId,
      events: [
        {
          eventId: randomUUID(),
          schemaVersion: 1,
          type: "span.started",
          occurredAt: time,
          environment: "test",
          service: { name: "evaluator-integration" },
          correlation: { runId, workflowId: "test-workflow" },
          payload: { name: "kortyx.run", input: "Fixture request" },
        },
        {
          eventId: randomUUID(),
          schemaVersion: 1,
          type: "span.ended",
          occurredAt: time,
          environment: "test",
          service: { name: "evaluator-integration" },
          correlation: { runId, workflowId: "test-workflow" },
          payload: { name: "kortyx.run", output: "Fixture answer" },
        },
      ] as Parameters<typeof ingestTelemetryEvents>[1]["events"],
    });
  });
  afterAll(async () => {
    if (client) {
      await client.sql`delete from organizations where id=${organizationId}`;
      await client.close();
    }
  });
  it("enforces write permission and project isolation", async () => {
    expect((await request(`/${evaluatorId}`, undefined, otherKey)).status).toBe(
      404,
    );
    expect(
      (await request(`/${evaluatorId}/publish`, { revision }, readKey)).status,
    ).toBe(403);
  });
  it("rejects stale publication and creates immutable versions", async () => {
    expect(
      (await request(`/${evaluatorId}/publish`, { revision: revision + 1 }))
        .status,
    ).toBe(409);
    const published = await request(`/${evaluatorId}/publish`, { revision });
    expect(published.status).toBe(200);
    revision = EvaluatorSchema.parse(await published.json()).revision;
  });
  it("versions score groups without changing published schemas", async () => {
    const definition = {
      name: "Quality revised",
      fields: DEFAULT_ASSESSMENT_GROUP.fields,
    };
    const next = await request(`/score-groups/${groupId}/versions`, {
      baseVersion: 1,
      definition,
    });
    expect(next.status).toBe(201);
    expect(ScoreGroupSchema.parse(await next.json()).version).toBe(2);
    expect(
      (
        await request(`/score-groups/${groupId}/versions`, {
          baseVersion: 1,
          definition,
        })
      ).status,
    ).toBe(409);
    const detail = (await (await request(`/${evaluatorId}`)).json()) as {
      versions: { definition: { scoreGroup: { version: number } } }[];
    };
    expect(detail.versions[0]?.definition.scoreGroup.version).toBe(1);
  });
  it("deduplicates rule creation retries and rejects conflicting settings", async () => {
    const payload = {
      creationId: randomUUID(),
      definition: {
        name: "Retry-safe rule",
        evaluatorVersion: 1,
        environment: "test",
        stage: "completed",
        workflowId: "",
        sampleRate: 1,
        dailyLimit: 1,
        enabled: false,
      },
    };
    const first = EvaluatorRuleSchema.parse(
      await (await request(`/${evaluatorId}/rules`, payload)).json(),
    );
    const repeated = EvaluatorRuleSchema.parse(
      await (await request(`/${evaluatorId}/rules`, payload)).json(),
    );
    expect(repeated.id).toBe(first.id);
    expect(
      (
        await request(`/${evaluatorId}/rules`, {
          ...payload,
          definition: { ...payload.definition, dailyLimit: 2 },
        })
      ).status,
    ).toBe(409);
  });
  it("renders bounded evidence before model invocation", async () => {
    const response = await request(`/${evaluatorId}/evidence`, {
      target: { type: "run", runId },
      revision,
    });
    expect(response.status).toBe(200);
    const result = z
      .object({ messages: z.array(z.object({ content: z.string() })) })
      .parse(await response.json());
    expect(
      result.messages.map((m: { content: string }) => m.content).join(" "),
    ).toContain("Fixture answer");
    expect(calls).toBe(0);
  });
  it("deduplicates concurrent requests and persists false quality independently of completion", async () => {
    const payload = {
      target: { type: "run", runId },
      version: 1,
      requestKey: randomUUID(),
    };
    const responses = await Promise.all([
      request(`/${evaluatorId}/evaluate`, payload),
      request(`/${evaluatorId}/evaluate`, payload),
    ]);
    const results = await Promise.all(
      responses.map(async (r) =>
        EvaluatorExecutionSchema.parse(await r.json()),
      ),
    );
    expect(results[0]?.id).toBe(results[1]?.id);
    await createEvaluatorWorker(client.db, models, scope).tick();
    const saved = EvaluatorExecutionSchema.parse(
      await (await request(`/executions/${results[0]?.id}`)).json(),
    );
    expect(saved.status).toBe("completed");
    expect(
      saved.scores?.find((s: { fieldId: string }) => s.fieldId === "correct")
        ?.value,
    ).toBe(false);
    expect(calls).toBe(1);
    expect(
      (
        await request(`/${evaluatorId}/evaluate`, {
          ...payload,
          target: { type: "run", runId: "different" },
        })
      ).status,
    ).toBe(400);
  });
  it("retains usage and rejects the whole malformed result", async () => {
    malformed = true;
    const queued = EvaluatorExecutionSchema.parse(
      await (
        await request(`/${evaluatorId}/evaluate`, {
          target: { type: "run", runId },
          version: 1,
          requestKey: randomUUID(),
        })
      ).json(),
    );
    await createEvaluatorWorker(client.db, models, scope).tick();
    const saved = EvaluatorExecutionSchema.parse(
      await (await request(`/executions/${queued.id}`)).json(),
    );
    expect(saved.status).toBe("error");
    expect(saved.scores).toBeNull();
    expect(saved.usage?.inputTokens).toBe(12);
    malformed = false;
  });
  it("does not repeat a provider call after a worker lease expires", async () => {
    const queued = EvaluatorExecutionSchema.parse(
      await (
        await request(`/${evaluatorId}/evaluate`, {
          target: { type: "run", runId },
          version: 1,
          requestKey: randomUUID(),
        })
      ).json(),
    );
    const owner = randomUUID();
    const claimed = await claimEvaluatorExecution(client.db, owner, scope);
    expect(claimed?.id).toBe(queued.id);
    await client.sql`update evaluator_executions set lease_expires_at=now()-interval '1 second' where id=${queued.id}`;
    expect(
      await claimEvaluatorExecution(client.db, randomUUID(), scope),
    ).toBeUndefined();
    await finishEvaluatorExecution(client.db, queued.id, owner, {
      status: "completed",
      scores: [],
    });
    expect(
      EvaluatorExecutionSchema.parse(
        await (await request(`/executions/${queued.id}`)).json(),
      ).status,
    ).toBe("error");
  });
  it("enforces deterministic sampling, daily admission caps, and cursor recovery", async () => {
    const created = await request(`/${evaluatorId}/rules`, {
      definition: {
        name: "Bounded rule",
        evaluatorVersion: 1,
        environment: "test",
        stage: "completed",
        workflowId: "test-workflow",
        sampleRate: 1,
        dailyLimit: 1,
        enabled: true,
      },
    });
    expect(created.status).toBe(200);
    for (let index = 0; index < 2; index++) {
      const id = `rule-integration-${randomUUID()}`;
      const occurredAt = new Date().toISOString();
      await ingestTelemetryEvents(client.db, {
        ...scope,
        events: [
          {
            eventId: randomUUID(),
            schemaVersion: 1,
            type: "span.started",
            occurredAt,
            environment: "test",
            service: { name: "evaluator-integration" },
            correlation: { runId: id, workflowId: "test-workflow" },
            payload: { name: "kortyx.run", input: "Question" },
          },
          {
            eventId: randomUUID(),
            schemaVersion: 1,
            type: "span.ended",
            occurredAt,
            environment: "test",
            service: { name: "evaluator-integration" },
            correlation: { runId: id, workflowId: "test-workflow" },
            payload: { name: "kortyx.run", output: "Answer" },
          },
        ] as Parameters<typeof ingestTelemetryEvents>[1]["events"],
      });
    }
    const sharedRuns =
      await client.sql`select run_id from studio_runs where project_id=${projectId} and run_id like 'rule-integration-%'`;
    for (const row of sharedRuns) {
      const occurredAt = new Date().toISOString();
      await ingestTelemetryEvents(client.db, {
        ...scope,
        events: [
          {
            eventId: randomUUID(),
            schemaVersion: 1,
            type: "span.started",
            occurredAt,
            environment: "staging",
            service: { name: "evaluator-integration" },
            correlation: { runId: row.run_id, workflowId: "test-workflow" },
            payload: { name: "kortyx.run", input: "Another environment" },
          },
          {
            eventId: randomUUID(),
            schemaVersion: 1,
            type: "span.ended",
            occurredAt,
            environment: "staging",
            service: { name: "evaluator-integration" },
            correlation: { runId: row.run_id, workflowId: "test-workflow" },
            payload: { name: "kortyx.run", output: "Staging answer" },
          },
        ] as Parameters<typeof ingestTelemetryEvents>[1]["events"],
      });
    }
    const before = calls;
    const worker = createEvaluatorWorker(client.db, models, scope);
    await worker.tick();
    await worker.tick();
    await worker.tick();
    expect(calls - before).toBe(1);
    const counts =
      await client.sql`select count(*)::integer as count from evaluator_executions where organization_id=${organizationId} and project_id=${projectId} and source='rule'`;
    expect(counts[0]?.count).toBe(1);
    const rule = EvaluatorRuleSchema.parse(await created.json());
    await request(`/${evaluatorId}/rules`, {
      id: rule.id,
      revision: rule.revision,
      definition: {
        name: rule.name,
        evaluatorVersion: rule.evaluatorVersion,
        environment: rule.environment,
        stage: rule.stage,
        workflowId: rule.workflowId,
        sampleRate: rule.sampleRate,
        dailyLimit: rule.dailyLimit,
        enabled: false,
      },
    });
  });
  it("records oversized automatic evidence as an error without calling the provider", async () => {
    const oversizedRun = `oversized-${randomUUID()}`;
    const occurredAt = new Date().toISOString();
    await ingestTelemetryEvents(client.db, {
      ...scope,
      events: [
        {
          eventId: randomUUID(),
          schemaVersion: 1,
          type: "span.started",
          occurredAt,
          environment: "test",
          service: { name: "evaluator-integration" },
          correlation: { runId: oversizedRun, workflowId: "test-workflow" },
          payload: {
            name: "kortyx.run",
            input: Array.from({ length: 100 }, () => "x".repeat(8000)),
          },
        },
        {
          eventId: randomUUID(),
          schemaVersion: 1,
          type: "span.ended",
          occurredAt,
          environment: "test",
          service: { name: "evaluator-integration" },
          correlation: { runId: oversizedRun, workflowId: "test-workflow" },
          payload: { name: "kortyx.run", output: "Answer" },
        },
      ] as Parameters<typeof ingestTelemetryEvents>[1]["events"],
    });
    const before = calls;
    const snapshot = await publishedEvaluator(client.db, scope, {
      id: evaluatorId,
      version: 1,
    });
    const result = await enqueueEvaluatorExecution(
      client.db,
      { ...scope, environment: "test" },
      {
        evaluatorId,
        evaluatorVersion: 1,
        snapshot,
        target: { type: "run", runId: oversizedRun },
        source: "rule",
        requestKey: randomUUID(),
      },
    );
    expect(result.status).toBe("error");
    expect(result.error).toContain("exceeds 256 KB");
    expect(result.renderedMessages).toEqual([]);
    expect(JSON.stringify(result.evidence).length).toBeLessThan(2000);
    await createEvaluatorWorker(client.db, models, scope).tick();
    expect(calls).toBe(before);
  });
  it("keeps disabled rules from scheduling judge calls", async () => {
    const response = await request(`/${evaluatorId}/rules`, {
      definition: {
        name: "Disabled integration rule",
        evaluatorVersion: 1,
        environment: "test",
        stage: "completed",
        workflowId: "",
        sampleRate: 1,
        dailyLimit: 1,
        enabled: false,
      },
    });
    expect(response.status).toBe(200);
    const before = calls;
    await scheduleEvaluatorRules(client.db, scope);
    await createEvaluatorWorker(client.db, models, scope).tick();
    expect(calls).toBe(before);
  });
  it("deletes retained assessments and dataset defaults with their project", async () => {
    await setEvaluatorDataset(
      client.db,
      scope,
      { id: evaluatorId, version: 1 },
      "cleanup-target",
      "cleanup-dataset",
      true,
    );
    await client.sql`delete from projects where id=${projectId}`;
    const [remaining] =
      await client.sql`select (select count(*) from evaluator_definitions where project_id=${projectId}) + (select count(*) from evaluator_dataset_bindings where project_id=${projectId}) + (select count(*) from evaluator_executions where project_id=${projectId}) as count`;
    expect(Number(remaining?.count)).toBe(0);
  });
});
