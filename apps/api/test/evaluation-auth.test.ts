import type { TelemetryDb } from "@kortyx/telemetry-db";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

function reader() {
  const work = vi.fn();
  const app = createApiApp({
    db: {} as TelemetryDb,
    apiKeyPepper: "test",
    authentication: {
      authenticate: async () => ({
        kind: "api-key",
        keyId: "reader",
        mode: "test",
        organizationId: "org",
        projectId: "project",
        scopes: ["studio:read"],
      }),
    },
    authorization: {
      allows: async (_principal, action) => action === "studio:read",
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
  it("rejects invalid result IDs without querying tenant data", async () => {
    const { app, work } = reader();
    expect(
      (await app.request("/v1/studio/evals/evaluations/not-a-uuid/results"))
        .status,
    ).toBe(400);
    expect(work).not.toHaveBeenCalled();
  });
});
