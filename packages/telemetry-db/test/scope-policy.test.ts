import { expect, it } from "vitest";
import type { TelemetryDb } from "../src/client";
import {
  hasProjectTelemetryScope,
  withProjectTelemetryScope,
} from "../src/scope-policy";

it("retains configured-environment validation by default and after failure", async () => {
  const db = {} as TelemetryDb;
  expect(hasProjectTelemetryScope(db)).toBe(false);
  await expect(
    withProjectTelemetryScope(db, async () => {
      expect(hasProjectTelemetryScope(db)).toBe(true);
      throw Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(hasProjectTelemetryScope(db)).toBe(false);
});
it("does not leak scope between concurrent requests or other transaction handles", async () => {
  const a = {} as TelemetryDb,
    b = {} as TelemetryDb;
  await Promise.all([
    withProjectTelemetryScope(a, async () => {
      await Promise.resolve();
      expect(hasProjectTelemetryScope(a)).toBe(true);
      expect(hasProjectTelemetryScope(b)).toBe(false);
    }),
    Promise.resolve().then(() =>
      expect(hasProjectTelemetryScope(a)).toBe(false),
    ),
  ]);
});
