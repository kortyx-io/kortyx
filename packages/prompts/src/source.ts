import { type CompiledPrompt, compilePrompt, type PromptRef } from "./compiler";
import {
  PromptError,
  type PromptSnapshot,
  PromptTagSchema,
  verifyPromptSnapshot,
} from "./contracts";

export interface PromptSource {
  readonly environment?: string;
  readonly tag?: string;
  readonly identity: string;
  resolve(
    ids: readonly string[],
    options: {
      environment: string;
      tag?: string;
      versions?: Record<string, number>;
      signal?: AbortSignal;
    },
  ): Promise<PromptSnapshot>;
}
export interface PromptCache {
  get(key: string): Promise<PromptSnapshot | undefined>;
  set(key: string, snapshot: PromptSnapshot): Promise<void>;
}
export interface PromptExecution {
  recordUsage(usage: PromptUsageReceipt): void;
  snapshot(stored?: unknown): Promise<PromptSnapshot>;
  pin(id: string, version: number, stored?: unknown): Promise<PromptSnapshot>;
  resolve<Inputs, Config>(
    ref: PromptRef<Inputs, Config>,
    options: {
      variables: Inputs;
      version?: number;
      stored?: unknown;
      pin?: PromptSnapshot;
    },
  ): Promise<CompiledPrompt<Config>>;
}
export interface PromptManager {
  definitions: readonly PromptRef[];
  start(options?: {
    snapshot?: PromptSnapshot;
    signal?: AbortSignal;
    onUsage?: (usage: PromptUsageReceipt) => void;
  }): PromptExecution;
}
export type PromptUsageReceipt = {
  id: string;
  version: number;
  hash: string;
  environment: string;
  snapshotRevision: string;
  model?: string;
};
export function createPrompts(options: {
  definitions: readonly PromptRef[];
  source: PromptSource;
  environment?: string;
  fallback?: "last-known-good" | "error";
  maxStaleMs?: number;
  cache?: PromptCache;
}): PromptManager {
  const ids = options.definitions.map((ref) => ref.id),
    tag = PromptTagSchema.parse(options.source.tag ?? "live"),
    environment =
      options.environment ?? options.source.environment ?? "production";
  if (
    options.maxStaleMs !== undefined &&
    (!Number.isFinite(options.maxStaleMs) || options.maxStaleMs < 0)
  )
    throw new PromptError(
      "PROMPT_CACHE_INVALID",
      "maxStaleMs must be a finite, nonnegative duration.",
    );
  if (options.source.environment && options.source.environment !== environment)
    throw new PromptError(
      "PROMPT_ENVIRONMENT_MISMATCH",
      "Source and manager environments must match.",
    );
  if (new Set(ids).size !== ids.length)
    throw new PromptError(
      "PROMPT_REFERENCE_DUPLICATE",
      "Registered prompt IDs must be unique.",
    );
  let lastGood: PromptSnapshot | undefined;
  const cacheKey = `${options.source.identity}:${environment}:${tag}:${JSON.stringify([...ids].sort())}`;
  const fresh = async (signal?: AbortSignal) => {
    const pending = options.source
      .resolve(ids, { environment, tag, ...(signal ? { signal } : {}) })
      .then(verifyPromptSnapshot)
      .then(async (value) => {
        for (const id of ids)
          if (!value.versions[id])
            throw new PromptError(
              "PROMPT_NOT_ASSIGNED",
              `No ${tag} tag for ${id}.`,
              404,
            );
        if (value.environment !== environment)
          throw new PromptError(
            "PROMPT_ENVIRONMENT_MISMATCH",
            "Source returned a different environment.",
          );
        if ((value.tag ?? "live") !== tag)
          throw new PromptError(
            "PROMPT_TAG_MISMATCH",
            "Source returned a different prompt tag.",
          );
        lastGood = value;
        await options.cache?.set(cacheKey, value);
        return value;
      });
    try {
      return await pending;
    } catch (error) {
      if (
        signal?.aborted ||
        options.fallback !== "last-known-good" ||
        (error instanceof PromptError &&
          error.status < 500 &&
          error.status !== 429)
      )
        throw error;
      const cached = lastGood ?? (await options.cache?.get(cacheKey));
      if (
        !cached ||
        cached.environment !== environment ||
        (cached.tag ?? "live") !== tag ||
        Date.parse(cached.resolvedAt) > Date.now() + 30_000 ||
        Date.now() - Date.parse(cached.resolvedAt) >
          (options.maxStaleMs ?? 300_000)
      )
        throw error;
      return {
        ...(await verifyPromptSnapshot(cached)),
        source: "fallback" as const,
      };
    }
  };
  return {
    definitions: options.definitions,
    start(start = {}) {
      let snapshotPromise: Promise<PromptSnapshot> | undefined;
      const snapshot = (stored?: unknown) => {
        if (snapshotPromise) return snapshotPromise;
        snapshotPromise = stored
          ? verifyPromptSnapshot(stored).then((value) => {
              if (value.environment !== environment)
                throw new PromptError(
                  "PROMPT_ENVIRONMENT_MISMATCH",
                  "Stored snapshot belongs to another environment.",
                );
              return value;
            })
          : start.snapshot
            ? verifyPromptSnapshot(start.snapshot).then((value) => {
                if (
                  value.source !== "eval" ||
                  value.environment !== environment
                )
                  throw new PromptError(
                    "PROMPT_EVAL_SNAPSHOT_INVALID",
                    "An eval snapshot must match the configured environment.",
                  );
                return value;
              })
            : fresh(start.signal);
        return snapshotPromise;
      };
      const pins = new Map<string, Promise<PromptSnapshot>>();
      const pin = async (id: string, version: number, stored?: unknown) => {
        const baseline = await snapshot();
        if (
          baseline.source === "eval" &&
          baseline.versions[id]?.version !== version
        )
          throw new PromptError(
            "PROMPT_EVAL_PIN_CONFLICT",
            `Pinned ${id}@${version} conflicts with the eval snapshot.`,
          );
        const key = `${id}@${version}`;
        let pendingPin = pins.get(key);
        if (!pendingPin) {
          pendingPin = (
            stored
              ? verifyPromptSnapshot(stored)
              : baseline.versions[id]?.version === version
                ? Promise.resolve(baseline)
                : options.source
                    .resolve([id], {
                      environment,
                      tag,
                      versions: { [id]: version },
                      ...(start.signal ? { signal: start.signal } : {}),
                    })
                    .then(verifyPromptSnapshot)
          ).then((value) => {
            if (
              value.environment !== environment ||
              value.versions[id]?.version !== version
            )
              throw new PromptError(
                "PROMPT_PIN_MISMATCH",
                `Source returned a different pin for ${id}.`,
              );
            return value;
          });
          pins.set(key, pendingPin);
        }
        return pendingPin;
      };
      return {
        snapshot,
        pin,
        recordUsage(usage) {
          start.onUsage?.(usage);
        },
        async resolve(ref, args) {
          if (!ids.includes(ref.id))
            throw new PromptError(
              "PROMPT_NOT_REGISTERED",
              `Register ${ref.id} with createPrompts.`,
            );
          const resolved = await snapshot(args.stored);
          let selectedSnapshot = resolved;
          let selected = resolved.versions[ref.id];
          if (
            args.version !== undefined &&
            selected?.version !== args.version
          ) {
            const pinned = await pin(ref.id, args.version, args.pin);
            selectedSnapshot = pinned;
            selected = pinned.versions[ref.id];
            if (selected?.version !== args.version)
              throw new PromptError(
                "PROMPT_PIN_MISMATCH",
                `Source returned a different version of ${ref.id}.`,
              );
          }
          if (!selected)
            throw new PromptError(
              "PROMPT_NOT_ASSIGNED",
              `No version resolved for ${ref.id}.`,
              404,
            );
          return compilePrompt(
            ref,
            selected,
            args.variables,
            {
              source: selectedSnapshot.source,
              environment: selectedSnapshot.environment,
              snapshotRevision: selectedSnapshot.revision,
            },
            selectedSnapshot.versions,
          );
        },
      };
    },
  };
}
export function studioPromptSource(options: {
  apiUrl: string;
  apiKey: string;
  /** Version tag to serve. Promotion updates live; other tags are managed manually. */
  tag?: string;
  environment?: string;
  projectId?: string;
  environmentId?: string;
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof fetch;
}): PromptSource {
  const url = new URL(options.apiUrl);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new PromptError(
      "PROMPT_SOURCE_INVALID",
      "Use an HTTP API origin without embedded credentials.",
    );
  const request = options.fetch ?? fetch;
  const publicKeyId =
    /^ktyx_(?:test|live)_([^_]+)_/.exec(options.apiKey)?.[1] ??
    crypto.randomUUID();
  return {
    identity: `${url.origin}${url.pathname}:${options.projectId ?? ""}:${publicKeyId}:${options.environmentId ?? ""}`,
    tag: PromptTagSchema.parse(options.tag ?? "live"),
    ...(options.environment ? { environment: options.environment } : {}),
    async resolve(ids, args) {
      for (let attempt = 0; ; attempt++) {
        try {
          const signal = AbortSignal.any([
            AbortSignal.timeout(options.timeoutMs ?? 5000),
            ...(args.signal ? [args.signal] : []),
          ]);
          const response = await request(
            `${options.apiUrl.replace(/\/$/, "")}/v1/prompts/resolve`,
            {
              method: "POST",
              signal,
              headers: {
                authorization: `Bearer ${options.apiKey}`,
                "content-type": "application/json",
                ...(options.projectId
                  ? { "x-kortyx-project-id": options.projectId }
                  : {}),
                ...(options.environmentId
                  ? { "x-kortyx-environment-id": options.environmentId }
                  : {}),
              },
              body: JSON.stringify({
                schemaVersion: 1,
                ids,
                tag: options.tag ?? args.tag ?? "live",
                environment: options.environment ?? args.environment,
                ...(args.versions ? { versions: args.versions } : {}),
              }),
            },
          );
          if (!response.ok)
            throw new PromptError(
              "PROMPT_SOURCE_HTTP",
              `Prompt serving failed (HTTP ${response.status}).`,
              response.status,
            );
          const reader = response.body?.getReader();
          if (!reader)
            throw new PromptError(
              "PROMPT_SNAPSHOT_INVALID",
              "Prompt serving returned an empty response.",
            );
          const decoder = new TextDecoder();
          let body = "",
            bytes = 0;
          try {
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > 20 * 1024 * 1024)
                throw new PromptError(
                  "PROMPT_SNAPSHOT_LIMIT",
                  "Prompt serving exceeded the 20 MiB response limit.",
                );
              body += decoder.decode(chunk.value, { stream: true });
            }
            body += decoder.decode();
            let value: unknown;
            try {
              value = JSON.parse(body);
            } catch {
              throw new PromptError(
                "PROMPT_SNAPSHOT_INVALID",
                "Prompt serving returned invalid JSON.",
              );
            }
            return await verifyPromptSnapshot(value);
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
        } catch (error) {
          if (
            args.signal?.aborted ||
            attempt >= (options.retries ?? 1) ||
            (error instanceof PromptError &&
              error.status < 500 &&
              error.status !== 429)
          )
            throw error;
        }
      }
    },
  };
}
export function localPromptSource(snapshot: PromptSnapshot): PromptSource {
  return {
    identity: `local:${snapshot.revision}`,
    environment: snapshot.environment,
    tag: snapshot.tag ?? "live",
    async resolve(ids, args) {
      const verified = await verifyPromptSnapshot(snapshot);
      if (args.environment !== verified.environment)
        throw new PromptError(
          "PROMPT_ENVIRONMENT_MISMATCH",
          "Local snapshot environment differs from the requested environment.",
        );
      for (const id of ids)
        if (
          !verified.versions[id] ||
          (args.versions?.[id] &&
            verified.versions[id]?.version !== args.versions[id])
        )
          throw new PromptError(
            "PROMPT_NOT_FOUND",
            `Local snapshot does not contain ${id}.`,
            404,
          );
      return { ...verified, source: "local" };
    },
  };
}
