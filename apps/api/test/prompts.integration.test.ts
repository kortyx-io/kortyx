import { randomUUID } from "node:crypto";
import {
  createTelemetryApiKey,
  createTelemetryDbClient,
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
    } finally {
      await client.sql`delete from organizations where id = ${org.id}::uuid`;
      await client.close();
    }
  }, 30_000);
});
