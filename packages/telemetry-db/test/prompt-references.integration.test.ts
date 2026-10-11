import { randomUUID } from "node:crypto";
import {
  expandPromptMessages,
  type PromptContent,
  promptHash,
} from "@kortyx/prompts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTelemetryDbClient } from "../src/client";
import {
  getPrompt,
  mutatePrompt,
  resolvePrompts,
} from "../src/repositories/prompts";
import {
  organizations,
  projectEnvironments,
  projects,
  telemetryEvents,
} from "../src/schema";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("stored prompt references", () => {
  it("validates inclusion roles and inherited inputs and freezes dependencies across child changes", async () => {
    const client = createTelemetryDbClient(url!);
    const [org] = await client.db
      .insert(organizations)
      .values({ name: `reference-${randomUUID()}` })
      .returning();
    try {
      const [project] = await client.db
        .insert(projects)
        .values({ organizationId: org!.id, name: "References" })
        .returning();
      const scope = { organizationId: org!.id, projectId: project!.id };
      await client.db
        .insert(projectEnvironments)
        .values({ ...scope, name: "production" });
      const mutate = (input: Parameters<typeof mutatePrompt>[3]) =>
        mutatePrompt(client.db, scope, "author", input);
      const body: PromptContent = {
        format: "system-user",
        messages: [
          { role: "system", content: "Follow {{policy}}" },
          { role: "user", content: "{{message}}" },
        ],
        variablesSchema: {
          type: "object",
          properties: {
            policy: { type: "string" },
            message: { type: "string" },
          },
          required: ["policy", "message"],
        },
        configSchema: {},
        config: {},
        dependencies: [],
      };
      const child = await mutate({
        action: "create",
        key: "rules",
        name: "Rules",
        categoryId: null,
        content: body,
        note: "First",
      });
      const parent = {
        ...body,
        messages: [
          { role: "system" as const, content: "Before [[prompt:rules]] After" },
          body.messages[1]!,
        ],
        dependencies: [
          { id: "rules", version: 1, hash: await promptHash(body) },
        ],
      };
      await expect(
        mutate({
          action: "create",
          key: "bad-input",
          name: "Bad",
          categoryId: null,
          content: {
            ...parent,
            variablesSchema: { properties: { message: { type: "string" } } },
          },
          note: "Bad",
        }),
      ).rejects.toThrow("Declare template input policy");
      await expect(
        mutate({
          action: "create",
          key: "bad-role",
          name: "Bad",
          categoryId: null,
          content: {
            ...parent,
            format: "chat",
            messages: [{ role: "assistant", content: "[[prompt:rules]]" }],
          },
          note: "Bad",
        }),
      ).rejects.toThrow("no assistant message");
      const root = await mutate({
        action: "create",
        key: "main",
        name: "Main",
        categoryId: null,
        content: parent,
        note: "Includes rules v1",
      });
      await mutate({
        action: "save",
        id: String(child.id),
        content: {
          ...body,
          messages: [
            { role: "system", content: "Changed rules" },
            body.messages[1]!,
          ],
        },
        baseVersion: 1,
        expectedHash: await promptHash({
          ...body,
          messages: [
            { role: "system", content: "Changed rules" },
            body.messages[1]!,
          ],
        }),
        note: "Changed",
        idempotencyKey: randomUUID(),
      });
      const snapshot = await resolvePrompts(client.db, scope, {
        ids: ["main"],
        environment: "production",
        versions: { main: 1 },
      });
      expect(snapshot.versions.rules?.version).toBe(1);
      const expanded = expandPromptMessages(
        snapshot.versions.main!,
        snapshot.versions,
      );
      expect(expanded.messages[0]?.content).toBe(
        "Before Follow {{policy}} After",
      );
      expect(expanded.messages[1]?.content).toBe("{{message}}");
      await client.db.insert(telemetryEvents).values({
        ...scope,
        eventId: randomUUID(),
        schemaVersion: 1,
        type: "generation.completed",
        occurredAt: new Date(),
        environment: "production",
        serviceName: "reference-test",
        runId: randomUUID(),
        workflowId: "test",
        payload: {
          prompt: {
            name: "main",
            version: 1,
            source: "studio",
            metadata: {
              hash: await promptHash(parent),
              dependencies: parent.dependencies,
            },
          },
        },
      });
      const childDetail = await getPrompt(client.db, scope, "rules");
      expect(childDetail.usage[0]).toMatchObject({
        version: 1,
        hash: await promptHash(body),
        source: "studio",
      });
      expect(
        (await getPrompt(client.db, scope, String(root.id))).versions[0]?.hash,
      ).toBe(await promptHash(parent));
    } finally {
      await client.db
        .delete(organizations)
        .where(eq(organizations.id, org!.id));
      await client.close();
    }
  }, 30_000);
});
