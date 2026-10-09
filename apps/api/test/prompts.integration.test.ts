import { randomUUID } from "node:crypto";
import { getEvalSuiteRevision } from "@kortyx/agent";
import type { EvalManifest, EvalSuite } from "@kortyx/agent/evals";
import {
  createTelemetryApiKey,
  createTelemetryDbClient,
  getEvaluation,
  mutatePrompt,
} from "@kortyx/telemetry-db";
import {
  organizations,
  projectEnvironments,
  projects,
} from "@kortyx/telemetry-db/schema";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../src/app";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("prompt serving authorization", () => {
  it("keeps serving credentials read-only and binds serving to the authorized project and environment", async () => {
    const client = createTelemetryDbClient(url!);
    const [org] = await client.db
      .insert(organizations)
      .values({ name: `prompt-api-${randomUUID()}` })
      .returning();
    if (!org) throw new Error("Missing organization");
    try {
      const [project, other] = await client.db
        .insert(projects)
        .values([
          { organizationId: org.id, name: "one" },
          { organizationId: org.id, name: "two" },
        ])
        .returning();
      if (!project || !other) throw new Error("Missing projects");
      const scope = { organizationId: org.id, projectId: project.id };
      const [environment] = await client.db
        .insert(projectEnvironments)
        .values([
          { ...scope, name: "production" },
          { ...scope, name: "test" },
        ])
        .returning();
      const { apiKey } = await createTelemetryApiKey(client.db, {
        ...scope,
        environmentId: environment!.id,
        pepper: "test",
        name: "Serve only",
        mode: "test",
        scopes: ["prompt:serve"],
      });
      const created = await mutatePrompt(client.db, scope, "author", {
        action: "create",
        key: "classify",
        name: "Classify",
        categoryId: null,
        content: {
          format: "system-user",
          messages: [
            { role: "system", content: "Classify" },
            { role: "user", content: "{{message}}" },
          ],
          variablesSchema: {
            type: "object",
            properties: { message: { type: "string" } },
          },
          configSchema: { type: "object" },
          config: {},
          dependencies: [],
        },
        note: "Initial",
      });
      await mutatePrompt(client.db, scope, "author", {
        action: "promote",
        id: created.id as string,
        version: 1,
        environment: "production",
        expectedRevision: 0,
        rollback: false,
        exceptionReason: "Disposable bootstrap assignment",
      });
      const app = createApiApp({ db: client.db, apiKeyPepper: "test" });
      const resolve = (environmentName: string, projectId?: string) =>
        app.request("/v1/prompts/resolve", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            ...(projectId ? { "x-kortyx-project-id": projectId } : {}),
          },
          body: JSON.stringify({
            schemaVersion: 1,
            ids: ["classify"],
            environment: environmentName,
          }),
        });
      const response = await resolve("production");
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toMatchObject({
        environment: "production",
        versions: { classify: { version: 1 } },
      });
      expect((await resolve("test")).status).toBe(403);
      expect((await resolve("production", other.id)).status).toBe(403);
      expect(
        (
          await app.request(`/v1/studio/prompts/assets/${created.id}`, {
            headers: { authorization: `Bearer ${apiKey}` },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await app.request("/v1/studio/prompts/actions", {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ action: "group-create", name: "Forbidden" }),
          })
        ).status,
      ).toBe(403);

      const group = await mutatePrompt(client.db, scope, "author", {
        action: "group-create",
        name: "Shared baseline",
        members: [{ promptId: created.id as string, version: 1 }],
      });
      const suites: EvalManifest["suites"] = ["first", "second"].map((id) => ({
        id,
        cases: [
          {
            id: "case",
            steps: [{ message: "Hello", expect: { type: "answer" } }],
          },
        ],
      }));
      const manifest: EvalManifest = {
        schemaVersion: 1,
        attemptScheduling: true,
        suites,
        responders: [],
        references: [],
        judge: { id: "fixture", version: "1", location: "app" },
        promptContracts: [
          {
            id: "classify",
            format: "system-user",
            variablesSchema: { type: "object" },
            configSchema: { type: "object" },
          },
        ],
      };
      const target = {
        ...scope,
        id: "prompt-app",
        name: "Prompt app",
        environment: "production",
        url: "https://example.com/evals",
        serviceKey: "fixture",
        allowInsecureHttp: false,
      };
      const evalApp = createApiApp({
        db: client.db,
        apiKeyPepper: "test",
        evalTargetAdapter: {
          list: async () => [target],
          manifest: async () => manifest,
        },
      });
      const { apiKey: studioKey } = await createTelemetryApiKey(client.db, {
        ...scope,
        environmentId: environment!.id,
        pepper: "test",
        name: "Eval runner",
        mode: "test",
        scopes: ["studio:read", "eval:run"],
      });
      const launch = {
        targetId: target.id,
        selection: "all",
        judge: "app",
        suites: suites.map((suite) => ({
          suiteId: suite.id,
          suiteRevision: getEvalSuiteRevision(suite as EvalSuite),
        })),
        promptSelection: { type: "group", groupId: group.id },
        idempotencyKey: randomUUID(),
      };
      const send = (body: unknown, key = studioKey) =>
        evalApp.request("/v1/studio/evals/evaluations", {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
      expect((await send(launch, apiKey)).status).toBe(403);
      const queued = await send(launch);
      expect(queued.status).toBe(202);
      const { id: evaluationId } = (await queued.json()) as { id: string };
      const evaluation = await getEvaluation(
        client.db,
        scope,
        evaluationId,
        true,
      );
      expect(evaluation.suites).toHaveLength(2);
      const snapshots = evaluation.suites.map(
        (suite) =>
          (
            suite as {
              request: { promptSnapshot: unknown; promptGroupName: string };
            }
          ).request,
      );
      expect(snapshots[0]?.promptSnapshot).toMatchObject({
        source: "eval",
        versions: { classify: { version: 1 } },
      });
      expect(snapshots[1]?.promptSnapshot).toEqual(
        snapshots[0]?.promptSnapshot,
      );
      expect(
        snapshots.every((item) => item.promptGroupName === "Shared baseline"),
      ).toBe(true);
      await mutatePrompt(client.db, scope, "author", {
        action: "group-update",
        id: group.id as string,
        expectedRevision: 1,
        members: [],
      });
      const retry = await send(launch);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ id: evaluationId });
      const unchanged = await getEvaluation(
        client.db,
        scope,
        evaluationId,
        true,
      );
      expect(unchanged.suites).toEqual(evaluation.suites);
      const tableRequest = (version: string, key = studioKey) =>
        evalApp.request(
          `/v1/studio/prompts/assets/${created.id}/tables?version=${version}`,
          {
            headers: { authorization: `Bearer ${key}` },
          },
        );
      const attached = await tableRequest("1");
      expect(attached.status).toBe(200);
      const tableRows = (await attached.json()) as {
        runs: unknown[];
        evaluations: { id: string; suiteCount: number }[];
      };
      expect(tableRows.runs).toEqual([]);
      expect(tableRows.evaluations).toHaveLength(1);
      expect(tableRows.evaluations[0]).toMatchObject({
        id: evaluationId,
        suiteCount: 2,
      });
      expect((await tableRequest("2")).status).toBe(404);
      expect((await tableRequest("0")).status).toBe(400);
      expect((await tableRequest("1", apiKey)).status).toBe(403);
      manifest.promptContracts = [];
      const unsupported = await send({
        ...launch,
        idempotencyKey: randomUUID(),
      });
      expect(unsupported.status).toBe(409);
      expect(await unsupported.json()).toMatchObject({
        error: "PROMPT_EVAL_UNSUPPORTED",
      });
    } finally {
      await client.sql`delete from organizations where id = ${org.id}::uuid`;
      await client.close();
    }
  }, 30_000);
});
