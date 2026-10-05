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
  schemaVersion: 1,
  studioJudging: true,
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

describe("safe consumer discovery diagnostics", () => {
  it.each([
    404, 401, 403, 500, 502,
  ])("classifies HTTP %s, cancels its body and hides private response content", async (status) => {
    const cancelled = vi.fn();
    const response = new Response(new ReadableStream({ cancel: cancelled }), {
      status,
    });
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
    expect(cancelled).toHaveBeenCalledOnce();
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
  it("classifies interrupted response bodies and network/TLS/redirect failures without leaking their messages", async () => {
    for (const request of [
      async () => {
        throw new Error(`private URL ${target.serviceKey}`);
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
        message: "Consumer eval endpoint is unavailable or incompatible.",
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
    expect(JSON.stringify(result)).not.toContain("private");
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
