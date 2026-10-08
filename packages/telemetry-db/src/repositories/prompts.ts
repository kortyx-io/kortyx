import {
  type PromptContent,
  PromptError,
  type PromptSnapshot,
  promptHash,
  validatePromptContent,
  verifyPromptSnapshot,
} from "@kortyx/prompts";
import {
  type PromptMutation,
  PromptMutationSchema,
  type PromptSelection,
} from "@kortyx/telemetry-contracts";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { TelemetryDb } from "../client";
import {
  evalRuns,
  projectEnvironments,
  projects,
  promptActivity,
  promptAssets,
  promptAssignments,
  promptCategories,
  promptGroups,
  promptPolicies,
  promptReviews,
  promptVersions,
  telemetryEvents,
} from "../schema";
import { ensureProjectEnvironmentAllowed } from "./projects";

export type PromptScope = { organizationId: string; projectId: string };
const where = (
  table: { organizationId: AnyPgColumn; projectId: AnyPgColumn },
  scope: PromptScope,
) =>
  and(
    eq(table.organizationId, scope.organizationId),
    eq(table.projectId, scope.projectId),
  );
const missing = (): never => {
  throw new PromptError(
    "PROMPT_NOT_FOUND",
    "Prompt resource not found in this project.",
    404,
  );
};
const conflict = (): never => {
  throw new PromptError(
    "PROMPT_REVISION_CONFLICT",
    "This resource changed. Reload and review the latest changes.",
    409,
  );
};
const checkRevision = (actual: number, expected: number) => {
  if (actual !== expected) conflict();
};
const assetView = (
  asset: typeof promptAssets.$inferSelect,
  assignments: (typeof promptAssignments.$inferSelect)[],
) => ({
  id: asset.id,
  key: asset.key,
  name: asset.name,
  categoryId: asset.categoryId,
  latestVersion: asset.latestVersion,
  revision: asset.revision,
  archived: asset.archived,
  updatedAt: asset.updatedAt.toISOString(),
  assignments: assignments
    .filter((item) => item.promptId === asset.id)
    .map((item) => ({
      environment: item.environment,
      version: item.version,
      revision: item.revision,
      updatedAt: item.updatedAt.toISOString(),
    })),
});

export async function listPrompts(
  db: TelemetryDb,
  scope: PromptScope,
  options: {
    search?: string;
    categoryId?: string | null;
    offset?: number;
    limit?: number;
    archived?: boolean;
  } = {},
) {
  const offset = Math.max(0, options.offset ?? 0),
    limit = Math.min(200, Math.max(1, options.limit ?? 100));
  const criteria = and(
    where(promptAssets, scope),
    eq(promptAssets.archived, options.archived ?? false),
    options.categoryId === null
      ? sql`${promptAssets.categoryId} IS NULL`
      : options.categoryId
        ? eq(promptAssets.categoryId, options.categoryId)
        : undefined,
    options.search
      ? sql`(${promptAssets.name} ILIKE ${`%${options.search.replace(/[\\%_]/g, "\\$&")}%`} OR ${promptAssets.key} ILIKE ${`%${options.search.replace(/[\\%_]/g, "\\$&")}%`})`
      : undefined,
  );
  const [assets, categories, groups, assignments, count] = await Promise.all([
    db
      .select()
      .from(promptAssets)
      .where(criteria)
      .orderBy(asc(promptAssets.name), asc(promptAssets.id))
      .offset(offset)
      .limit(limit),
    db
      .select()
      .from(promptCategories)
      .where(where(promptCategories, scope))
      .orderBy(asc(promptCategories.name)),
    db
      .select()
      .from(promptGroups)
      .where(where(promptGroups, scope))
      .orderBy(asc(promptGroups.name)),
    db.select().from(promptAssignments).where(where(promptAssignments, scope)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(promptAssets)
      .where(criteria),
  ]);
  const totalCount = count[0]?.total ?? 0;
  const memberIds = [
    ...new Set(
      groups.flatMap((group) => group.members.map((member) => member.promptId)),
    ),
  ];
  const groupAssets = memberIds.length
    ? await db
        .select({
          id: promptAssets.id,
          key: promptAssets.key,
          name: promptAssets.name,
          archived: promptAssets.archived,
        })
        .from(promptAssets)
        .where(
          and(where(promptAssets, scope), inArray(promptAssets.id, memberIds)),
        )
    : [];
  return {
    schemaVersion: 1 as const,
    environments: (
      await db
        .select({ name: projectEnvironments.name })
        .from(projectEnvironments)
        .where(where(projectEnvironments, scope))
        .orderBy(asc(projectEnvironments.name))
    ).map((item) => item.name),
    assets: assets.map((asset) => assetView(asset, assignments)),
    categories: categories.map(({ id, name, parentId, revision }) => ({
      id,
      name,
      parentId,
      revision,
    })),
    groups: groups.map(({ id, name, revision, members, updatedAt }) => ({
      id,
      name,
      revision,
      members: members.map((member) => {
        const asset = groupAssets.find((asset) => asset.id === member.promptId);
        return {
          ...member,
          ...(asset
            ? { key: asset.key, name: asset.name, archived: asset.archived }
            : {}),
        };
      }),
      updatedAt: updatedAt.toISOString(),
    })),
    totalCount,
    nextCursor:
      offset + assets.length < totalCount
        ? String(offset + assets.length)
        : null,
  };
}

async function findAsset(
  db: TelemetryDb,
  scope: PromptScope,
  id: string,
  byKey = false,
) {
  const [asset] = await db
    .select()
    .from(promptAssets)
    .where(
      and(
        where(promptAssets, scope),
        !byKey && /^[a-f0-9-]{36}$/i.test(id)
          ? eq(promptAssets.id, id)
          : eq(promptAssets.key, id),
      ),
    )
    .limit(1);
  return asset ?? missing();
}
async function findVersion(
  db: TelemetryDb,
  scope: PromptScope,
  promptId: string,
  version: number,
) {
  const [found] = await db
    .select()
    .from(promptVersions)
    .where(
      and(
        where(promptVersions, scope),
        eq(promptVersions.promptId, promptId),
        eq(promptVersions.version, version),
      ),
    )
    .limit(1);
  return found ?? missing();
}

/** Every edit takes the project lock; a resolve takes a shared lock for one complete assignment snapshot. */
async function lockProject(
  db: TelemetryDb,
  scope: PromptScope,
  mode: "update" | "share",
) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, scope.organizationId),
        eq(projects.id, scope.projectId),
      ),
    )
    .for(mode)
    .limit(1);
  if (!project) missing();
}
export async function resolvePrompts(
  db: TelemetryDb,
  scope: PromptScope,
  options: {
    ids: string[];
    environment: string;
    versions?: Record<string, number>;
    selection?: PromptSelection;
    onGroupName?: (name: string) => void;
  },
) {
  await ensureProjectEnvironmentAllowed(db, {
    ...scope,
    environment: options.environment,
  });
  return db.transaction(async (tx) => {
    await lockProject(tx, scope, "share");
    const overrides = { ...options.versions };
    if (options.selection?.type === "single") {
      const asset = await findAsset(tx, scope, options.selection.id);
      if (!options.ids.includes(asset.key))
        throw new PromptError(
          "PROMPT_NOT_REGISTERED",
          "The application does not register this prompt.",
        );
      overrides[asset.key] = options.selection.version;
    } else if (options.selection?.type === "group") {
      const [group] = await tx
        .select()
        .from(promptGroups)
        .where(
          and(
            where(promptGroups, scope),
            eq(promptGroups.id, options.selection.groupId),
          ),
        )
        .limit(1);
      if (!group) return missing();
      options.onGroupName?.(group.name);
      if (!group.members.length)
        throw new PromptError(
          "PROMPT_GROUP_EMPTY",
          "Add at least one version to this test group.",
        );
      for (const member of group.members) {
        const asset = await findAsset(tx, scope, member.promptId);
        if (!options.ids.includes(asset.key))
          throw new PromptError(
            "PROMPT_NOT_REGISTERED",
            `The application does not register ${asset.key}.`,
          );
        overrides[asset.key] = member.version;
      }
    }
    const versions: PromptSnapshot["versions"] = {};
    const load = async (key: string, pin?: number, hash?: string) => {
      const previous = versions[key];
      if (previous) {
        if (
          (pin && previous.version !== pin) ||
          (hash && previous.hash !== hash)
        )
          throw new PromptError(
            "PROMPT_DEPENDENCY_CONFLICT",
            `Conflicting exact dependencies for ${key}.`,
          );
        return;
      }
      if (Object.keys(versions).length >= 200)
        throw new PromptError(
          "PROMPT_SNAPSHOT_LIMIT",
          "A prompt snapshot supports at most 200 versions.",
        );
      const asset = await findAsset(tx, scope, key, true);
      if (asset.archived)
        throw new PromptError(
          "PROMPT_ARCHIVED",
          `Prompt ${key} is archived.`,
          409,
        );
      let selected = pin;
      if (!selected) {
        const [assignment] = await tx
          .select()
          .from(promptAssignments)
          .where(
            and(
              where(promptAssignments, scope),
              eq(promptAssignments.promptId, asset.id),
              eq(promptAssignments.environment, options.environment),
            ),
          )
          .limit(1);
        selected = assignment?.version;
      }
      if (!selected)
        throw new PromptError(
          "PROMPT_NOT_ASSIGNED",
          `No ${options.environment} assignment for ${key}.`,
          404,
        );
      const version = await findVersion(tx, scope, asset.id, selected);
      if (hash && hash !== version.hash)
        throw new PromptError(
          "PROMPT_DEPENDENCY_MISMATCH",
          `Dependency ${key} has a different hash.`,
        );
      versions[key] = {
        id: key,
        version: selected,
        hash: version.hash,
        content: version.content,
      };
      for (const dep of version.content.dependencies)
        await load(dep.id, dep.version, dep.hash);
    };
    for (const id of options.ids) await load(id, overrides[id]);
    const resolvedAt = new Date().toISOString();
    return verifyPromptSnapshot({
      schemaVersion: 1,
      environment: options.environment,
      revision: await promptHash({
        format: "chat",
        messages: [
          {
            role: "system",
            content: JSON.stringify(
              Object.entries(versions)
                .sort()
                .map(([id, v]) => [id, v.version, v.hash]),
            ),
          },
        ],
        variablesSchema: {},
        configSchema: {},
        config: {},
        dependencies: [],
      }),
      versions,
      requestedIds: options.ids,
      source: options.selection ? "eval" : "studio",
      resolvedAt,
    });
  });
}

export async function getPrompt(
  db: TelemetryDb,
  scope: PromptScope,
  id: string,
  options: { byKey?: boolean; versionsOffset?: number; version?: number } = {},
) {
  const asset = await findAsset(db, scope, id, options.byKey);
  const [versions, assignments, policies, activity, usage, evidence, reviews] =
    await Promise.all([
      db
        .select()
        .from(promptVersions)
        .where(
          and(
            where(promptVersions, scope),
            eq(promptVersions.promptId, asset.id),
          ),
        )
        .orderBy(desc(promptVersions.version))
        .offset(options.versionsOffset ?? 0)
        .limit(100),
      db
        .select()
        .from(promptAssignments)
        .where(
          and(
            where(promptAssignments, scope),
            eq(promptAssignments.promptId, asset.id),
          ),
        ),
      db.select().from(promptPolicies).where(where(promptPolicies, scope)),
      db
        .select()
        .from(promptActivity)
        .where(
          and(
            where(promptActivity, scope),
            eq(promptActivity.promptId, asset.id),
          ),
        )
        .orderBy(desc(promptActivity.createdAt))
        .limit(100),
      db
        .select()
        .from(telemetryEvents)
        .where(
          and(
            where(telemetryEvents, scope),
            sql`${telemetryEvents.payload} -> 'prompt' ->> 'name' = ${asset.key}`,
            sql`${telemetryEvents.type} = 'generation.completed'`,
          ),
        )
        .orderBy(desc(telemetryEvents.occurredAt))
        .limit(100),
      promptEvidence(db, scope, asset.key),
      db
        .select()
        .from(promptReviews)
        .where(
          and(
            where(promptReviews, scope),
            eq(promptReviews.promptId, asset.id),
            eq(promptReviews.version, options.version ?? asset.latestVersion),
          ),
        )
        .orderBy(desc(promptReviews.createdAt))
        .limit(100),
    ]);
  if (
    options.version &&
    !versions.some((version) => version.version === options.version)
  )
    versions.push(await findVersion(db, scope, asset.id, options.version));
  return {
    asset: assetView(asset, assignments),
    reviews: reviews.map((review) => ({
      version: review.version,
      hash: review.hash,
      environment: review.environment,
      reviewer: review.reviewer,
      note: review.note,
      createdAt: review.createdAt.toISOString(),
      independent:
        review.reviewer.startsWith("studio-user:") &&
        versions.find((version) => version.version === review.version)
          ?.author !== review.reviewer,
    })),
    versionsNextCursor:
      (options.versionsOffset ?? 0) + 100 < asset.latestVersion
        ? String((options.versionsOffset ?? 0) + 100)
        : null,
    draft: asset.draft,
    draftBase: asset.draftBase,
    draftRevision: asset.draftRevision,
    versions: versions.map((version) => ({
      id: asset.key,
      promptId: asset.id,
      version: version.version,
      hash: version.hash,
      content: version.content,
      note: version.note,
      author: version.author,
      createdAt: version.createdAt.toISOString(),
      origin: version.origin,
    })),
    policies: policies.map(
      ({
        environment,
        revision,
        requireTest,
        requiredSuites,
        requiredReviews,
        allowException,
      }) => ({
        environment,
        revision,
        requireTest,
        requiredSuites,
        requiredReviews,
        allowException,
      }),
    ),
    activity: activity.map(({ id, action, actor, details, createdAt }) => ({
      id,
      action,
      actor,
      details,
      createdAt: createdAt.toISOString(),
    })),
    evidence,
    usage: usage.map((event) => {
      const payload = event.payload as Record<string, unknown>;
      const prompt = payload.prompt as
        | { version?: number; source?: string; metadata?: { hash?: string } }
        | undefined;
      return {
        eventId: event.eventId,
        runId: event.runId,
        sessionId: event.sessionId,
        nodeId: event.nodeId,
        version: prompt?.version ?? 0,
        hash: prompt?.metadata?.hash ?? null,
        source: prompt?.source ?? null,
        model: typeof payload.model === "string" ? payload.model : null,
        environment: event.environment,
        occurredAt: event.occurredAt.toISOString(),
        captured: payload.captured === true,
      };
    }),
  };
}

// Evaluations provide evidence only after the application reports actual prompt use.
export async function promptEvidence(
  db: TelemetryDb,
  scope: PromptScope,
  key: string,
) {
  const runs = await db
    .select()
    .from(evalRuns)
    .where(
      and(
        where(evalRuns, scope),
        sql`${evalRuns.request} -> 'promptSnapshot' -> 'versions' ? ${key}`,
      ),
    )
    .orderBy(desc(evalRuns.createdAt))
    .limit(200);
  const assignments = await db
    .select({
      key: promptAssets.key,
      environment: promptAssignments.environment,
      version: promptAssignments.version,
    })
    .from(promptAssignments)
    .innerJoin(promptAssets, eq(promptAssets.id, promptAssignments.promptId))
    .where(where(promptAssignments, scope));
  return runs.flatMap((run) => {
    const request = run.request as typeof run.request & {
      promptSnapshot?: PromptSnapshot;
      promptGroupName?: string;
    };
    const selected = request.promptSnapshot?.versions[key];
    if (!selected) return [];
    const actual =
      run.result?.cases
        .flatMap((item) =>
          item.steps.flatMap((step) => step.observation.promptUsage ?? []),
        )
        .filter((item) => item.id === key) ?? [];
    const companions = Object.values(request.promptSnapshot?.versions ?? {})
      .filter(
        (item) =>
          item.id !== key &&
          (!request.promptSnapshot?.requestedIds ||
            request.promptSnapshot.requestedIds.includes(item.id)),
      )
      .map((item) => ({ key: item.id, version: item.version }));
    return [
      {
        runId: run.id,
        environment: run.environment,
        targetId: run.targetId,
        suiteId: run.suiteId,
        suiteRevision: run.suiteRevision,
        status: run.status,
        version: selected.version,
        fullSuite:
          !run.request.caseIds ||
          run.request.caseIds.length === run.suite.cases.length,
        usage:
          run.status === "queued" || run.status === "running"
            ? ("pending" as const)
            : !actual.length
              ? ("not-used" as const)
              : actual.every(
                    (item) =>
                      item.version === selected.version &&
                      item.hash === selected.hash &&
                      item.environment === run.environment &&
                      item.snapshotRevision ===
                        request.promptSnapshot?.revision,
                  )
                ? companions.every((companion) =>
                    assignments.some(
                      (assignment) =>
                        assignment.key === companion.key &&
                        assignment.environment === run.environment &&
                        assignment.version === companion.version,
                    ),
                  )
                  ? ("verified" as const)
                  : ("context-differs" as const)
                : ("mismatch" as const),
        groupName: request.promptGroupName ?? null,
        createdAt: run.createdAt.toISOString(),
        companions,
      },
    ];
  });
}

async function validateDependencies(
  db: TelemetryDb,
  scope: PromptScope,
  key: string,
  version: number,
  content: PromptContent,
) {
  const versions: PromptSnapshot["versions"] = {
    [key]: { id: key, version, content, hash: await promptHash(content) },
  };
  const visit = async (
    dependency: PromptContent["dependencies"][number],
  ): Promise<void> => {
    const previous = versions[dependency.id];
    if (previous) {
      if (
        previous.version !== dependency.version ||
        previous.hash !== dependency.hash
      )
        throw new PromptError(
          "PROMPT_DEPENDENCY_CONFLICT",
          `Conflicting exact dependencies for ${dependency.id}.`,
        );
      return;
    }
    if (Object.keys(versions).length >= 200)
      throw new PromptError(
        "PROMPT_SNAPSHOT_LIMIT",
        "A dependency closure supports at most 200 versions.",
      );
    const asset = await findAsset(db, scope, dependency.id, true);
    if (asset.archived)
      throw new PromptError(
        "PROMPT_ARCHIVED",
        "Restore archived dependencies before saving.",
        409,
      );
    const selected = await findVersion(db, scope, asset.id, dependency.version);
    versions[dependency.id] = {
      id: dependency.id,
      version: selected.version,
      hash: selected.hash,
      content: selected.content,
    };
    if (selected.hash !== dependency.hash)
      throw new PromptError(
        "PROMPT_DEPENDENCY_MISMATCH",
        `Dependency ${dependency.id} has a different hash.`,
      );
    for (const nested of selected.content.dependencies) await visit(nested);
  };
  for (const dependency of content.dependencies) await visit(dependency);
  await verifyPromptSnapshot({
    schemaVersion: 1,
    environment: "validation",
    revision: "validation",
    source: "local",
    resolvedAt: new Date().toISOString(),
    versions,
  });
}

async function validateGroupMembers(
  db: TelemetryDb,
  scope: PromptScope,
  members: { promptId: string; version: number }[],
) {
  if (new Set(members.map((member) => member.promptId)).size !== members.length)
    throw new PromptError(
      "PROMPT_GROUP_DUPLICATE",
      "A test group can select only one version of each prompt.",
    );
  for (const member of members) {
    const asset = await findAsset(db, scope, member.promptId);
    if (asset.archived)
      throw new PromptError(
        "PROMPT_ARCHIVED",
        "Restore archived prompts before adding them to a group.",
      );
    await findVersion(db, scope, member.promptId, member.version);
  }
}
export async function mutatePrompt(
  db: TelemetryDb,
  scope: PromptScope,
  actor: string,
  raw: PromptMutation,
  context?: { suiteRevisions: Readonly<Record<string, string>> },
): Promise<Record<string, unknown>> {
  const input = PromptMutationSchema.parse(raw);
  if ("content" in input) validatePromptContent(input.content);
  if ("environment" in input)
    await ensureProjectEnvironmentAllowed(db, {
      ...scope,
      environment: input.environment,
    });
  return db.transaction(async (tx) => {
    await lockProject(tx, scope, "update");
    if (input.action === "bulk-update") {
      if (
        new Set(input.assets.map((asset) => asset.id)).size !==
        input.assets.length
      )
        throw new PromptError(
          "PROMPT_BULK_DUPLICATE",
          "Select each prompt only once.",
        );
      for (const asset of input.assets)
        await mutatePrompt(tx, scope, actor, {
          action: "update",
          id: asset.id,
          expectedRevision: asset.expectedRevision,
          ...(input.categoryId !== undefined
            ? { categoryId: input.categoryId }
            : {}),
          ...(input.archived !== undefined ? { archived: input.archived } : {}),
        });
      return { ids: input.assets.map((asset) => asset.id) };
    }
    const audit = async (
      promptId: string | null,
      details: Record<string, unknown> = {},
    ) => {
      await tx
        .insert(promptActivity)
        .values({ ...scope, promptId, actor, action: input.action, details });
    };
    const category = async (id: string | null) => {
      if (!id) return;
      const [found] = await tx
        .select()
        .from(promptCategories)
        .where(and(where(promptCategories, scope), eq(promptCategories.id, id)))
        .limit(1);
      if (!found) missing();
      return found;
    };
    if (input.action === "create") {
      if (input.idempotencyKey) {
        const [retry] = await tx
          .select()
          .from(promptActivity)
          .where(
            and(
              where(promptActivity, scope),
              eq(promptActivity.actor, actor),
              eq(promptActivity.action, "create"),
              sql`${promptActivity.details} ->> 'idempotencyKey' = ${input.idempotencyKey}`,
            ),
          )
          .limit(1);
        if (retry) {
          if (
            retry.details.hash !== (await promptHash(input.content)) ||
            retry.details.key !== input.key ||
            retry.details.name !== input.name ||
            retry.details.note !== input.note ||
            retry.details.categoryId !== input.categoryId
          )
            throw new PromptError(
              "PROMPT_IDEMPOTENCY_CONFLICT",
              "The create key was already used for different content or identity.",
              409,
            );
          return { id: retry.promptId, version: 1 };
        }
      }
      await category(input.categoryId);
      await validateDependencies(tx, scope, input.key, 1, input.content);
      const existing = await tx
        .select()
        .from(promptAssets)
        .where(and(where(promptAssets, scope), eq(promptAssets.key, input.key)))
        .limit(1);
      if (existing.length)
        throw new PromptError(
          "PROMPT_KEY_CONFLICT",
          "This prompt key already exists.",
          409,
        );
      const [asset] = await tx
        .insert(promptAssets)
        .values({
          ...scope,
          key: input.key,
          name: input.name,
          categoryId: input.categoryId,
          latestVersion: 1,
        })
        .returning();
      if (!asset) throw new Error("Prompt was not saved.");
      await tx.insert(promptVersions).values({
        ...scope,
        promptId: asset.id,
        version: 1,
        content: input.content,
        hash: await promptHash(input.content),
        note: input.note,
        author: actor,
      });
      await audit(asset.id, {
        version: 1,
        idempotencyKey: input.idempotencyKey,
        key: input.key,
        name: input.name,
        note: input.note,
        categoryId: input.categoryId,
        hash: await promptHash(input.content),
      });
      return { id: asset.id, version: 1 };
    }
    if (
      input.action === "draft" ||
      input.action === "save" ||
      input.action === "update"
    ) {
      const asset = await findAsset(tx, scope, input.id);
      if (input.action === "update") {
        checkRevision(asset.revision, input.expectedRevision);
        if (input.categoryId !== undefined) await category(input.categoryId);
        if (input.archived) {
          const live = await tx
            .select()
            .from(promptAssignments)
            .where(
              and(
                where(promptAssignments, scope),
                eq(promptAssignments.promptId, asset.id),
              ),
            )
            .limit(1);
          if (live.length)
            throw new PromptError(
              "PROMPT_ASSIGNED",
              "Remove live assignments before archiving this prompt.",
              409,
            );
        }
        await tx
          .update(promptAssets)
          .set({
            ...(input.name ? { name: input.name } : {}),
            ...(input.categoryId !== undefined
              ? { categoryId: input.categoryId }
              : {}),
            ...(input.archived !== undefined
              ? { archived: input.archived }
              : {}),
            revision: asset.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(promptAssets.id, asset.id));
        await audit(asset.id, {
          name: input.name,
          categoryId: input.categoryId,
          archived: input.archived,
        });
        return { id: asset.id, revision: asset.revision + 1 };
      }
      if (input.action === "save") {
        const [retry] = await tx
          .select()
          .from(promptActivity)
          .where(
            and(
              where(promptActivity, scope),
              eq(promptActivity.promptId, asset.id),
              eq(promptActivity.actor, actor),
              sql`${promptActivity.details} ->> 'idempotencyKey' = ${input.idempotencyKey}`,
            ),
          )
          .limit(1);
        if (retry) {
          if (retry.details.hash !== (await promptHash(input.content)))
            throw new PromptError(
              "PROMPT_IDEMPOTENCY_CONFLICT",
              "The save key was already used for different content.",
              409,
            );
          return retry.details;
        }
      }
      if (asset.archived)
        throw new PromptError(
          "PROMPT_ARCHIVED",
          "Restore this prompt before editing it.",
          409,
        );
      checkRevision(asset.latestVersion, input.baseVersion);
      if (input.action === "draft") {
        checkRevision(asset.draftRevision, input.expectedRevision);
        await tx
          .update(promptAssets)
          .set({
            draft: input.content,
            draftBase: input.baseVersion,
            draftRevision: asset.draftRevision + 1,
            updatedAt: new Date(),
          })
          .where(eq(promptAssets.id, asset.id));
        return { id: asset.id, draftRevision: asset.draftRevision + 1 };
      }
      if (input.expectedDraftRevision !== undefined)
        checkRevision(asset.draftRevision, input.expectedDraftRevision);
      const base = await findVersion(tx, scope, asset.id, input.baseVersion),
        hash = await promptHash(input.content);
      if (hash !== input.expectedHash)
        throw new PromptError(
          "PROMPT_REVIEW_CHANGED",
          "The content differs from the reviewed diff.",
          409,
        );
      if (hash === base.hash)
        throw new PromptError(
          "PROMPT_UNCHANGED",
          "Change executable content or configuration before saving a version.",
          409,
        );
      const version = asset.latestVersion + 1;
      await validateDependencies(tx, scope, asset.key, version, input.content);
      await tx.insert(promptVersions).values({
        ...scope,
        promptId: asset.id,
        version,
        content: input.content,
        hash,
        note: input.note,
        author: actor,
      });
      await tx
        .update(promptAssets)
        .set({
          latestVersion: version,
          revision: asset.revision + 1,
          draft: null,
          draftBase: null,
          draftRevision: asset.draftRevision + 1,
          updatedAt: new Date(),
        })
        .where(eq(promptAssets.id, asset.id));
      const result = {
        id: asset.id,
        version,
        hash,
        idempotencyKey: input.idempotencyKey,
      };
      await audit(asset.id, result);
      return result;
    }
    if (input.action === "category-create") {
      const segments = input.path.split("/").map((part) => part.trim());
      if (
        segments.some(
          (part) => !part || part.length > 200 || [".", ".."].includes(part),
        ) ||
        segments.length > 20
      )
        throw new PromptError(
          "PROMPT_CATEGORY_PATH",
          "Use up to 20 nonempty category names separated by /.",
        );
      let parentId: string | null = null;
      for (const name of segments) {
        const [existing] = await tx
          .select()
          .from(promptCategories)
          .where(
            and(
              where(promptCategories, scope),
              eq(promptCategories.name, name),
              parentId
                ? eq(promptCategories.parentId, parentId)
                : sql`${promptCategories.parentId} IS NULL`,
            ),
          )
          .limit(1);
        if (existing) parentId = existing.id;
        else {
          const createdRows: (typeof promptCategories.$inferSelect)[] = await tx
            .insert(promptCategories)
            .values({ ...scope, parentId, name })
            .returning();
          parentId = createdRows[0]?.id ?? missing();
        }
      }
      await audit(null, { categoryId: parentId, path: input.path });
      return { id: parentId };
    }
    if (
      input.action === "category-update" ||
      input.action === "category-delete"
    ) {
      const current = (await category(input.id)) ?? missing();
      checkRevision(current.revision, input.expectedRevision);
      const all = await tx
        .select()
        .from(promptCategories)
        .where(where(promptCategories, scope));
      const subtree = new Set([input.id]);
      for (let changed = true; changed; ) {
        changed = false;
        for (const row of all)
          if (
            row.parentId &&
            subtree.has(row.parentId) &&
            !subtree.has(row.id)
          ) {
            subtree.add(row.id);
            changed = true;
          }
      }
      const destination =
        input.action === "category-update"
          ? input.parentId
          : input.destinationId;
      if (destination && subtree.has(destination))
        throw new PromptError(
          "PROMPT_CATEGORY_CYCLE",
          "Choose a category outside this subtree.",
        );
      if (destination !== undefined) await category(destination);
      if (input.action === "category-update") {
        const parentId =
            input.parentId === undefined ? current.parentId : input.parentId,
          name = input.name ?? current.name;
        let parentDepth = 0,
          ancestor = parentId;
        while (ancestor) {
          parentDepth++;
          ancestor = all.find((item) => item.id === ancestor)?.parentId ?? null;
        }
        const descendantDepth = (id: string): number =>
          1 +
          Math.max(
            0,
            ...all
              .filter((item) => item.parentId === id)
              .map((item) => descendantDepth(item.id)),
          );
        if (parentDepth + descendantDepth(input.id) > 20)
          throw new PromptError(
            "PROMPT_CATEGORY_DEPTH",
            "Categories support at most 20 levels.",
          );
        if (
          all.some(
            (item) =>
              item.id !== input.id &&
              item.parentId === parentId &&
              item.name === name,
          )
        )
          throw new PromptError(
            "PROMPT_CATEGORY_CONFLICT",
            "A sibling category has this name.",
            409,
          );
        await tx
          .update(promptCategories)
          .set({ parentId, name, revision: current.revision + 1 })
          .where(eq(promptCategories.id, input.id));
      } else {
        await tx
          .update(promptAssets)
          .set({
            categoryId: input.destinationId,
            revision: sql`${promptAssets.revision} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              where(promptAssets, scope),
              inArray(promptAssets.categoryId, [...subtree]),
            ),
          );
        await tx
          .delete(promptCategories)
          .where(
            and(
              where(promptCategories, scope),
              inArray(promptCategories.id, [...subtree]),
            ),
          );
      }
      await audit(null, { categoryId: input.id, destinationId: destination });
      return { id: input.id };
    }
    if (input.action === "group-create") {
      await validateGroupMembers(tx, scope, input.members ?? []);
      const [existing] = await tx
        .select()
        .from(promptGroups)
        .where(
          and(where(promptGroups, scope), eq(promptGroups.name, input.name)),
        )
        .limit(1);
      if (existing)
        throw new PromptError(
          "PROMPT_GROUP_CONFLICT",
          "A test group has this name.",
          409,
        );
      const [created] = await tx
        .insert(promptGroups)
        .values({ ...scope, name: input.name, members: input.members ?? [] })
        .returning();
      await audit(null, { groupId: created?.id });
      return { id: created?.id };
    }
    if (input.action === "group-update" || input.action === "group-delete") {
      const [group] = await tx
        .select()
        .from(promptGroups)
        .where(and(where(promptGroups, scope), eq(promptGroups.id, input.id)))
        .limit(1);
      if (!group) return missing();
      checkRevision(group.revision, input.expectedRevision);
      if (input.action === "group-delete")
        await tx.delete(promptGroups).where(eq(promptGroups.id, input.id));
      else {
        if (input.members) {
          await validateGroupMembers(tx, scope, input.members);
        }

        if (input.name) {
          const [other] = await tx
            .select()
            .from(promptGroups)
            .where(
              and(
                where(promptGroups, scope),
                eq(promptGroups.name, input.name),
                sql`${promptGroups.id} <> ${input.id}`,
              ),
            )
            .limit(1);
          if (other)
            throw new PromptError(
              "PROMPT_GROUP_CONFLICT",
              "A test group has this name.",
              409,
            );
        }
        await tx
          .update(promptGroups)
          .set({
            ...(input.name ? { name: input.name } : {}),
            ...(input.members ? { members: input.members } : {}),
            revision: group.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(promptGroups.id, input.id));
      }
      await audit(null, { groupId: input.id, groupName: group.name });
      return { id: input.id };
    }
    if (input.action === "review") {
      const asset = await findAsset(tx, scope, input.id),
        version = await findVersion(tx, scope, asset.id, input.version);
      await tx
        .insert(promptReviews)
        .values({
          ...scope,
          promptId: asset.id,
          version: input.version,
          hash: version.hash,
          environment: input.environment,
          reviewer: actor,
          note: input.note,
        })
        .onConflictDoUpdate({
          target: [
            promptReviews.organizationId,
            promptReviews.projectId,
            promptReviews.promptId,
            promptReviews.version,
            promptReviews.environment,
            promptReviews.reviewer,
          ],
          set: { note: input.note, createdAt: new Date() },
        });
      await audit(asset.id, {
        version: input.version,
        environment: input.environment,
        note: input.note,
      });
      return { id: asset.id };
    }
    if (input.action === "policy") {
      await ensureProjectEnvironmentAllowed(tx, {
        ...scope,
        environment: input.policy.environment,
      });
      const [policy] = await tx
        .select()
        .from(promptPolicies)
        .where(
          and(
            where(promptPolicies, scope),
            eq(promptPolicies.environment, input.policy.environment),
          ),
        )
        .limit(1);
      checkRevision(policy?.revision ?? 0, input.policy.revision);
      await tx
        .insert(promptPolicies)
        .values({
          ...scope,
          ...input.policy,
          revision: (policy?.revision ?? 0) + 1,
        })
        .onConflictDoUpdate({
          target: [
            promptPolicies.organizationId,
            promptPolicies.projectId,
            promptPolicies.environment,
          ],
          set: { ...input.policy, revision: (policy?.revision ?? 0) + 1 },
        });
      await audit(null, { policy: input.policy });
      return { environment: input.policy.environment };
    }
    const asset = await findAsset(tx, scope, input.id),
      version = await findVersion(tx, scope, asset.id, input.version);
    if (asset.archived)
      throw new PromptError(
        "PROMPT_ARCHIVED",
        "Restore this prompt before promotion.",
        409,
      );
    const [assignment] = await tx
      .select()
      .from(promptAssignments)
      .where(
        and(
          where(promptAssignments, scope),
          eq(promptAssignments.promptId, asset.id),
          eq(promptAssignments.environment, input.environment),
        ),
      )
      .limit(1);
    checkRevision(assignment?.revision ?? 0, input.expectedRevision);
    const [savedPolicy] = await tx
      .select()
      .from(promptPolicies)
      .where(
        and(
          where(promptPolicies, scope),
          eq(promptPolicies.environment, input.environment),
        ),
      )
      .limit(1);
    const policy = savedPolicy ?? {
      requireTest: true,
      requiredSuites: [],
      requiredReviews: 0,
      allowException: true,
    };
    const evidence = await promptEvidence(tx, scope, asset.key),
      assignments = await tx
        .select()
        .from(promptAssignments)
        .innerJoin(
          promptAssets,
          eq(promptAssets.id, promptAssignments.promptId),
        )
        .where(
          and(
            where(promptAssignments, scope),
            eq(promptAssignments.environment, input.environment),
          ),
        );
    const eligible = evidence.filter(
      (item) =>
        item.version === input.version &&
        item.environment === input.environment &&
        item.status === "passed" &&
        item.fullSuite &&
        item.usage === "verified" &&
        (!context ||
          context.suiteRevisions[
            JSON.stringify([item.targetId, item.suiteId])
          ] === item.suiteRevision) &&
        item.companions.every((companion) =>
          assignments.some(
            (row) =>
              row.prompt_assets.key === companion.key &&
              row.prompt_assignments.version === companion.version,
          ),
        ),
    );
    const reviews = await tx
      .select()
      .from(promptReviews)
      .where(
        and(
          where(promptReviews, scope),
          eq(promptReviews.promptId, asset.id),
          eq(promptReviews.version, input.version),
          eq(promptReviews.hash, version.hash),
          eq(promptReviews.environment, input.environment),
        ),
      );
    const failures = [
      ...(policy.requireTest && !eligible.length
        ? [
            "A complete passing destination evaluation with verified usage is required.",
          ]
        : []),
      ...policy.requiredSuites
        .filter(
          (suite) =>
            !eligible.some(
              (item) =>
                item.targetId === suite.targetId &&
                item.suiteId === suite.suiteId,
            ),
        )
        .map(
          (suite) => `Required suite ${suite.suiteId} has no eligible pass.`,
        ),
      ...(reviews.filter(
        (review) =>
          review.reviewer !== version.author &&
          review.reviewer.startsWith("studio-user:"),
      ).length < policy.requiredReviews
        ? ["Independent human reviews are required."]
        : []),
    ];
    if (failures.length && (!input.exceptionReason || !policy.allowException))
      throw new PromptError(
        "PROMPT_PROMOTION_BLOCKED",
        failures.join(" "),
        409,
      );
    const revision = (assignment?.revision ?? 0) + 1;
    await tx
      .insert(promptAssignments)
      .values({
        ...scope,
        promptId: asset.id,
        environment: input.environment,
        version: input.version,
        revision,
      })
      .onConflictDoUpdate({
        target: [
          promptAssignments.organizationId,
          promptAssignments.projectId,
          promptAssignments.promptId,
          promptAssignments.environment,
        ],
        set: { version: input.version, revision, updatedAt: new Date() },
      });
    await audit(asset.id, {
      version: input.version,
      previousVersion: assignment?.version,
      environment: input.environment,
      revision,
      rollback: input.rollback,
      exceptionReason: input.exceptionReason,
      failedChecks: failures,
    });
    return { id: asset.id, version: input.version, revision };
  });
}
