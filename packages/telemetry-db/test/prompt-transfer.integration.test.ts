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
  applyPromptTransfer,
  exportPrompts,
  planPromptTransfer,
} from "../src/repositories/prompt-transfer";
import {
  getPrompt,
  listPrompts,
  mutatePrompt,
} from "../src/repositories/prompts";
import { organizations, projects } from "../src/schema";

const sourceUrl = process.env.DATABASE_URL;
const destinationUrl = process.env.PROMPT_DESTINATION_DATABASE_URL;
describe.skipIf(!sourceUrl || !destinationUrl)(
  "independent deployment prompt transfer",
  () => {
    it("remaps exact dependencies, verifies hashes, resumes apply and rejects stale destination heads", async () => {
      const source = createTelemetryDbClient(sourceUrl!),
        destination = createTelemetryDbClient(destinationUrl!);
      const scopes = [];
      for (const client of [source, destination]) {
        const [org] = await client.db
          .insert(organizations)
          .values({ name: `transfer-${randomUUID()}` })
          .returning();
        const [project] = await client.db
          .insert(projects)
          .values({ organizationId: org!.id, name: "transfer" })
          .returning();
        scopes.push({ organizationId: org!.id, projectId: project!.id });
      }
      const [src, dst] = scopes;
      if (!src || !dst) throw new Error("Missing scopes");
      const body: PromptContent = {
        format: "system-user",
        messages: [
          { role: "system", content: "Answer" },
          { role: "user", content: "{{message}}" },
        ],
        variablesSchema: {
          type: "object",
          properties: { message: { type: "string" } },
          required: ["message"],
        },
        configSchema: { type: "object" },
        config: {},
        dependencies: [],
      };
      try {
        await mutatePrompt(source.db, src, "author", {
          action: "create",
          key: "fragment",
          name: "Fragment",
          categoryId: null,
          content: body,
          note: "Initial",
        });
        await mutatePrompt(source.db, src, "author", {
          action: "create",
          key: "main",
          name: "Main",
          categoryId: null,
          content: {
            ...body,
            messages: [
              { role: "system", content: "Before [[prompt:fragment]] After" },
              body.messages[1]!,
            ],
            dependencies: [
              { id: "fragment", version: 1, hash: await promptHash(body) },
            ],
          },
          note: "Initial",
        });
        const bundle = await exportPrompts(source.db, src, {
          keys: ["main"],
          apiUrl: "http://127.0.0.1:6441",
        });
        expect(bundle.prompts.map((item) => item.key).sort()).toEqual([
          "fragment",
          "main",
        ]);
        expect(
          bundle.prompts.find((item) => item.key === "main")?.versions[0]
            ?.content.messages[0]?.content,
        ).toContain("[[prompt:fragment]]");
        const plan = await planPromptTransfer(destination.db, dst, "importer", {
          bundle,
          conflicts: "error",
          rename: { fragment: "shared/fragment" },
          categories: true,
          groups: false,
        });
        const applied = await applyPromptTransfer(
          destination.db,
          dst,
          "importer",
          plan.id,
          plan.bundleHash,
        );
        expect(
          await applyPromptTransfer(
            destination.db,
            dst,
            "importer",
            plan.id,
            plan.bundleHash,
          ),
        ).toEqual(applied);
        const main = await getPrompt(destination.db, dst, "main");
        expect(main.asset.assignments).toEqual([]);
        expect(main.versions[0]?.content.messages[0]?.content).toBe(
          "Before [[prompt:shared/fragment]] After",
        );
        const fragment = await getPrompt(
          destination.db,
          dst,
          "shared/fragment",
        );
        expect(
          expandPromptMessages(main.versions[0]!, {
            "shared/fragment": fragment.versions[0]!,
          }).messages[0]?.content,
        ).toBe("Before Answer After");
        expect(main.versions[0]?.origin?.hash).toBe(
          bundle.prompts.find((item) => item.key === "main")?.versions[0]?.hash,
        );
        expect(main.versions[0]?.content.dependencies[0]?.id).toBe(
          "shared/fragment",
        );
        expect(main.versions[0]?.hash).toBe(
          await promptHash(main.versions[0]!.content),
        );
        const changed = { ...body, config: { temperature: 0.5 } };
        const oldPlan = await planPromptTransfer(
          destination.db,
          dst,
          "importer",
          {
            bundle,
            conflicts: "append",
            rename: { fragment: "shared/fragment" },
            categories: false,
            groups: false,
          },
        );
        await mutatePrompt(destination.db, dst, "author", {
          action: "save",
          id: main.asset.id,
          content: changed,
          baseVersion: 1,
          expectedHash: await promptHash(changed),
          note: "Local change",
          idempotencyKey: randomUUID(),
        });
        await expect(
          applyPromptTransfer(
            destination.db,
            dst,
            "importer",
            oldPlan.id,
            oldPlan.bundleHash,
          ),
        ).rejects.toMatchObject({ status: 409 });
        await expect(
          applyPromptTransfer(
            destination.db,
            dst,
            "other-actor",
            plan.id,
            plan.bundleHash,
          ),
        ).rejects.toMatchObject({ status: 404 });
        expect((await listPrompts(destination.db, dst)).totalCount).toBe(2);
      } finally {
        await source.db
          .delete(organizations)
          .where(eq(organizations.id, src.organizationId));
        await destination.db
          .delete(organizations)
          .where(eq(organizations.id, dst.organizationId));
        await source.close();
        await destination.close();
      }
    }, 30_000);
  },
);
