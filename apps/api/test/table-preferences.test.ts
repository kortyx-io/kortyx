import { emptyTablePreferences } from "@kortyx/telemetry-contracts";
import {
  readTablePreferences,
  TablePreferenceConflict,
  type TelemetryDb,
  writeTablePreferences,
} from "@kortyx/telemetry-db";
import { beforeEach, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type { ApiPrincipal } from "../src/auth/contracts";
import { tablePreferenceScope } from "../src/preferences/owner";

vi.mock("@kortyx/telemetry-db", async (original) => ({
  ...(await original<typeof import("@kortyx/telemetry-db")>()),
  readTablePreferences: vi.fn(),
  writeTablePreferences: vi.fn(),
}));
const human: ApiPrincipal = {
  kind: "human",
  userId: "user-a",
  organizationId: "org-a",
  projectId: "project-a",
  permissions: ["studio:read"],
};
const operator: ApiPrincipal = {
  kind: "api-key",
  keyId: "key-a",
  organizationId: "org-a",
  projectId: "project-a",
  mode: "test",
  scopes: ["studio:read", "studio:write"],
};
function fixture(
  principal = human,
  deployment: "cloud" | "self-hosted" = "cloud",
  write = true,
) {
  const db = {} as TelemetryDb;
  const work = vi.fn(async (_principal, operation) => operation(db));
  const app = createApiApp({
    db,
    apiKeyPepper: "test",
    deployment,
    authentication: { authenticate: async () => principal },
    authorization: {
      allows: async (_, action) => action === "studio:read" || write,
    },
    tenantDatabase: { withPrincipal: work },
  });
  return { app, work, db };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readTablePreferences).mockResolvedValue(emptyTablePreferences());
  vi.mocked(writeTablePreferences).mockResolvedValue({
    ...emptyTablePreferences(),
    revision: 1,
  });
});
const operation = {
  kind: "defaults",
  patch: { query: { sort: "", dir: "desc", pageSize: 20 } },
};
const post = (scopeKey: string, extra = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ scopeKey, expectedRevision: 0, operation, ...extra }),
});
it("derives personal ownership from the verified principal and forwards it to tenant transactions", async () => {
  const { app, db, work } = fixture();
  const response = await app.request(
    "/v1/studio/table-preferences/prompts",
    post(tablePreferenceScope(human, "cloud")?.cacheKey ?? ""),
  );
  expect(response.status).toBe(200);
  expect(work.mock.calls[0]?.[0]).toEqual(human);
  expect(writeTablePreferences).toHaveBeenCalledWith(
    db,
    {
      organizationId: "org-a",
      projectId: "project-a",
      ownerKind: "user",
      userId: "user-a",
    },
    "prompts",
    expect.anything(),
  );
});
it("rejects supplied owners, unknown tables, and stale account scopes before DB access", async () => {
  const { app, work } = fixture();
  expect(
    (
      await app.request(
        "/v1/studio/table-preferences/prompts",
        post("a".repeat(64), { userId: "other" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await app.request(
        "/v1/studio/table-preferences/prompts",
        post("a".repeat(64)),
      )
    ).status,
  ).toBe(403);
  expect(
    (await app.request("/v1/studio/table-preferences/arbitrary")).status,
  ).toBe(400);
  expect(work).not.toHaveBeenCalled();
});
it("never falls back to project ownership for a cloud API key", async () => {
  const { app, work } = fixture(operator);
  expect(
    (await app.request("/v1/studio/table-preferences/prompts")).status,
  ).toBe(403);
  expect(work).not.toHaveBeenCalled();
});
it("uses project ownership for self-hosting, independent of key rotation", async () => {
  expect(tablePreferenceScope(operator, "self-hosted")).toEqual(
    tablePreferenceScope({ ...operator, keyId: "rotated" }, "self-hosted"),
  );
  const { app, db } = fixture(operator, "self-hosted");
  expect(
    (await app.request("/v1/studio/table-preferences/prompts")).status,
  ).toBe(200);
  expect(readTablePreferences).toHaveBeenCalledWith(
    db,
    {
      organizationId: "org-a",
      projectId: "project-a",
      ownerKind: "project",
      userId: null,
    },
    "prompts",
  );
});
it("requires project write permission for changes to shared operator preferences", async () => {
  const { app, work } = fixture(operator, "self-hosted", false);
  expect(
    (
      await app.request(
        "/v1/studio/table-preferences/prompts",
        post(tablePreferenceScope(operator, "self-hosted")?.cacheKey ?? ""),
      )
    ).status,
  ).toBe(403);
  expect(work).not.toHaveBeenCalled();
});
it("returns a conflict rather than overwriting a newer revision", async () => {
  vi.mocked(writeTablePreferences).mockRejectedValueOnce(
    new TablePreferenceConflict(),
  );
  const { app } = fixture();
  expect(
    (
      await app.request(
        "/v1/studio/table-preferences/prompts",
        post(tablePreferenceScope(human, "cloud")?.cacheKey ?? ""),
      )
    ).status,
  ).toBe(409);
});
it("separates cache namespaces by user and project", () => {
  const scope = tablePreferenceScope(human, "cloud");
  expect(scope).not.toEqual(
    tablePreferenceScope({ ...human, userId: "other" }, "cloud"),
  );
  expect(scope).not.toEqual(
    tablePreferenceScope({ ...human, projectId: "other" }, "cloud"),
  );
});

it.each([
  "evaluation-comparison",
  "eval-suite-conversations",
])("reads and saves preferences for the eval table %s", async (tableId) => {
  const { app, db } = fixture();
  const path = `/v1/studio/table-preferences/${tableId}`;
  expect((await app.request(path)).status).toBe(200);
  expect(readTablePreferences).toHaveBeenCalledWith(
    db,
    expect.anything(),
    tableId,
  );
  expect(
    (
      await app.request(
        path,
        post(tablePreferenceScope(human, "cloud")?.cacheKey ?? ""),
      )
    ).status,
  ).toBe(200);
  expect(writeTablePreferences).toHaveBeenCalledWith(
    db,
    expect.anything(),
    tableId,
    expect.anything(),
  );
});
