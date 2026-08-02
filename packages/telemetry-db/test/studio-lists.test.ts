import type {
  StudioInterrupt,
  StudioRun,
  StudioSession,
} from "@kortyx/telemetry-contracts";
import { describe, expect, it } from "vitest";
import {
  normalizeStudioInterruptProjection,
  normalizeStudioRunProjection,
  normalizeStudioSessionProjection,
} from "../src/repositories/studio-lists";

const legacyInterrupt = (
  overrides: Partial<StudioInterrupt> = {},
): StudioInterrupt =>
  ({
    id: "human-1",
    status: "resolved",
    type: "choice",
    createdAt: "2026-01-01T00:00:00.000Z",
    resolvedAt: "2026-01-01T00:00:01.000Z",
    expiresAt: null,
    question: null,
    contentCaptured: false,
    optionCount: 0,
    workflowId: "workflow",
    nodeId: "node",
    sessionId: "session",
    userId: null,
    tenantId: null,
    response: null,
    resumeOutcome: "resumed",
    resumeError: null,
    runId: "run",
    resumeToken: null,
    resolvedBy: null,
    environment: "test",
    ...overrides,
  }) as StudioInterrupt;

describe("normalizeStudioInterruptProjection", () => {
  it("keeps legacy zero-option choices unknown instead of claiming an empty list", () => {
    expect(normalizeStudioInterruptProjection(legacyInterrupt())).toMatchObject(
      {
        interactionMode: "unknown",
        schemaId: null,
        schemaVersion: null,
        options: null,
        responseCaptured: false,
      },
    );
  });

  it("infers legacy static choices, free-form input, and captured responses", () => {
    expect(
      normalizeStudioInterruptProjection(
        legacyInterrupt({
          optionCount: 2,
          response: "approve",
        }),
      ),
    ).toMatchObject({
      interactionMode: "static-options",
      responseCaptured: true,
    });
    expect(
      normalizeStudioInterruptProjection(
        legacyInterrupt({ type: "text", optionCount: 0 }),
      ),
    ).toMatchObject({
      interactionMode: "freeform",
    });
  });

  it("expires stale pending projections at read time", () => {
    expect(
      normalizeStudioInterruptProjection(
        legacyInterrupt({
          status: "pending",
          resolvedAt: null,
          expiresAt: "2026-07-26T12:15:00.000Z",
          resumeOutcome: null,
        }),
        Date.parse("2026-07-26T12:15:00.000Z"),
      ),
    ).toMatchObject({
      status: "expired",
      resumeOutcome: "expired before resume",
    });
  });
});

describe("interrupted projection normalization", () => {
  const expiry = "2026-07-26T12:15:00.000Z";
  const now = Date.parse(expiry);

  it("derives expired run presentation without changing its execution status", () => {
    const run = {
      id: "run-1",
      status: "interrupted",
      interruptNodeId: "collectAgent",
      interruptId: "human-1",
      interruptStatus: "pending",
      interruptExpiresAt: expiry,
      result: "Waiting for input at collectAgent",
    } as StudioRun;

    expect(normalizeStudioRunProjection(run, now)).toMatchObject({
      status: "interrupted",
      interruptStatus: "expired",
      result: "Input expired at collectAgent",
    });
  });

  it("derives expired session presentation without changing its execution status", () => {
    const session = {
      id: "session-1",
      status: "interrupted",
      interruptStatus: "pending",
      interruptExpiresAt: expiry,
      latestResult: "Waiting for input at collectAgent",
    } as StudioSession;

    expect(normalizeStudioSessionProjection(session, now)).toMatchObject({
      status: "interrupted",
      interruptStatus: "expired",
      latestResult: "Input expired",
    });
  });

  it("normalizes PostgreSQL timestamp text before returning list contracts", () => {
    const postgresExpiry = "2026-07-26 12:15:00+00";
    const run = {
      id: "run-1",
      status: "interrupted",
      interruptStatus: "pending",
      interruptExpiresAt: postgresExpiry,
    } as StudioRun;
    const session = {
      id: "session-1",
      status: "interrupted",
      interruptStatus: "pending",
      interruptExpiresAt: postgresExpiry,
    } as StudioSession;

    expect(normalizeStudioRunProjection(run, now).interruptExpiresAt).toBe(
      expiry,
    );
    expect(
      normalizeStudioSessionProjection(session, now).interruptExpiresAt,
    ).toBe(expiry);
  });
});
