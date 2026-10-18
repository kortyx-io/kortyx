import { createHash } from "node:crypto";
import { StudioContextResponseSchema } from "@kortyx/telemetry-contracts";
import {
  TelemetryAuthError,
  type TelemetryDb,
  TelemetryForbiddenError,
  TelemetryValidationError,
} from "@kortyx/telemetry-db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type {
  ApiAuthAdapter,
  ApiHumanPrincipal,
  ApiKeyPrincipal,
} from "../src/auth/contracts";
import type { ApiAuthorizationAdapter } from "../src/authorization/contracts";
import type { ApiTenantDatabaseAdapter } from "../src/database/contracts";
import { principalActorId } from "../src/middleware/security";
import { createInMemoryStudioChangeBus } from "../src/realtime/studio-change-bus";

const repo = vi.hoisted(() => ({
  authenticate: vi.fn(),
  context: vi.fn(),
  runs: vi.fn(),
  review: vi.fn(),
  clearReview: vi.fn(),
  environments: vi.fn(),
  workflows: vi.fn(),
}));
vi.mock("@kortyx/telemetry-db", async (original) => ({
  ...(await original<typeof import("@kortyx/telemetry-db")>()),
  authenticateTelemetryApiKey: repo.authenticate,
  getStudioProjectContext: repo.context,
  listStudioRuns: repo.runs,
  upsertRunScore: repo.review,
  clearRunScore: repo.clearReview,
  ensureProjectEnvironmentAllowed: repo.environments,
  listStudioWorkflows: repo.workflows,
}));

const root = {} as TelemetryDb;
const scoped = { marker: "tenant handle" } as unknown as TelemetryDb;
const human: ApiHumanPrincipal = {
  kind: "human",
  userId: "user-1",
  organizationId: "org-a",
  projectId: "project-a",
  permissions: ["view"],
};
const key: ApiKeyPrincipal = {
  kind: "api-key",
  keyId: "key-1",
  organizationId: "org-a",
  projectId: "project-a",
  mode: "test",
  scopes: ["studio:read", "telemetry:write"],
};
const request = (
  path: string,
  token = "alice",
  method = "GET",
  body?: unknown,
) =>
  new Request(`http://api.test${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-organization-id": "org-attacker",
      "x-project-id": "project-attacker",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const setup = (principal = human) => {
  const authentication: ApiAuthAdapter = {
    authenticate: vi.fn(async () => principal),
  };
  const authorization: ApiAuthorizationAdapter = {
    allows: vi.fn(async (_principal, action) => action === "studio:read"),
  };
  const tenantDatabase: ApiTenantDatabaseAdapter = {
    withPrincipal: vi.fn(async (_principal, work) => work(scoped)),
  };
  const app = createApiApp({
    db: root,
    apiKeyPepper: "test",
    deployment: "cloud",
    authentication,
    authorization,
    tenantDatabase,
  });
  return { app, authentication, authorization, tenantDatabase };
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.context.mockResolvedValue({
    organizationName: "A",
    projectName: "Project A",
    environments: ["test"],
  });
  repo.runs.mockResolvedValue({ items: [], totalCount: 0 });
  repo.review.mockResolvedValue({ value: "correct" });
  repo.authenticate.mockResolvedValue(key);
});

describe("API extension boundaries", () => {
  it("preserves workflow validation without swallowing policy/database failures", async () => {
    const { app } = setup();
    repo.workflows.mockRejectedValueOnce(
      new TelemetryValidationError("Invalid workflow version."),
    );
    expect((await app.request(request("/v1/studio/workflows"))).status).toBe(
      400,
    );
    repo.workflows.mockRejectedValueOnce(
      new TelemetryForbiddenError("Project denied."),
    );
    expect((await app.request(request("/v1/studio/workflows"))).status).toBe(
      403,
    );
    repo.workflows.mockRejectedValueOnce(new Error("Secret SQL details."));
    const failed = await app.request(request("/v1/studio/workflows"));
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("Secret SQL details.");
  });
  it("preserves OSS API-key authentication and granular scope checks", async () => {
    const app = createApiApp({ db: root, apiKeyPepper: "test" });
    expect((await app.request("/v1/studio/context")).status).toBe(401);
    const response = await app.request(request("/v1/studio/context", "key"));
    expect(response.status).toBe(200);
    expect(
      StudioContextResponseSchema.parse(await response.json()).apiKey,
    ).toEqual({ mode: "test", scopes: key.scopes });
    expect(repo.authenticate).toHaveBeenCalledWith(root, {
      apiKey: "key",
      pepper: "test",
    });
    expect(
      (
        await app.request(
          request("/v1/studio/runs/run/review", "key", "POST", {
            value: "correct",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await app.request(request("/v1/studio/evals/runs", "key", "POST", {})))
        .status,
    ).toBe(403);
    expect(repo.review).not.toHaveBeenCalled();
  });

  it("fails closed in Cloud mode if any default implementation remains selected", () => {
    const options = {
      db: root,
      apiKeyPepper: "test",
      deployment: "cloud" as const,
    };
    const { authentication, authorization, tenantDatabase } = setup();
    expect(() => createApiApp(options)).toThrow(/authentication adapter/);
    expect(() => createApiApp({ ...options, authentication })).toThrow(
      /authorization adapter/,
    );
    expect(() =>
      createApiApp({ ...options, authentication, authorization }),
    ).toThrow(/tenant database adapter/);
    expect(() =>
      createApiApp({
        ...options,
        authentication,
        authorization,
        tenantDatabase,
      }),
    ).not.toThrow();
  });

  it("uses human identity and the scoped handle without inventing key metadata", async () => {
    const { app, tenantDatabase } = setup();
    const response = await app.request(request("/v1/studio/context"));
    expect(response.status).toBe(200);
    expect(
      StudioContextResponseSchema.parse(await response.json()).apiKey,
    ).toBeNull();
    expect(repo.context).toHaveBeenCalledWith(scoped, {
      organizationId: "org-a",
      projectId: "project-a",
    });
    expect(repo.authenticate).not.toHaveBeenCalled();
    const principal = vi.mocked(tenantDatabase.withPrincipal).mock
      .calls[0]?.[0];
    expect(principal).toEqual(human);
    expect(Object.isFrozen(principal)).toBe(true);
    expect(
      Object.isFrozen(principal?.kind === "human" && principal.permissions),
    ).toBe(true);
  });

  it("rejects invalid tokens without API-key fallback or tenant queries", async () => {
    const { app, authentication, tenantDatabase } = setup();
    vi.mocked(authentication.authenticate).mockRejectedValue(
      new TelemetryAuthError(),
    );
    expect(
      (await app.request(request("/v1/studio/runs", "invalid"))).status,
    ).toBe(401);
    expect(repo.authenticate).not.toHaveBeenCalled();
    expect(tenantDatabase.withPrincipal).not.toHaveBeenCalled();
  });

  it("denies read and write operations independently, before accessing tenant data", async () => {
    const { app, authorization, tenantDatabase } = setup();
    vi.mocked(authorization.allows).mockResolvedValue(false);
    expect((await app.request(request("/v1/studio/context"))).status).toBe(403);
    expect(tenantDatabase.withPrincipal).not.toHaveBeenCalled();
    vi.mocked(authorization.allows).mockImplementation(
      async (_principal, action) => action === "studio:read",
    );
    expect(
      (
        await app.request(
          request("/v1/studio/runs/run/review", "alice", "DELETE"),
        )
      ).status,
    ).toBe(403);
    expect(
      (await app.request(request("/v1/studio/evals/runs", "alice", "POST", {})))
        .status,
    ).toBe(403);
    expect(
      (
        await app.request(
          request(
            "/v1/studio/evals/runs/00000000-0000-4000-8000-000000000001/cancel",
            "alice",
            "POST",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (await app.request(request("/v1/studio/evals/judge?environment=test")))
        .status,
    ).toBe(403);
    expect(repo.clearReview).not.toHaveBeenCalled();
    expect(tenantDatabase.withPrincipal).not.toHaveBeenCalled();
  });

  it("does not accept human tokens on the SDK ingestion surface even with an allowing policy", async () => {
    const { app, authorization, tenantDatabase } = setup();
    vi.mocked(authorization.allows).mockResolvedValue(true);
    expect(
      (
        await app.request(
          request("/v1/telemetry/events:batch", "alice", "POST", {
            events: [],
          }),
        )
      ).status,
    ).toBe(403);
    expect(tenantDatabase.withPrincipal).not.toHaveBeenCalled();
  });

  it("passes callback errors to the database adapter before Hono handles them", async () => {
    const { app, tenantDatabase } = setup();
    const failed = vi.fn();
    vi.mocked(tenantDatabase.withPrincipal).mockImplementation(
      async (_principal, work) => {
        try {
          return await work(scoped);
        } catch (error) {
          failed(error);
          throw error;
        }
      },
    );
    const error = new Error("secret database details");
    repo.context.mockRejectedValueOnce(error);
    const response = await app.request(request("/v1/studio/context"));
    expect(response.status).toBe(500);
    expect(failed).toHaveBeenCalledWith(error);
    expect(await response.text()).not.toContain("secret database details");
  });

  it("keeps concurrent tenant selection and database handles request-local", async () => {
    const { app, authentication, tenantDatabase } = setup();
    const handles = new Map<string, TelemetryDb>();
    vi.mocked(authentication.authenticate).mockImplementation(
      async (request) => {
        const id =
          request.headers.get("authorization") === "Bearer bob" ? "b" : "a";
        await new Promise((resolve) => setTimeout(resolve, id === "a" ? 5 : 1));
        return {
          ...human,
          organizationId: `org-${id}`,
          projectId: `project-${id}`,
        };
      },
    );
    vi.mocked(tenantDatabase.withPrincipal).mockImplementation(
      async (principal, work) => {
        const handle = {
          marker: principal.organizationId,
        } as unknown as TelemetryDb;
        handles.set(principal.organizationId, handle);
        return work(handle);
      },
    );
    const responses = await Promise.all([
      app.request(request("/v1/studio/runs", "alice")),
      app.request(request("/v1/studio/runs", "bob")),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    for (const id of ["a", "b"])
      expect(repo.runs).toHaveBeenCalledWith(
        handles.get(`org-${id}`),
        expect.objectContaining({
          organizationId: `org-${id}`,
          projectId: `project-${id}`,
        }),
      );
  });

  it("uses stable human actors distinct from key actors and retains OSS key attribution", async () => {
    const { app, authorization } = setup();
    vi.mocked(authorization.allows).mockResolvedValue(true);
    expect(
      (
        await app.request(
          request("/v1/studio/runs/run/review", "alice", "POST", {
            value: "correct",
          }),
        )
      ).status,
    ).toBe(200);
    expect(repo.review).toHaveBeenCalledWith(
      scoped,
      expect.objectContaining({
        actorId: principalActorId(human),
        organizationId: "org-a",
        projectId: "project-a",
      }),
    );
    expect(principalActorId(human)).toMatch(/^studio-user:/);
    expect(principalActorId({ ...key, keyId: human.userId })).not.toBe(
      principalActorId(human),
    );
    expect(principalActorId(key)).toBe(
      `studio-key:${createHash("sha256").update(key.keyId).digest("hex").slice(0, 24)}`,
    );
  });

  it("rechecks stream access on delivery and unsubscribes after revocation", async () => {
    const bus = createInMemoryStudioChangeBus();
    const unsubscribe = vi.fn();
    const original = bus.subscribe;
    bus.subscribe = (scope, listener) => {
      const close = original(scope, listener);
      return () => {
        unsubscribe();
        close();
      };
    };
    const authentication: ApiAuthAdapter = {
      authenticate: vi.fn(async () => human),
    };
    let allowed = true;
    const authorization: ApiAuthorizationAdapter = {
      allows: async () => allowed,
    };
    const tenantDatabase: ApiTenantDatabaseAdapter = {
      withPrincipal: vi.fn(async (_principal, work) => work(scoped)),
    };
    const app = createApiApp({
      db: root,
      apiKeyPepper: "test",
      authentication,
      authorization,
      tenantDatabase,
      studioChangeBus: bus,
    });
    const response = await app.request(request("/v1/studio/changes"));
    const reader = response.body?.getReader();
    if (!reader) throw new Error("SSE response has no body.");
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      "event: ready",
    );
    allowed = false;
    bus.publish({
      schemaVersion: 1,
      changeId: "revoked-data",
      emittedAt: new Date().toISOString(),
      organizationId: "org-a",
      projectId: "project-a",
      resources: ["runs"],
    });
    expect((await reader.read()).done).toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(authentication.authenticate).toHaveBeenCalledTimes(2);
    expect(tenantDatabase.withPrincipal).not.toHaveBeenCalled();
  });

  // A real Drizzle transaction is structurally usable by existing repositories,
  // including their nested transactions (native savepoints). No database cast is needed.
  it("accepts native Drizzle transaction handles in the adapter contract", () => {
    const adapter: ApiTenantDatabaseAdapter = {
      withPrincipal: (_principal, work) =>
        root.transaction(async (tx) => work(tx)),
    };
    expect(adapter.withPrincipal).toBeTypeOf("function");
  });
});
