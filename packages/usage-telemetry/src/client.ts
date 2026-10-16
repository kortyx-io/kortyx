import {
  type Outcome,
  outcomes,
  publicCatalog,
  type UsageCatalog,
} from "./catalog";
import {
  classifyUsageError,
  classifyUsageHttpStatus,
  usageErrorProperty as property,
} from "./failure";
import { usageMeasurement } from "./measurement";

export type UsageProperties = Readonly<Record<string, unknown>>;
export interface UsageContext {
  product: string;
  component: string;
  version: string;
  environment?: "production" | "staging";
  identityScope?: "installation" | "browser" | "process";
  runtimeMode?: "development" | "production" | "ci" | "unknown";
  trafficSource?: "internal" | "synthetic" | "external" | "unknown";
}
export interface UsageRecord {
  schema_version: 1;
  event_id: string;
  timestamp: string;
  event: "usage.operation" | "usage.feature";
  product: string;
  component: string;
  version: string;
  analytics_environment: "production" | "staging";
  runtime_mode: string;
  identity_scope: "installation" | "browser" | "process";
  operation: string;
  outcome: Outcome;
  properties: Record<string, string | boolean>;
  count: number;
  duration_total_ms: number;
  duration_buckets: number[];
  /** Loss since the last successfully delivered snapshot; attached once per batch. */
  delivery_health?: { dropped_observations: number; failed_batches: number };
}
export type UsageTransport = (
  records: readonly UsageRecord[],
  identity: string,
) => Promise<void>;
export interface UsageOptions {
  context: UsageContext;
  catalog?: UsageCatalog;
  enabled?: () => boolean;
  debug?: () => boolean;
  inspect?: (records: readonly UsageRecord[]) => void;
  identity: () =>
    | string
    | { id: string; scope: "installation" | "browser" | "process" }
    | Promise<
        string | { id: string; scope: "installation" | "browser" | "process" }
      >;
  transport: UsageTransport;
  now?: () => number;
  schedule?: (callback: () => void, ms: number) => { cancel(): void };
  flushIntervalMs?: number;
  maxGroups?: number;
  maxRecordsPerHour?: number;
}
export interface UsageOperation {
  end(outcome?: Outcome, properties?: UsageProperties): void;
  fail(error: unknown, properties?: UsageProperties): void;
}
export interface UsageTelemetry {
  start(operation: string, properties?: UsageProperties): UsageOperation;
  feature(operation: string, properties?: UsageProperties): void;
  measure<T>(
    operation: string,
    callback: () => T | Promise<T>,
    properties?: UsageProperties,
    outcome?: (value: T) => Outcome,
  ): Promise<T>;
  flush(): Promise<void>;
  dispose(): void;
  stats(): { pending: number; dropped: number; delivered: number };
}

export { classifyUsageError } from "./failure";

export function sanitizeProperties(
  input: UsageProperties,
  catalog = publicCatalog,
): Record<string, string | boolean> {
  const safe: Record<string, string | boolean> = {};
  for (const [key, rule] of Object.entries(catalog.properties)) {
    const value = property(input, key);
    if (value === undefined) continue;
    if (rule === "boolean") {
      if (typeof value === "boolean") safe[key] = value;
    } else if (typeof value === "string")
      safe[key] = rule.includes(value) ? value : "other";
  }
  for (const key of ["error_code", "cause_code"]) {
    const code = property(input, key);
    if (typeof code === "string")
      safe[key] = catalog.errorCodes.includes(code) ? code : "other";
  }
  return safe;
}

const durationBounds = [10, 100, 1000, 10000, 60000];
const noopOperation: UsageOperation = { end() {}, fail() {} };
function schedule(callback: () => void, ms: number) {
  const timer = setTimeout(callback, ms);
  (timer as unknown as { unref?: () => void }).unref?.();
  return { cancel: () => clearTimeout(timer) };
}
export function createUsageTelemetry(options: UsageOptions): UsageTelemetry {
  const catalog = options.catalog ?? publicCatalog;
  const now = options.now ?? Date.now;
  const pending = new Map<string, UsageRecord>();
  let timer: { cancel(): void } | undefined;
  let flight: Promise<void> | undefined;
  let disposed = false;
  let dropped = 0;
  let delivered = 0;
  let lostObservations = 0;
  let failedBatches = 0;
  let reportedLoss = 0;
  let reportedFailures = 0;
  const lose = (count: number) => {
    lostObservations = Math.min(
      Number.MAX_SAFE_INTEGER,
      lostObservations + count,
    );
  };
  let hour = Math.floor(now() / 3_600_000);
  let sent = 0;
  const active = () => {
    try {
      return !disposed && (options.enabled?.() ?? true);
    } catch {
      return false;
    }
  };
  const clear = () => {
    pending.clear();
    try {
      timer?.cancel();
    } catch {}
    timer = undefined;
  };
  const configured =
    catalog.products.includes(options.context.product) &&
    /^[a-z][a-z0-9_]{0,31}$/.test(options.context.component) &&
    /^(?:\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?|development|unknown)$/.test(
      options.context.version,
    ) &&
    options.context.version.length <= 64;

  const flush = async (): Promise<void> => {
    if (flight) return flight;
    if (!active() || !configured) {
      clear();
      return;
    }
    try {
      timer?.cancel();
    } catch {}
    timer = undefined;
    const records = [...pending.values()];
    pending.clear();
    if (!records.length) return;
    let attempted = records.length;
    let attemptedObservations = records.reduce(
      (total, record) => total + record.count,
      0,
    );
    flight = (async () => {
      try {
        if (options.debug?.()) {
          options.inspect?.(records);
          return;
        }
        const currentHour = Math.floor(now() / 3_600_000);
        if (hour !== currentHour) {
          hour = currentHour;
          sent = 0;
        }
        const allowance = Math.max(
          0,
          (options.maxRecordsPerHour ?? 120) - sent,
        );
        const batch = records.slice(0, allowance);
        dropped += records.length - batch.length;
        lose(
          records
            .slice(allowance)
            .reduce((total, record) => total + record.count, 0),
        );
        attempted = batch.length;
        attemptedObservations = batch.reduce(
          (total, record) => total + record.count,
          0,
        );
        if (!batch.length || !active()) return;
        const identified = await options.identity();
        const identity =
          typeof identified === "string" ? identified : identified.id;
        if (typeof identified !== "string")
          for (const record of batch) record.identity_scope = identified.scope;
        if (!active() || options.debug?.()) return;
        if (
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
            identity,
          )
        ) {
          dropped += batch.length;
          lose(attemptedObservations);
          return;
        }
        sent += batch.length;
        const lossSnapshot = lostObservations;
        const failureSnapshot = failedBatches;
        if (
          batch[0] &&
          (lossSnapshot > reportedLoss || failureSnapshot > reportedFailures)
        )
          batch[0].delivery_health = {
            dropped_observations: lossSnapshot - reportedLoss,
            failed_batches: failureSnapshot - reportedFailures,
          };
        await options.transport(batch, identity);
        reportedLoss = lossSnapshot;
        reportedFailures = failureSnapshot;
        delivered += batch.length;
      } catch {
        dropped += attempted;
        lose(attemptedObservations);
        failedBatches = Math.min(Number.MAX_SAFE_INTEGER, failedBatches + 1);
      }
    })().finally(() => {
      flight = undefined;
      try {
        if (pending.size && active() && !timer)
          timer = (options.schedule ?? schedule)(
            () => void flush(),
            options.flushIntervalMs ?? 60_000,
          );
      } catch {
        clear();
      }
    });
    return flight;
  };

  const record = (
    event: UsageRecord["event"],
    operation: string,
    outcome: Outcome,
    duration: number,
    input: UsageProperties,
  ) => {
    try {
      if (!active()) {
        clear();
        return;
      }
      if (
        !configured ||
        !catalog.operations.includes(operation) ||
        !outcomes.includes(outcome)
      )
        return;
      const failed = outcome === "failed";
      const status = property(input, "http_status");
      const http =
        typeof status === "string" && /^\d{3}$/.test(status)
          ? classifyUsageHttpStatus(Number(status)).properties
          : {};
      const properties = sanitizeProperties(
        {
          measurement_version: "2",
          measurement_kind: usageMeasurement(event, operation, input),
          ...(failed
            ? {
                error_code: "UNCLASSIFIED_FAILURE",
                error_category: "unknown",
                ...http,
              }
            : {}),
          ...sanitizeProperties(input, catalog),
          traffic_source: options.context.trafficSource ?? "unknown",
        },
        catalog,
      );
      const key = JSON.stringify([event, operation, outcome, properties]);
      let existing = pending.get(key);
      if (!existing) {
        if (pending.size >= (options.maxGroups ?? 64)) {
          dropped++;
          lose(1);
          return;
        }
        existing = {
          schema_version: 1,
          event_id: crypto.randomUUID(),
          timestamp: new Date(now()).toISOString(),
          event,
          product: options.context.product,
          component: options.context.component,
          version: options.context.version,
          analytics_environment: options.context.environment ?? "production",
          runtime_mode: ["development", "production", "ci"].includes(
            options.context.runtimeMode ?? "",
          )
            ? (options.context.runtimeMode ?? "unknown")
            : "unknown",
          identity_scope: options.context.identityScope ?? "installation",
          operation,
          outcome,
          properties,
          count: 0,
          duration_total_ms: 0,
          duration_buckets: [0, 0, 0, 0, 0, 0],
        };
        pending.set(key, existing);
      }
      const elapsed = Math.max(
        0,
        Math.min(86_400_000, Number.isFinite(duration) ? duration : 0),
      );
      existing.count = Math.min(Number.MAX_SAFE_INTEGER, existing.count + 1);
      existing.duration_total_ms = Math.min(
        Number.MAX_SAFE_INTEGER,
        existing.duration_total_ms + elapsed,
      );
      const index = durationBounds.findIndex((bound) => elapsed <= bound);
      const bucket = index === -1 ? durationBounds.length : index;
      existing.duration_buckets[bucket] =
        (existing.duration_buckets[bucket] ?? 0) + 1;
      if (!timer)
        timer = (options.schedule ?? schedule)(
          () => void flush(),
          options.flushIntervalMs ?? 60_000,
        );
    } catch {
      /* Usage collection cannot participate in product execution. */
    }
  };
  const start = (
    operation: string,
    properties: UsageProperties = {},
  ): UsageOperation => {
    if (!active()) {
      clear();
      return noopOperation;
    }
    try {
      const initial = sanitizeProperties(properties, catalog);
      const began = now();
      let ended = false;
      return {
        end(outcome = "success", extra = {}) {
          if (ended) return;
          ended = true;
          try {
            // Classify before enum bucketing so uncommon statuses keep their class.
            const status = property(extra, "http_status");
            const http =
              outcome === "failed" &&
              typeof status === "string" &&
              /^\d{3}$/.test(status)
                ? classifyUsageHttpStatus(Number(status)).properties
                : {};
            record("usage.operation", operation, outcome, now() - began, {
              ...initial,
              ...http,
              ...sanitizeProperties(extra, catalog),
            });
          } catch {}
        },
        fail(error, extra = {}) {
          if (ended) return;
          try {
            const failure = classifyUsageError(error, catalog);
            this.end(failure.outcome, {
              ...sanitizeProperties(extra, catalog),
              ...failure.properties,
            });
          } catch {}
        },
      };
    } catch {
      return noopOperation;
    }
  };
  return {
    start,
    feature(operation, properties = {}) {
      record("usage.feature", operation, "success", 0, properties);
    },
    async measure(operation, callback, properties = {}, outcome) {
      const operationScope = start(operation, properties);
      try {
        const result = await callback();
        let status: Outcome = "success";
        try {
          status = outcome?.(result) ?? status;
        } catch {}
        operationScope.end(status);
        return result;
      } catch (error) {
        operationScope.fail(error);
        throw error;
      }
    },
    flush,
    dispose() {
      disposed = true;
      clear();
    },
    stats: () => ({ pending: pending.size, dropped, delivered }),
  };
}
