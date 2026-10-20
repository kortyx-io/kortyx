import type { TelemetryDb } from "@kortyx/telemetry-db";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EvalWorkerRetirementError,
  reportWorkerRetirementFailure,
} from "../src/evals/worker-retirement";
import { recordErrorDiagnostic } from "../src/record-error-diagnostic";

vi.mock("../src/record-error-diagnostic", () => ({
  recordErrorDiagnostic: vi.fn(),
}));
const a = {
  id: "target",
  name: "test",
  organizationId: "org-a",
  projectId: "project-a",
  environment: "development",
  url: "https://example.test/evals",
  serviceKey: "private-key",
  allowInsecureHttp: false,
};
const b = { ...a, organizationId: "org-b", projectId: "project-b" };
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(recordErrorDiagnostic).mockReset();
});
describe("private worker retirement diagnostics", () => {
  it("preserves the cause in the right project and logs only safe correlation", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(recordErrorDiagnostic).mockResolvedValue("diagnostic-id");
    const cause = Object.assign(new Error("private SQL and parameters"), {
      code: "08006",
    });
    const failure = new EvalWorkerRetirementError(
      "completion",
      "owner",
      cause,
      "suite-run",
      a,
    );
    expect(failure.scope).not.toHaveProperty("serviceKey");
    await reportWorkerRetirementFailure({} as TelemetryDb, [a, b], failure);
    expect(recordErrorDiagnostic).toHaveBeenCalledExactlyOnceWith(
      {} as TelemetryDb,
      {
        organizationId: a.organizationId,
        projectId: a.projectId,
        environment: a.environment,
      },
      failure,
      {
        service: "kortyx-eval-worker",
        correlation: { phase: "completion", suiteRunId: "suite-run" },
      },
    );
    const logged = String(log.mock.calls[0]?.[0]);
    expect(logged).not.toContain("private SQL");
    expect(logged).not.toContain("private-key");
    expect(JSON.parse(logged)).toMatchObject({
      phase: "completion",
      owner: "owner",
      diagnosticIds: ["diagnostic-id"],
      failureCode: "08006",
    });
    expect(failure.cause).toBe(cause);
  });
  it("does not broadcast an unattributed global claim error across tenants", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await reportWorkerRetirementFailure(
      {} as TelemetryDb,
      [a, b],
      new EvalWorkerRetirementError(
        "claim",
        "owner",
        new Error("private other project"),
      ),
    );
    expect(recordErrorDiagnostic).not.toHaveBeenCalled();
  });
  it("retains a safe cause code when diagnostic storage is unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(recordErrorDiagnostic).mockResolvedValue(undefined);
    const cause = Object.assign(
      new Error("postgres://secret@private/database"),
      { code: "ECONNREFUSED" },
    );
    await reportWorkerRetirementFailure(
      {} as TelemetryDb,
      [a],
      new EvalWorkerRetirementError(
        "verification",
        "owner",
        new AggregateError([cause], "private details"),
      ),
    );
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      failureCode: "ECONNREFUSED",
      diagnosticIds: [],
    });
    expect(String(log.mock.calls[0]?.[0])).not.toContain("secret");
  });
});
