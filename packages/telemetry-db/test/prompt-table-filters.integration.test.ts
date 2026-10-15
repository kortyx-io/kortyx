import { randomUUID } from "node:crypto";
import type { PromptContent } from "@kortyx/prompts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTelemetryDbClient } from "../src/client";
import { listPromptFilterValues } from "../src/repositories/prompt-table-filters";
import { listPrompts, mutatePrompt } from "../src/repositories/prompts";
import { organizations, projects } from "../src/schema";

const content: PromptContent = {
  format: "system-user",
  messages: [
    { role: "system", content: "Test" },
    { role: "user", content: "Test" },
  ],
  variablesSchema: { type: "object" },
  configSchema: { type: "object" },
  config: {},
  dependencies: [],
};
describe.skipIf(!process.env.DATABASE_URL)("prompt table filtering", () => {
  it("counts before pagination and scopes category suggestions to the authorized project", async () => {
    const client = createTelemetryDbClient(process.env.DATABASE_URL!);
    const [org] = await client.db
      .insert(organizations)
      .values({ name: `table-filters-${randomUUID()}` })
      .returning();
    if (!org) throw new Error("Missing fixture organization");
    try {
      const [project, other] = await client.db
        .insert(projects)
        .values([
          { organizationId: org.id, name: "A" },
          { organizationId: org.id, name: "B" },
        ])
        .returning();
      if (!project || !other) throw new Error("Missing fixture projects");
      const scope = { organizationId: org.id, projectId: project.id };
      for (const [key, name] of [
        ["alpha", "Alpha"],
        ["beta", "Beta"],
        ["percent", "Literal %_ prompt"],
      ])
        await mutatePrompt(client.db, scope, "test", {
          action: "create",
          key: key!,
          name: name!,
          content,
        });
      await mutatePrompt(client.db, { ...scope, projectId: other.id }, "test", {
        action: "create",
        key: "foreign",
        name: "Foreign secret",
        content,
      });
      const tableFilters = JSON.stringify({
        match: "any",
        rules: [
          { field: "name", operator: "is", values: ["Alpha"] },
          { field: "key", operator: "contains", values: ["beta"] },
        ],
      });
      const page = await listPrompts(client.db, scope, {
        tableFilters,
        offset: 1,
        limit: 1,
      });
      expect(page.totalCount).toBe(2);
      expect(page.assets.map((row) => row.name)).toEqual(["Beta"]);
      const literal = await listPrompts(client.db, scope, {
        tableFilters: JSON.stringify({
          match: "all",
          rules: [{ field: "name", operator: "contains", values: ["%_"] }],
        }),
      });
      expect(literal.assets.map((row) => row.key)).toEqual(["percent"]);
      expect(
        await listPromptFilterValues(client.db, {
          ...scope,
          field: "name",
          search: "",
          categoryId: null,
        }),
      ).toEqual(["Alpha", "Beta", "Literal %_ prompt"]);
      const alpha = (await listPrompts(client.db, scope)).assets.find(
        (row) => row.key === "alpha",
      );
      if (!alpha) throw new Error("Missing prompt");
      await mutatePrompt(client.db, scope, "test", {
        action: "tag-set",
        id: alpha.id,
        tag: "candidate",
        version: 1,
        expectedRevision: 0,
      });
      expect(
        (
          await listPrompts(client.db, scope, {
            tableFilters: JSON.stringify({
              match: "all",
              rules: [
                {
                  field: "assignedTags",
                  operator: "is",
                  values: ["candidate"],
                },
              ],
            }),
          })
        ).assets.map((row) => row.key),
      ).toEqual(["alpha"]);
      expect(
        await listPromptFilterValues(client.db, {
          ...scope,
          field: "assignedVersions",
          search: "candidate",
        }),
      ).toEqual(["candidate@v1"]);
      expect(
        (
          await listPrompts(client.db, scope, {
            tableFilters: JSON.stringify({
              match: "all",
              rules: [
                {
                  field: "versionsBehindLive",
                  operator: "missing",
                  values: [],
                },
              ],
            }),
          })
        ).totalCount,
      ).toBe(3);
      await expect(
        listPromptFilterValues(client.db, {
          ...scope,
          field: "config",
          search: "",
        }),
      ).rejects.toThrow("Unknown prompt filter field");
    } finally {
      await client.db.delete(organizations).where(eq(organizations.id, org.id));
      await client.close();
    }
  });
});
