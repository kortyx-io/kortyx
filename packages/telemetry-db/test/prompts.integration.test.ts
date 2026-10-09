import { randomUUID } from "node:crypto";
import { type PromptContent, promptHash } from "@kortyx/prompts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTelemetryDbClient } from "../src/client";
import {
  getPrompt,
  listPrompts,
  mutatePrompt,
  resolvePrompts,
} from "../src/repositories/prompts";
import {
  evalRuns,
  organizations,
  projectEnvironments,
  projects,
} from "../src/schema";

const url = process.env.DATABASE_URL;
const content: PromptContent = {
  format: "system-user",
  messages: [
    { role: "system", content: "Classify" },
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
describe.skipIf(!url)("project prompt management", () => {
  it("preserves immutable versions, CAS drafts, category moves, groups and serving isolation", async () => {
    const client = createTelemetryDbClient(url!);
    const [org] = await client.db
      .insert(organizations)
      .values({ name: `prompts-${randomUUID()}` })
      .returning();
    if (!org) throw new Error("Missing organization");
    try {
      const [project, other] = await client.db
        .insert(projects)
        .values([
          { organizationId: org.id, name: "source" },
          { organizationId: org.id, name: "other" },
        ])
        .returning();
      if (!project || !other) throw new Error("Missing project");
      const scope = { organizationId: org.id, projectId: project.id };
      await client.db
        .insert(projectEnvironments)
        .values({ ...scope, name: "production" });
      const mutate = (input: Parameters<typeof mutatePrompt>[3]) =>
        mutatePrompt(client.db, scope, "studio-key:test", input);
      await mutate({ action: "category-create", path: "Canvas/Testing" });
      const library = await listPrompts(client.db, scope);
      const parent = library.categories.find((item) => item.name === "Canvas")!,
        child = library.categories.find((item) => item.name === "Testing")!;
      expect(child.parentId).toBe(parent.id);
      const created = await mutate({
        action: "create",
        key: "classify",
        name: "Classify",
        categoryId: child.id,
        content,
        note: "Initial",
      });
      const id = created.id as string;
      await expect(
        getPrompt(client.db, { ...scope, projectId: other.id }, id),
      ).rejects.toMatchObject({ status: 404 });
      await mutate({
        action: "draft",
        id,
        content,
        baseVersion: 1,
        expectedRevision: 0,
      });
      await expect(
        mutate({
          action: "draft",
          id,
          content,
          baseVersion: 1,
          expectedRevision: 0,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        mutate({ action: "discard-draft", id, expectedRevision: 0 }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await getPrompt(client.db, scope, id)).draft).toEqual(content);
      await expect(
        mutatePrompt(
          client.db,
          { ...scope, projectId: other.id },
          "studio-key:test",
          {
            action: "discard-draft",
            id,
            expectedRevision: 1,
          },
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        await mutate({ action: "discard-draft", id, expectedRevision: 1 }),
      ).toEqual({ id, draftRevision: 2 });
      const discarded = await getPrompt(client.db, scope, id);
      expect(discarded.draft).toBeNull();
      expect(discarded.draftBase).toBeNull();
      expect(discarded.versions).toHaveLength(1);
      expect(discarded.versions[0]?.content).toEqual(content);
      expect(discarded.asset.assignments).toEqual([]);
      await expect(
        mutate({
          action: "draft",
          id,
          content,
          baseVersion: 1,
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ status: 409 });
      // Repeated clean cancellation does not advance the draft revision.
      expect(
        await mutate({ action: "discard-draft", id, expectedRevision: 2 }),
      ).toEqual({ id, draftRevision: 2 });
      const candidate = { ...content, config: { modelName: "accurate" } },
        hash = await promptHash(candidate),
        idempotencyKey = randomUUID();
      await expect(
        mutate({
          action: "save",
          id,
          content: candidate,
          baseVersion: 1,
          expectedHash: "a".repeat(64),
          note: "Reviewed",
          idempotencyKey,
        }),
      ).rejects.toMatchObject({ code: "PROMPT_REVIEW_CHANGED" });
      const saved = await mutate({
        action: "save",
        id,
        content: candidate,
        baseVersion: 1,
        expectedHash: hash,
        note: "Try accurate model",
        idempotencyKey,
      });
      const retry = await mutate({
        action: "save",
        id,
        content: candidate,
        baseVersion: 1,
        expectedHash: hash,
        note: "Try accurate model",
        idempotencyKey,
      });
      expect(retry).toEqual(saved);
      expect((await getPrompt(client.db, scope, id)).versions).toHaveLength(2);
      const group = await mutate({
        action: "group-create",
        name: "Candidate A",
      });
      await mutate({
        action: "group-update",
        id: group.id as string,
        expectedRevision: 1,
        members: [{ promptId: id, version: 2 }],
      });
      const evaluated = await resolvePrompts(client.db, scope, {
        ids: ["classify"],
        environment: "production",
        selection: { type: "group", groupId: group.id as string },
      });
      expect(evaluated.source).toBe("eval");
      expect(evaluated.versions.classify?.version).toBe(2);
      await expect(
        mutate({
          action: "promote",
          id,
          version: 2,
          expectedRevision: 0,
          rollback: false,
        }),
      ).rejects.toMatchObject({ code: "PROMPT_PROMOTION_BLOCKED" });
      const suite = {
        id: "intent",
        cases: [
          {
            id: "support",
            steps: [{ message: "Help", expect: { type: "answer" as const } }],
          },
        ],
      };
      const runId = randomUUID();
      await client.db.insert(evalRuns).values({
        ...scope,
        id: runId,
        environment: "production",
        targetId: "application",
        targetName: "Application",
        suiteId: suite.id,
        suiteRevision: "old-suite-revision",
        suite,
        request: {
          suiteId: suite.id,
          suiteRevision: "old-suite-revision",
          repetitions: 1,
          concurrency: 1,
          promptSnapshot: evaluated,
        },
        status: "passed",
        requestedBy: "studio-key:test",
        result: {
          id: runId,
          suiteId: suite.id,
          suiteRevision: "old-suite-revision",
          suite,
          startedAt: new Date().toISOString(),
          durationMs: 1,
          status: "passed",
          counts: { passed: 1, failed: 0, error: 0, cancelled: 0 },
          cases: [
            {
              caseId: "support",
              repetition: 1,
              sessionId: randomUUID(),
              status: "passed",
              durationMs: 1,
              errors: [],
              steps: [
                {
                  index: 0,
                  input: { message: "Help" },
                  expectation: { type: "answer" },
                  status: "passed",
                  criteria: [],
                  observation: {
                    type: "answer",
                    text: "support",
                    structured: [],
                    promptUsage: [
                      {
                        id: "classify",
                        version: 2,
                        hash,
                        environment: "production",
                        snapshotRevision: evaluated.revision,
                      },
                    ],
                  },
                },
              ],
            },
          ],
          errors: [],
        },
      });
      // An old passing run cannot approve a prompt after the app changes its suite.
      await expect(
        mutatePrompt(
          client.db,
          scope,
          "studio-key:test",
          {
            action: "promote",
            id,
            version: 2,
            expectedRevision: 0,
            rollback: false,
          },
          {
            suiteRevisions: {
              [JSON.stringify(["application", "intent"])]: "new-suite-revision",
            },
          },
        ),
      ).rejects.toMatchObject({ code: "PROMPT_PROMOTION_BLOCKED" });
      await client.db.delete(evalRuns).where(eq(evalRuns.id, runId));
      await mutate({
        action: "promote",
        id,
        version: 1,
        expectedRevision: 0,
        rollback: false,
        exceptionReason: "Bootstrap initial assignment",
      });
      expect(
        (
          await resolvePrompts(client.db, scope, {
            ids: ["classify"],
            environment: "production",
          })
        ).versions.classify?.version,
      ).toBe(1);
      await expect(
        mutate({
          action: "promote",
          id,
          version: 2,
          expectedRevision: 0,
          rollback: false,
          exceptionReason: "Stale assignment override",
        }),
      ).rejects.toMatchObject({ status: 409 });
      // Saving v2 did not publish it. Tags are independent of live promotion,
      // can be served under any authorized execution environment, and use CAS.
      await mutate({
        action: "tag-set",
        id,
        tag: "staging",
        version: 2,
        expectedRevision: 0,
      });
      const resolveTag = (tag?: string) =>
        resolvePrompts(client.db, scope, {
          ids: ["classify"],
          environment: "production",
          ...(tag ? { tag } : {}),
        });
      expect((await resolveTag()).versions.classify?.version).toBe(1);
      expect((await resolveTag("staging")).versions.classify?.version).toBe(2);
      await expect(
        mutate({
          action: "tag-set",
          id,
          tag: "live",
          version: 2,
          expectedRevision: 1,
        }),
      ).rejects.toThrow();
      await expect(
        mutate({ action: "tag-remove", id, tag: "live", expectedRevision: 1 }),
      ).rejects.toThrow();
      await expect(
        mutate({
          action: "tag-set",
          id,
          tag: "staging",
          version: 1,
          expectedRevision: 0,
        }),
      ).rejects.toMatchObject({ code: "PROMPT_REVISION_CONFLICT" });
      await mutate({
        action: "promote",
        id,
        version: 2,
        expectedRevision: 1,
        rollback: false,
        exceptionReason: "Explicit test promotion exception",
      });
      await mutate({
        action: "promote",
        id,
        version: 1,
        expectedRevision: 2,
        rollback: true,
        exceptionReason: "Explicit test rollback exception",
      });
      expect((await resolveTag()).versions.classify?.version).toBe(1);
      expect((await getPrompt(client.db, scope, id)).asset.latestVersion).toBe(
        2,
      );
      expect((await resolveTag("staging")).versions.classify?.version).toBe(2);
      await mutate({
        action: "tag-remove",
        id,
        tag: "staging",
        expectedRevision: 1,
      });
      await expect(resolveTag("staging")).rejects.toMatchObject({
        code: "PROMPT_NOT_ASSIGNED",
      });
      expect((await resolveTag()).versions.classify?.version).toBe(1);
      await expect(
        mutate({
          action: "category-update",
          id: parent.id,
          expectedRevision: 1,
          parentId: child.id,
        }),
      ).rejects.toMatchObject({ code: "PROMPT_CATEGORY_CYCLE" });
      await mutate({
        action: "category-delete",
        id: parent.id,
        expectedRevision: 1,
        destinationId: null,
      });
      expect(
        (await getPrompt(client.db, scope, id)).asset.categoryId,
      ).toBeNull();
      const beforeBulk = await getPrompt(client.db, scope, id);
      const second = await mutate({
        action: "create",
        key: "second",
        name: "Second",
        categoryId: null,
        content,
        note: "Initial",
      });
      await expect(
        mutate({
          action: "bulk-update",
          assets: [
            { id: second.id as string, expectedRevision: 1 },
            { id, expectedRevision: 99 },
          ],
          categoryId: null,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await getPrompt(client.db, scope, id)).asset.revision).toBe(
        beforeBulk.asset.revision,
      );
      expect(
        (await getPrompt(client.db, scope, second.id as string)).asset.archived,
      ).toBe(false);
      expect(
        (await getPrompt(client.db, scope, second.id as string)).asset.revision,
      ).toBe(1);
      await mutate({
        action: "group-create",
        name: "Atomic selection",
        members: [{ promptId: second.id as string, version: 1 }],
      });
      expect(
        (await listPrompts(client.db, scope)).groups.find(
          (group) => group.name === "Atomic selection",
        )?.members,
      ).toMatchObject([{ promptId: second.id, version: 1, key: "second" }]);
      await mutate({
        action: "group-delete",
        id: group.id as string,
        expectedRevision: 2,
      });
      expect((await getPrompt(client.db, scope, id)).versions).toHaveLength(2);
    } finally {
      await client.db.delete(organizations).where(eq(organizations.id, org.id));
      await client.close();
    }
  }, 30_000);
});
