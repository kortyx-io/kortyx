import type { TelemetryDb } from "@kortyx/telemetry-db";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

function reader(execute = false, environment?: string) {
  const work = vi.fn();
  const app = createApiApp({
    db: {} as TelemetryDb,
    evalTargets: [
      {
        id: "app",
        name: "App",
        organizationId: "org",
        projectId: "project",
        environment: "staging",
        url: "https://example.test/evals",
        serviceKey: "fixture-only-key-at-least-32-characters",
        allowInsecureHttp: false,
      },
    ],
    apiKeyPepper: "test",
    authentication: {
      authenticate: async () => ({
        kind: "api-key",
        keyId: "reader",
        mode: "test",
        organizationId: "org",
        projectId: "project",
        scopes: ["studio:read"],
        ...(environment ? { environment } : {}),
      }),
    },
    authorization: {
      allows: async (_principal, action) => execute || action === "studio:read",
    },
    tenantDatabase: { withPrincipal: work },
  });
  return { app, work };
}
describe("grouped evaluation authorization", () => {
  it.each([
    "evaluations",
    "evaluations/11111111-1111-4111-8111-111111111111/cancel",
  ])("requires execution permission before %s touches the database", async (path) => {
    const { app, work } = reader();
    expect(
      (
        await app.request(`/v1/studio/evals/${path}`, {
          method: "POST",
          body: "{}",
          headers: { "content-type": "application/json" },
        })
      ).status,
    ).toBe(403);
    expect(work).not.toHaveBeenCalled();
  });
  it("rejects a target outside the credential's verified environment before touching tenant data", async () => {
    const { app, work } = reader(true, "development");
    const response = await app.request("/v1/studio/evals/evaluations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetId: "app",
        selection: "all",
        suites: [{ suiteId: "smoke", suiteRevision: "a".repeat(64) }],
      }),
    });
    expect(response.status).toBe(403);
    expect(work).not.toHaveBeenCalled();
  });
  it("rejects invalid result IDs without querying tenant data", async () => {
    const { app, work } = reader();
    expect(
      (await app.request("/v1/studio/evals/evaluations/not-a-uuid/results"))
        .status,
    ).toBe(400);
    expect(work).not.toHaveBeenCalled();
  });
});
