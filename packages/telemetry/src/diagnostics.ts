import { createHash, randomUUID, scryptSync } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { isControlFlowError } from "@kortyx/core/errors";
import type { KortyxTraceErrorProjection } from "@kortyx/hooks";
import { captureDiagnosticContent } from "@kortyx/hooks/internal";
import {
  DIAGNOSTIC_LIMITS,
  DiagnosticContentSchema,
  DiagnosticCorrelationSchema,
  type DiagnosticManifest,
  DiagnosticManifestSchema,
  summarizeDiagnostic,
} from "@kortyx/telemetry-contracts";
import type { CreateKortyxTelemetryAdapterOptions } from "./types";

export type DiagnosticDeliveryState =
  | "pending"
  | "available"
  | "rejected"
  | "dropped"
  | "spool_failed";
export type DiagnosticCaptureContext = {
  correlation?: DiagnosticManifest["correlation"] | undefined;
  handled: boolean;
  severity: "warning" | "error";
  mechanism: DiagnosticManifest["mechanism"];
  project?: KortyxTraceErrorProjection | undefined;
};
type Entry = { manifest: DiagnosticManifest; content: string };

/** Independent diagnostic transport. It never changes application execution. */
export function createDiagnosticDelivery(
  options: CreateKortyxTelemetryAdapterOptions,
) {
  const enabled = options.diagnostics?.enabled === true;
  const queue = new Map<string, Entry>();
  const states = new Map<string, DiagnosticDeliveryState>();
  type CaptureResult = {
    diagnosticId?: string;
    diagnosticCapture: string;
    diagnosticDelivery?: DiagnosticDeliveryState | undefined;
    details: Record<string, unknown> | null;
  };
  const captured = new WeakMap<object, Map<string, CaptureResult>>();
  let queuedBytes = 0;
  let dropped = 0;
  let retryAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  const writes = new Set<Promise<void>>();
  const spool = options.diagnostics?.spoolDirectory
    ? join(
        options.diagnostics.spoolDirectory,
        // A stable credential-scoped namespace without storing the API key or
        // a fast credential hash on disk. Only derived when spooling is enabled.
        scryptSync(
          options.apiKey,
          JSON.stringify([options.endpoint, options.environment]),
          24,
        ).toString("hex"),
      )
    : undefined;
  const state = (id: string, value: DiagnosticDeliveryState) => {
    states.set(id, value);
    if (states.size > 1000) states.delete(states.keys().next().value as string);
  };
  const maxBytes = options.diagnostics?.maxQueueBytes ?? 16 * 1024 * 1024;
  const persist = async (entry: Entry) => {
    if (!spool) return;
    await mkdir(spool, { recursive: true, mode: 0o700 });
    const target = join(spool, `${entry.manifest.diagnosticId}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(entry), { mode: 0o600 });
    await rename(temporary, target);
  };
  const schedule = () => {
    if (!enabled || timer || inFlight || !queue.size) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, options.flushIntervalMs ?? 250);
    timer.unref?.();
  };
  const restored = (async () => {
    if (!enabled || !spool) return;
    try {
      await mkdir(spool, { recursive: true, mode: 0o700 });
      for (const filename of (await readdir(spool)).filter((name) =>
        /^[a-f0-9-]{36}\.json$/.test(name),
      )) {
        try {
          if (
            (await stat(join(spool, filename))).size >
            DIAGNOSTIC_LIMITS.bytes + 64 * 1024
          )
            throw new Error("Spool file exceeds budget");
          const value = JSON.parse(
            await readFile(join(spool, filename), "utf8"),
          ) as Entry;
          const manifest = DiagnosticManifestSchema.parse(value.manifest);
          const bytes = Buffer.byteLength(value.content);
          if (
            bytes !== manifest.byteLength ||
            createHash("sha256").update(value.content).digest("hex") !==
              manifest.checksum
          )
            throw new Error("Invalid spool content");
          DiagnosticContentSchema.parse(JSON.parse(value.content));
          if (queuedBytes + bytes > maxBytes) {
            state(manifest.diagnosticId, "dropped");
            dropped++;
            await unlink(join(spool, filename));
            continue;
          }
          if (!queue.has(manifest.diagnosticId)) {
            queue.set(manifest.diagnosticId, {
              manifest,
              content: value.content,
            });
            queuedBytes += bytes;
            state(manifest.diagnosticId, "pending");
          }
        } catch {
          dropped++;
          await unlink(join(spool, filename)).catch(() => undefined);
        }
      }
      schedule();
    } catch {
      dropped++;
    }
  })();
  const send = async (path: string, body: unknown) => {
    const response = await (options.fetch ?? globalThis.fetch)(
      `${options.endpoint.replace(/\/$/, "")}/v1/telemetry/diagnostics${path}?env=${encodeURIComponent(options.environment)}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      const error = new Error("Diagnostic delivery failed.") as Error & {
        status: number;
      };
      error.status = response.status;
      if (response.status === 429) {
        const hint = response.headers.get("retry-after");
        const seconds = Number(hint);
        const delay =
          hint && Number.isFinite(seconds)
            ? seconds * 1000
            : hint
              ? Date.parse(hint) - Date.now()
              : 5000;
        retryAt =
          Date.now() +
          Math.min(
            60_000,
            Math.max(5000, Number.isFinite(delay) ? delay : 5000),
          );
      }
      throw error;
    }
    return response;
  };
  const flush = async () => {
    await restored;
    await Promise.all([...writes]);
    if (inFlight) {
      await inFlight;
      return;
    }
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    const work = async () => {
      if (Date.now() < retryAt) return;
      for (const [id, entry] of [...queue]) {
        try {
          await send("", entry.manifest);
          const bytes = Buffer.from(entry.content);
          for (let index = 0; index < entry.manifest.partCount; index++)
            await send(`/${id}/parts`, {
              index,
              data: bytes
                .subarray(
                  index * DIAGNOSTIC_LIMITS.partBytes,
                  (index + 1) * DIAGNOSTIC_LIMITS.partBytes,
                )
                .toString("base64"),
            });
          const completed = await send(`/${id}/complete`, {});
          const acknowledgement = (await completed.json()) as {
            state?: string;
          };
          if (acknowledgement.state !== "available") {
            const error = new Error(
              "Diagnostic integrity verification failed.",
            ) as Error & { status: number };
            error.status = 422;
            throw error;
          }
          state(id, "available");
          queue.delete(id);
          queuedBytes -= entry.manifest.byteLength;
          if (spool)
            await unlink(join(spool, `${id}.json`)).catch(() => undefined);
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status && status < 500 && status !== 429) {
            state(id, "rejected");
            queue.delete(id);
            queuedBytes -= entry.manifest.byteLength;
            dropped++;
            if (spool)
              await unlink(join(spool, `${id}.json`)).catch(() => undefined);
          }
          // Transient failures retain redacted bytes for a later flush or restart.
          if (status === 429) break;
        }
      }
    };
    inFlight = work();
    try {
      await inFlight;
    } finally {
      inFlight = undefined;
    }
    if (queue.size) {
      timer = setTimeout(
        () => {
          timer = undefined;
          void flush();
        },
        Math.max(5000, retryAt - Date.now()),
      );
      timer.unref?.();
    }
  };
  const capture = (error: unknown, context: DiagnosticCaptureContext) => {
    if (!enabled || isControlFlowError(error)) return undefined;
    const scope = JSON.stringify([
      context.correlation?.runId,
      context.correlation?.invocationId,
      context.correlation?.branchId,
      context.correlation?.attemptId,
    ]);
    const object =
      error && typeof error === "object" ? (error as object) : undefined;
    const existing = object ? captured.get(object)?.get(scope) : undefined;
    if (existing)
      return {
        ...existing,
        diagnosticDelivery: existing.diagnosticId
          ? (states.get(existing.diagnosticId) ?? "pending")
          : undefined,
      };
    const content = captureDiagnosticContent(
      error,
      context.project ?? options.error,
    );
    if (!content) return { diagnosticCapture: "suppressed", details: null };
    const serialized = JSON.stringify(content);
    const diagnosticId = randomUUID();
    const manifest = DiagnosticManifestSchema.parse({
      schemaVersion: 1,
      diagnosticId,
      occurrenceId: randomUUID(),
      occurredAt: new Date().toISOString(),
      environment: options.environment,
      service: options.service,
      correlation: DiagnosticCorrelationSchema.parse(
        Object.fromEntries(
          Object.entries(context.correlation ?? {}).filter(
            ([key]) => key !== "topologyHash",
          ),
        ),
      ),
      handled: context.handled,
      severity: context.severity,
      mechanism: context.mechanism,
      summary: {
        type: String(content.data.type ?? "Error").slice(0, 256),
        message: summarizeDiagnostic(content.data).message,
      },
      captureStatus: content.capture.status,
      byteLength: Buffer.byteLength(serialized),
      checksum: createHash("sha256").update(serialized).digest("hex"),
      partCount: Math.ceil(
        Buffer.byteLength(serialized) / DIAGNOSTIC_LIMITS.partBytes,
      ),
    });
    if (queuedBytes + manifest.byteLength > maxBytes) {
      state(diagnosticId, "dropped");
      dropped++;
    } else {
      const entry = { manifest, content: serialized };
      queue.set(diagnosticId, entry);
      queuedBytes += manifest.byteLength;
      state(diagnosticId, "pending");
      const writing = persist(entry)
        .catch(() => {
          state(diagnosticId, "spool_failed");
        })
        .finally(() => {
          writes.delete(writing);
        });
      writes.add(writing);
      schedule();
    }
    const result = {
      diagnosticId,
      diagnosticCapture: content.capture.status,
      diagnosticDelivery: states.get(diagnosticId),
      details: summarizeDiagnostic(content.data),
    };
    if (object) {
      const byScope = captured.get(object) ?? new Map<string, CaptureResult>();
      byScope.set(scope, result);
      captured.set(object, byScope);
    }
    return result;
  };
  const flushWithDeadline = async (timeoutMs = 5000) => {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    await Promise.race([
      flush(),
      new Promise<void>((resolve) => {
        deadline = setTimeout(
          () => {
            timedOut = true;
            resolve();
          },
          Math.max(0, timeoutMs),
        );
      }),
    ]);
    if (deadline) clearTimeout(deadline);
    return {
      timedOut,
      pending: queue.size,
      pendingBytes: queuedBytes,
      dropped,
      states: Object.fromEntries(states),
    };
  };
  return {
    capture,
    flush,
    flushWithDeadline,
    getState: (id: string) => states.get(id),
    getDroppedCount: () => dropped,
  };
}
