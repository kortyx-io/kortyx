import { AsyncLocalStorage } from "node:async_hooks";
import type { TelemetryDb } from "./client";

const scopes = new AsyncLocalStorage<{ db: TelemetryDb }>();

/** Trusted server composition only. Run inside an independently authorized DB
 * transaction. This changes label validation, never organization/project access.
 * OSS defaults still validate operator-configured environments.
 */
export function withProjectTelemetryScope<T>(
  db: TelemetryDb,
  work: () => Promise<T>,
): Promise<T> {
  return scopes.run({ db }, work);
}

export function hasProjectTelemetryScope(db: TelemetryDb): boolean {
  return scopes.getStore()?.db === db;
}
