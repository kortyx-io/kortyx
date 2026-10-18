import {
  canonicalPromptJson,
  expandPromptMessages,
  type PromptContent,
  PromptError,
  promptHash,
  promptReferencePattern,
  promptReferenceToken,
  validatePromptContent,
} from "@kortyx/prompts";
import {
  type PromptBundle,
  PromptBundleSchema,
  type PromptTransferRequest,
  PromptTransferRequestSchema,
} from "@kortyx/telemetry-contracts";
import { and, asc, eq, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import {
  projects,
  promptActivity,
  promptAssets,
  promptCategories,
  promptGroups,
  promptTransferPlans,
  promptVersions,
} from "../schema";
import type { PromptScope } from "./prompts";

const scoped = (scope: PromptScope) =>
  sql`organization_id = ${scope.organizationId} AND project_id = ${scope.projectId}`;
const hashJson = async (value: unknown) => {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalPromptJson(value)),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export async function exportPrompts(
  db: TelemetryDb,
  scope: PromptScope,
  options: {
    keys: string[];
    versions?: Record<string, number>;
    history?: boolean;
    groups?: boolean;
    apiUrl: string;
  },
): Promise<PromptBundle> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, scope.organizationId),
          eq(projects.id, scope.projectId),
        ),
      )
      .for("share");
    const assets = await tx.select().from(promptAssets).where(scoped(scope)),
      categories = await tx
        .select()
        .from(promptCategories)
        .where(scoped(scope));
    const entries = new Map<string, PromptBundle["prompts"][number]>();
    const path = (id: string | null): string => {
      const category = categories.find((item) => item.id === id);
      return category
        ? [path(category.parentId), category.name].filter(Boolean).join("/")
        : "";
    };
    const load = async (key: string, version?: number, history = false) => {
      const asset = assets.find((item) => item.key === key);
      if (!asset)
        throw new PromptError(
          "PROMPT_NOT_FOUND",
          `Prompt ${key} not found.`,
          404,
        );
      const rows = await tx
        .select()
        .from(promptVersions)
        .where(
          and(
            scoped(scope),
            eq(promptVersions.promptId, asset.id),
            history
              ? undefined
              : eq(promptVersions.version, version ?? asset.latestVersion),
          ),
        )
        .orderBy(asc(promptVersions.version));
      if (!rows.length)
        throw new PromptError(
          "PROMPT_NOT_FOUND",
          `Version ${key}@${version} not found.`,
          404,
        );
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          key,
          name: asset.name,
          ...(path(asset.categoryId)
            ? { categoryPath: path(asset.categoryId) }
            : {}),
          versions: [],
        };
        entries.set(key, entry);
      }
      for (const row of rows) {
        if (entry.versions.some((item) => item.version === row.version))
          continue;
        if (
          [...entries.values()].reduce(
            (total, item) => total + item.versions.length,
            0,
          ) >= 200
        )
          throw new PromptError(
            "PROMPT_TRANSFER_LIMIT",
            "Export at most 200 versions per bundle.",
          );
        entry.versions.push({
          id: key,
          version: row.version,
          hash: row.hash,
          content: row.content,
          note: row.note,
        });
        for (const dependency of row.content.dependencies)
          await load(dependency.id, dependency.version);
      }
    };
    for (const key of options.keys)
      await load(key, options.versions?.[key], options.history);
    const groups = options.groups
      ? await tx.select().from(promptGroups).where(scoped(scope))
      : [];
    return PromptBundleSchema.parse({
      schemaVersion: 1,
      origin: { apiUrl: options.apiUrl, projectId: scope.projectId },
      prompts: [...entries.values()],
      groups: groups
        .filter((group) =>
          group.members.every((member) => {
            const asset = assets.find((item) => item.id === member.promptId);
            return (
              asset &&
              entries
                .get(asset.key)
                ?.versions.some((item) => item.version === member.version)
            );
          }),
        )
        .map((group) => ({
          name: group.name,
          members: group.members.map((member) => ({
            key: assets.find((item) => item.id === member.promptId)!.key,
            version: member.version,
          })),
        })),
    });
  });
}

type Mapping = {
  sourceKey: string;
  sourceVersion: number;
  sourceHash: string;
  key: string;
  promptId: string;
  version: number;
  hash: string;
  content: PromptContent;
  note: string;
  reuse: boolean;
};
type Plan = PromptTransferRequest & {
  heads: {
    key: string;
    id: string | null;
    latestVersion: number;
    revision: number;
  }[];
  mapping: Mapping[];
};
async function prepare(
  db: TelemetryDb,
  scope: PromptScope,
  request: PromptTransferRequest,
): Promise<Plan> {
  const heads: Plan["heads"] = [],
    mapping: Mapping[] = [];
  const assets = await db.select().from(promptAssets).where(scoped(scope));
  const existingVersions = await db
    .select()
    .from(promptVersions)
    .where(scoped(scope));
  const all = request.bundle.prompts.flatMap((asset) =>
    asset.versions.map((version) => ({ asset, version })),
  );
  if (
    all.length > 200 ||
    new Set(all.map((item) => `${item.asset.key}@${item.version.version}`))
      .size !== all.length ||
    new Set(
      request.bundle.prompts.map(
        (item) => request.rename[item.key] ?? item.key,
      ),
    ).size !== request.bundle.prompts.length
  )
    throw new PromptError(
      "PROMPT_TRANSFER_DUPLICATE",
      "A bundle must contain unique keys and versions, with at most 200 versions.",
    );
  const active = new Set<string>();
  for (const prompt of request.bundle.prompts) {
    if (prompt.categoryPath) {
      const parts = prompt.categoryPath.split("/");
      if (
        parts.length > 20 ||
        parts.some(
          (part) =>
            !part.trim() || part.length > 200 || part === "." || part === "..",
        )
      )
        throw new PromptError(
          "PROMPT_CATEGORY_INVALID",
          "Bundle category paths require valid names and at most 20 levels.",
        );
    }
  }
  if (
    new Set(request.bundle.groups.map((group) => group.name)).size !==
      request.bundle.groups.length ||
    request.bundle.groups.some(
      (group) =>
        new Set(group.members.map((member) => member.key)).size !==
        group.members.length,
    )
  )
    throw new PromptError(
      "PROMPT_GROUP_INVALID",
      "Bundle group names must be unique, with one version per prompt.",
    );
  const visit = async (key: string, version: number): Promise<Mapping> => {
    const identity = `${key}@${version}`,
      mapped = mapping.find(
        (item) => item.sourceKey === key && item.sourceVersion === version,
      );
    if (mapped) return mapped;
    if (active.has(identity))
      throw new PromptError(
        "PROMPT_DEPENDENCY_CYCLE",
        "Bundle dependencies contain a cycle.",
      );
    active.add(identity);
    const source = all.find(
      (item) => item.asset.key === key && item.version.version === version,
    );
    if (!source || source.version.id !== key)
      throw new PromptError(
        "PROMPT_TRANSFER_DEPENDENCY",
        `Missing exact bundle version ${identity}.`,
      );
    validatePromptContent(source.version.content);
    if ((await promptHash(source.version.content)) !== source.version.hash)
      throw new PromptError(
        "PROMPT_HASH_MISMATCH",
        `Corrupted bundle version ${identity}.`,
      );
    const dependencies = [];
    for (const dependency of source.version.content.dependencies) {
      const dep = await visit(dependency.id, dependency.version);
      if (dep.sourceHash !== dependency.hash)
        throw new PromptError(
          "PROMPT_DEPENDENCY_MISMATCH",
          `Incorrect dependency ${identity}.`,
        );
      dependencies.push({ id: dep.key, version: dep.version, hash: dep.hash });
    }
    const closure: Record<string, typeof source.version> = {};
    const collect = (selected: typeof source.version) => {
      const previous = closure[selected.id];
      if (previous) {
        if (
          previous.version !== selected.version ||
          previous.hash !== selected.hash
        )
          throw new PromptError(
            "PROMPT_DEPENDENCY_CONFLICT",
            `Conflicting dependency versions for ${selected.id}.`,
          );
        return;
      }
      closure[selected.id] = selected;
      for (const dependency of selected.content.dependencies) {
        const child = all.find(
          (item) =>
            item.asset.key === dependency.id &&
            item.version.version === dependency.version,
        );
        if (!child)
          throw new PromptError(
            "PROMPT_TRANSFER_DEPENDENCY",
            `Missing ${dependency.id}.`,
          );
        collect(child.version);
      }
    };
    collect(source.version);
    validatePromptContent({
      ...source.version.content,
      messages: expandPromptMessages(source.version, closure).messages,
    });
    const destinationKey = request.rename[key] ?? key,
      destination = assets.find((item) => item.key === destinationKey);
    if (destination?.archived)
      throw new PromptError(
        "PROMPT_ARCHIVED",
        `Restore ${destinationKey} before importing.`,
        409,
      );
    let head = heads.find((item) => item.key === destinationKey);
    if (!head) {
      head = {
        key: destinationKey,
        id: destination?.id ?? null,
        latestVersion: destination?.latestVersion ?? 0,
        revision: destination?.revision ?? 0,
      };
      heads.push(head);
    }
    const content = {
        ...source.version.content,
        dependencies,
        messages: source.version.content.messages.map((message) => ({
          ...message,
          content: message.content.replace(
            promptReferencePattern,
            (_, id: string) => promptReferenceToken(request.rename[id] ?? id),
          ),
        })),
      },
      hash = await promptHash(content);
    const identical = destination
      ? existingVersions.find(
          (item) => item.promptId === destination.id && item.hash === hash,
        )
      : undefined;
    const duplicate = mapping.find(
      (item) => item.key === destinationKey && item.hash === hash,
    );
    if (
      destination &&
      !identical &&
      !duplicate &&
      request.conflicts === "error"
    )
      throw new PromptError(
        "PROMPT_TRANSFER_CONFLICT",
        `Destination ${destinationKey} contains different content. Choose append or rename explicitly.`,
        409,
      );
    const result: Mapping = {
      sourceKey: key,
      sourceVersion: version,
      sourceHash: source.version.hash,
      key: destinationKey,
      promptId:
        destination?.id ??
        mapping.find((item) => item.key === destinationKey)?.promptId ??
        crypto.randomUUID(),
      version:
        identical?.version ??
        duplicate?.version ??
        head.latestVersion +
          mapping.filter((item) => item.key === destinationKey && !item.reuse)
            .length +
          1,
      hash,
      content,
      note: source.version.note,
      reuse: Boolean(identical || duplicate),
    };
    mapping.push(result);
    active.delete(identity);
    return result;
  };
  for (const item of all) await visit(item.asset.key, item.version.version);
  return { ...request, heads, mapping };
}
export async function planPromptTransfer(
  db: TelemetryDb,
  scope: PromptScope,
  actor: string,
  raw: PromptTransferRequest,
) {
  const request = PromptTransferRequestSchema.parse(raw);
  return db.transaction(async (tx) => {
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, scope.organizationId),
          eq(projects.id, scope.projectId),
        ),
      )
      .for("share");
    const plan = await prepare(tx, scope, request),
      bundleHash = await hashJson(request.bundle);
    const [saved] = await tx
      .insert(promptTransferPlans)
      .values({
        ...scope,
        actor,
        bundleHash,
        plan,
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    if (!saved) throw new Error("Transfer plan was not saved.");
    return {
      id: saved.id,
      bundleHash,
      expiresAt: saved.expiresAt.toISOString(),
      mapping: plan.mapping.map(({ content: _, ...item }) => item),
      assignmentsChanged: false,
    };
  });
}
export async function applyPromptTransfer(
  db: TelemetryDb,
  scope: PromptScope,
  actor: string,
  id: string,
  bundleHash: string,
) {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, scope.organizationId),
          eq(projects.id, scope.projectId),
        ),
      )
      .for("update");
    const [saved] = await tx
      .select()
      .from(promptTransferPlans)
      .where(
        and(
          scoped(scope),
          eq(promptTransferPlans.id, id),
          eq(promptTransferPlans.actor, actor),
        ),
      )
      .limit(1);
    if (!saved)
      throw new PromptError(
        "PROMPT_TRANSFER_NOT_FOUND",
        "Transfer plan not found for this identity.",
        404,
      );
    if (saved.bundleHash !== bundleHash)
      throw new PromptError(
        "PROMPT_TRANSFER_HASH",
        "The reviewed bundle hash differs.",
        409,
      );
    if (saved.result) return saved.result;
    if (saved.expiresAt.getTime() < Date.now())
      throw new PromptError(
        "PROMPT_TRANSFER_EXPIRED",
        "Transfer plan expired. Plan again.",
        409,
      );
    const plan = saved.plan as Plan,
      assets = await tx.select().from(promptAssets).where(scoped(scope));
    for (const head of plan.heads) {
      const current = assets.find((item) => item.key === head.key);
      if (
        (current?.id ?? null) !== head.id ||
        (current?.revision ?? 0) !== head.revision ||
        (current?.latestVersion ?? 0) !== head.latestVersion
      )
        throw new PromptError(
          "PROMPT_TRANSFER_STALE",
          `Destination ${head.key} changed since planning. Plan again.`,
          409,
        );
    }
    for (const head of plan.heads) {
      if (head.id) continue;
      const sourceKey = plan.mapping.find(
          (item) => item.key === head.key,
        )!.sourceKey,
        source = plan.bundle.prompts.find((item) => item.key === sourceKey)!;
      let categoryId: string | null = null;
      if (plan.categories && source.categoryPath)
        for (const name of source.categoryPath.split("/")) {
          if (!name.trim() || name.length > 200)
            throw new PromptError(
              "PROMPT_CATEGORY_PATH",
              "Invalid category path in bundle.",
            );
          const [existing] = await tx
            .select()
            .from(promptCategories)
            .where(
              and(
                scoped(scope),
                eq(promptCategories.name, name),
                categoryId
                  ? eq(promptCategories.parentId, categoryId)
                  : sql`${promptCategories.parentId} IS NULL`,
              ),
            )
            .limit(1);
          if (existing) categoryId = existing.id;
          else {
            const created: (typeof promptCategories.$inferSelect)[] = await tx
              .insert(promptCategories)
              .values({ ...scope, name, parentId: categoryId })
              .returning();
            categoryId = created[0]!.id;
          }
        }
      await tx.insert(promptAssets).values({
        ...scope,
        id: plan.mapping.find((item) => item.key === head.key)!.promptId,
        key: head.key,
        name: source.name,
        categoryId,
      });
    }
    for (const item of plan.mapping)
      if (!item.reuse)
        await tx.insert(promptVersions).values({
          ...scope,
          promptId: item.promptId,
          version: item.version,
          content: item.content,
          hash: item.hash,
          note: item.note,
          author: actor,
          origin: {
            ...plan.bundle.origin,
            key: item.sourceKey,
            version: item.sourceVersion,
            hash: item.sourceHash,
          },
        });
    for (const head of plan.heads) {
      const mapped = plan.mapping.filter((item) => item.key === head.key),
        highest = Math.max(
          head.latestVersion,
          ...mapped.map((item) => item.version),
        );
      if (highest !== head.latestVersion || !head.id)
        await tx
          .update(promptAssets)
          .set({
            latestVersion: highest,
            revision: head.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(promptAssets.id, mapped[0]!.promptId));
    }
    if (plan.groups)
      for (const group of plan.bundle.groups) {
        const members = group.members.map((member) => {
          const mapped = plan.mapping.find(
            (item) =>
              item.sourceKey === member.key &&
              item.sourceVersion === member.version,
          );
          if (!mapped)
            throw new PromptError(
              "PROMPT_TRANSFER_GROUP",
              "Group references a version outside the bundle.",
            );
          return { promptId: mapped.promptId, version: mapped.version };
        });
        const [existing] = await tx
          .select()
          .from(promptGroups)
          .where(and(scoped(scope), eq(promptGroups.name, group.name)))
          .limit(1);
        if (
          existing &&
          canonicalPromptJson(existing.members) !== canonicalPromptJson(members)
        )
          throw new PromptError(
            "PROMPT_GROUP_CONFLICT",
            `Destination group ${group.name} differs.`,
            409,
          );
        if (!existing)
          await tx
            .insert(promptGroups)
            .values({ ...scope, name: group.name, members });
      }
    const result = {
      id,
      bundleHash,
      mapping: plan.mapping.map(({ content: _, ...item }) => item),
      assignmentsChanged: false,
      verified: true,
    };
    await tx
      .update(promptTransferPlans)
      .set({ result })
      .where(eq(promptTransferPlans.id, id));
    await tx
      .insert(promptActivity)
      .values({ ...scope, actor, action: "import", details: result });
    return result;
  });
}
