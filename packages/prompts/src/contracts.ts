import { z } from "zod";

export const PROMPT_PROTOCOL_VERSION = 1 as const;
export const PromptKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/);
export const PromptMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().max(200_000),
  })
  .strict();
export const PromptContentSchema = z
  .object({
    format: z.enum(["system-user", "chat"]),
    messages: z.array(PromptMessageSchema).min(1).max(100),
    variablesSchema: z.record(z.string(), z.json()),
    configSchema: z.record(z.string(), z.json()),
    config: z.record(z.string(), z.json()),
    dependencies: z
      .array(
        z
          .object({
            id: PromptKeySchema,
            version: z.number().int().positive(),
            hash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.format === "system-user" &&
      (value.messages.length !== 2 ||
        value.messages[0]?.role !== "system" ||
        value.messages[1]?.role !== "user")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "system-user requires exactly one system message followed by one user message.",
        path: ["messages"],
      });
  });
export const PromptVersionSchema = z.object({
  id: PromptKeySchema,
  version: z.number().int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  content: PromptContentSchema,
});
export const PromptSnapshotSchema = z
  .object({
    schemaVersion: z.literal(PROMPT_PROTOCOL_VERSION),
    environment: z.string().min(1).max(128),
    revision: z.string().min(1),
    versions: z.record(z.string(), PromptVersionSchema),
    source: z.enum(["studio", "local", "cache", "fallback", "eval"]),
    resolvedAt: z.iso.datetime(),
    requestedIds: z.array(PromptKeySchema).max(100).optional(),
  })
  .strict();
export type PromptContent = z.infer<typeof PromptContentSchema>;
export type PromptVersion = z.infer<typeof PromptVersionSchema>;
export type PromptSnapshot = z.infer<typeof PromptSnapshotSchema>;

export class PromptError extends Error {
  override name = "PromptError";
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** The executable hash excludes mutable names, categories, authors and notes. */
export function canonicalPromptJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalPromptJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalPromptJson((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}
export async function promptHash(content: PromptContent): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalPromptJson(content)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyPromptSnapshot(
  value: unknown,
): Promise<PromptSnapshot> {
  const parsed = PromptSnapshotSchema.safeParse(value);
  if (!parsed.success)
    throw new PromptError(
      "PROMPT_SNAPSHOT_INVALID",
      "The prompt snapshot does not match the serving contract.",
    );
  const snapshot = parsed.data;
  if (Object.keys(snapshot.versions).length > 200)
    throw new PromptError(
      "PROMPT_SNAPSHOT_LIMIT",
      "A snapshot supports at most 200 versions.",
    );
  for (const [key, version] of Object.entries(snapshot.versions)) {
    if (
      key !== version.id ||
      (await promptHash(version.content)) !== version.hash
    )
      throw new PromptError(
        "PROMPT_HASH_MISMATCH",
        `Prompt ${key} did not match its immutable hash.`,
      );
    for (const dependency of version.content.dependencies) {
      const actual = snapshot.versions[dependency.id];
      if (
        !actual ||
        actual.version !== dependency.version ||
        actual.hash !== dependency.hash
      )
        throw new PromptError(
          "PROMPT_DEPENDENCY_MISMATCH",
          `Missing exact dependency ${dependency.id}@${dependency.version}.`,
        );
    }
  }
  const visit = (key: string, active: Set<string>, done: Set<string>) => {
    if (active.has(key))
      throw new PromptError(
        "PROMPT_DEPENDENCY_CYCLE",
        `Prompt dependency cycle at ${key}.`,
      );
    if (done.has(key)) return;
    active.add(key);
    for (const dep of snapshot.versions[key]?.content.dependencies ?? [])
      visit(dep.id, active, done);
    active.delete(key);
    done.add(key);
  };
  const done = new Set<string>();
  for (const key of Object.keys(snapshot.versions)) visit(key, new Set(), done);
  const freeze = (value: unknown): void => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const nested of Object.values(value)) freeze(nested);
      Object.freeze(value);
    }
  };
  freeze(snapshot);
  return snapshot;
}
