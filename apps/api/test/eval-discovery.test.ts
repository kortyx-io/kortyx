import { StudioEvalTargetsResponseSchema } from "@kortyx/agent/evals";
import type { TelemetryDb } from "@kortyx/telemetry-db";
import { TelemetryForbiddenError } from "@kortyx/telemetry-db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import {
  EvalDiscoveryError,
  type EvalTarget,
  fetchEvalManifest,
} from "../src/evals/targets";

const environment = vi.hoisted(() => vi.fn());
vi.mock("@kortyx/telemetry-db", async (original) => ({
  ...(await original<typeof import("@kortyx/telemetry-db")>()),
  getEvalSettings: vi.fn(async () => ({})),
  ensureProjectEnvironmentAllowed: environment,
}));
const target: EvalTarget = {
  id: "catalog",
  name: "Catalog",
  environment: "staging",
  organizationId: "org-a",
  projectId: "project-a",
  url: "https://consumer.test/api/evals",
  serviceKey: "private-service-key".repeat(3),
  allowInsecureHttp: false,
};
const manifest = {
  schemaVersion: 1 as const,
  studioJudging: true as const,
  suites: [],
  responders: [],
  references: [],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

const api = (targets: EvalTarget[] = [target]) =>
  createApiApp({
    db: {} as TelemetryDb,
    apiKeyPepper: "test",
    evalTargets: targets,
    authentication: {
      authenticate: async () => ({
        kind: "api-key",
        keyId: "reader",
        mode: "test",
        organizationId: "org-a",
        projectId: "project-a",
        scopes: ["studio:read"],
      }),
    },
    authorization: {
      allows: async (_principal, action) => action === "studio:read",
    },
    tenantDatabase: {
      withPrincipal: async (_principal, work) => work({} as TelemetryDb),
    },
  });

describe("consumer discovery diagnostics", () => {
  it("uses request-local adapter discovery, filters foreign scope and never leaks credentials", async () => {
    const list = vi.fn(async () => [
      target,
      { ...target, id: "foreign", projectId: "other-project" },
    ]);
    const discover = vi.fn(async () => manifest);
    const app = createApiApp({
      db: {} as TelemetryDb,
      apiKeyPepper: "test",
      evalTargetAdapter: { list, manifest: discover },
      authentication: {
        authenticate: async () => ({
          kind: "human",
          userId: "user-a",
          organizationId: "org-a",
          projectId: "project-a",
          permissions: ["studio:view"],
        }),
      },
      authorization: { allows: async () => true },
      tenantDatabase: {
        withPrincipal: async (_principal, work) => work({} as TelemetryDb),
      },
    });
    const response = await app.request("/v1/studio/evals/targets");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text).targets).toHaveLength(1);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-a", projectId: "project-a" }),
    );
    expect(discover).toHaveBeenCalledOnce();
    expect(text).not.toContain(target.serviceKey);
    expect(text).not.toContain(target.url);
  });
  it.each([
    404, 401, 403, 500, 502,
  ])("classifies HTTP %s and retains the response with credentials redacted", async (status) => {
    const response = new Response(
      `Endpoint rejected discovery. Authorization: Bearer ${target.serviceKey}`,
      { status },
    );
    const request = vi.fn<typeof fetch>(async () => response);
    vi.stubGlobal("fetch", request);
    const failure = await fetchEvalManifest(target).catch((error) => error);
    expect(failure).toBeInstanceOf(EvalDiscoveryError);
    expect(failure.diagnostic).toEqual({
      code:
        status === 404
          ? "endpoint_not_found"
          : status === 401 || status === 403
            ? "endpoint_unauthorized"
            : "endpoint_http_error",
      httpStatus: status,
    });
    expect(failure.message).toContain("Endpoint rejected discovery.");
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      redirect: "error",
      headers: { authorization: `Bearer ${target.serviceKey}` },
    });
    expect(String(failure)).not.toContain(target.serviceKey);
  });
  it.each([
    "<html>private login page</html>",
    JSON.stringify({ token: "private-token" }),
    "",
  ])("rejects incompatible manifest responses without returning the body", async (body) => {
    vi.stubGlobal("fetch", async () => new Response(body));
    await expect(fetchEvalManifest(target)).rejects.toMatchObject({
      diagnostic: { code: "manifest_invalid" },
    });
  });
  it("rejects an oversized manifest and cancels the stream", async () => {
    const cancelled = vi.fn();
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(2_000_001));
            },
            cancel: cancelled,
          }),
        ),
    );
    await expect(fetchEvalManifest(target)).rejects.toMatchObject({
      diagnostic: { code: "manifest_invalid" },
    });
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("preserves interrupted stream and network errors with credential redaction", async () => {
    for (const request of [
      async () => {
        throw new Error(
          `Connection failed. Authorization: Bearer ${target.serviceKey}`,
        );
      },
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("private stream failure"));
            },
          }),
        ),
    ]) {
      vi.stubGlobal("fetch", request);
      await expect(fetchEvalManifest(target)).rejects.toMatchObject({
        diagnostic: { code: "endpoint_unreachable" },
        message: expect.stringMatching(
          /Connection failed|private stream failure/,
        ),
      });
    }
  });
  it("exposes diagnostics only for the caller's project, never the URL, key or consumer body", async () => {
    const request = vi.fn<typeof fetch>(
      async () => new Response(`secret=${target.serviceKey}`, { status: 404 }),
    );
    vi.stubGlobal("fetch", request);
    const response = await api([
      target,
      { ...target, id: "other", projectId: "other-project" },
    ]).request("/v1/studio/evals/targets");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({
      canRun: false,
      targets: [
        {
          id: "catalog",
          manifest: null,
          diagnostic: { code: "endpoint_not_found", httpStatus: 404 },
        },
      ],
    });
    expect(JSON.parse(text).targets).toHaveLength(1);
    expect(text).not.toContain(target.url);
    expect(text).not.toContain(target.serviceKey);
    expect(request).toHaveBeenCalledOnce();
  });
  it.each([
    new TelemetryForbiddenError("private policy"),
    new Error("private SQL"),
  ])("skips consumer fetch when environment validation fails", async (error) => {
    environment.mockRejectedValue(error);
    const request = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", request);
    const result = StudioEvalTargetsResponseSchema.parse(
      await (await api().request("/v1/studio/evals/targets")).json(),
    );
    expect(result.targets[0]?.diagnostic?.code).toBe(
      error instanceof TelemetryForbiddenError
        ? "environment_forbidden"
        : "environment_unavailable",
    );
    expect(request).not.toHaveBeenCalled();
    expect(result.targets[0]?.error).toBe(error.message);
  });
  it("returns a valid authenticated manifest with no diagnostic failure", async () => {
    vi.stubGlobal("fetch", async () => Response.json(manifest));
    const result = StudioEvalTargetsResponseSchema.parse(
      await (await api().request("/v1/studio/evals/targets")).json(),
    );
    expect(result.targets[0]).toMatchObject({
      manifest,
      error: null,
      diagnostic: null,
    });
  });
});
