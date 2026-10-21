import { SAMPLE_PROJECT } from "@kortyx/telemetry-contracts";
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authorize: vi.fn(),
  credential: vi.fn(),
  values: new Map<string, string>(),
  accountGet: vi.fn(),
  accountSet: vi.fn(),
  settings: {} as {
    sampleProjectVisibility?: {
      get: () => Promise<boolean>;
      set: (value: boolean) => Promise<void>;
    };
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@studio/auth", () => ({
  studioAuth: {
    authorize: state.authorize,
    getApiCredential: state.credential,
  },
}));
vi.mock("@studio/settings", () => ({ studioSettings: state.settings }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      state.values.has(key) ? { value: state.values.get(key) } : undefined,
  }),
  headers: async () => new Headers(),
}));

import {
  GET as getTablePreferences,
  POST as saveTablePreferences,
} from "@/app/api/studio/table-preferences/[tableId]/route";
import { studioReviewRequest } from "@/lib/studio-reviews";
import { STUDIO_REQUEST_PATH } from "@/lib/studio-routing";
import { proxy } from "../../proxy";
import { proxyEvalRequest } from "../evals/api/proxy";
import { proxyPromptRequest } from "../prompts/api/proxy";
import { readSampleDataset } from "./data";
import { samplePreferenceRequest } from "./preferences";
import {
  SAMPLE_REQUEST_HEADER,
  SAMPLE_RETURN_COOKIE,
  SAMPLE_VISIBILITY_COOKIE,
} from "./routing";

beforeEach(() => {
  state.authorize.mockReset().mockResolvedValue(null);
  state.credential.mockReset();
  state.values.clear();
  delete state.settings.sampleProjectVisibility;
  state.accountGet.mockReset();
  state.accountSet.mockReset();
});
const request = (
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) => new NextRequest(`https://studio.test${path}`, init);
const preference = (body: unknown, origin = "https://studio.test") =>
  request("/api/preferences/sample-project", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
it("keeps authentication authoritative for sample pages, APIs and preferences", async () => {
  state.authorize.mockResolvedValue(new Response("Denied", { status: 401 }));
  for (const req of [
    request("/sample/runs"),
    request(
      "/sample/api/studio/diagnostics/30000000-0000-4000-8000-000000000000?env=sample",
    ),
    request("/api/studio/evals/runs", {
      headers: { [STUDIO_REQUEST_PATH]: "/sample/runs" },
    }),
  ])
    expect((await proxy(req)).status).toBe(401);
  expect(
    (
      await samplePreferenceRequest(
        preference({ action: "visibility", visible: false }),
      )
    ).status,
  ).toBe(401);
  expect(state.credential).not.toHaveBeenCalled();
});
it("serves explicitly scoped diagnostic downloads through authentication and visibility without project credentials", async () => {
  const diagnostic = readSampleDataset().diagnostics[0];
  if (!diagnostic) throw new Error("Missing sample diagnostic.");
  const path = `/sample/api/studio/diagnostics/${diagnostic.manifest.diagnosticId}?env=sample`;
  const response = await proxy(request(path));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(diagnostic.content);
  expect(response.headers.get("content-disposition")).toContain(
    diagnostic.manifest.diagnosticId,
  );
  expect((await proxy(request(path, { method: "POST" }))).status).toBe(403);
  expect(
    (await proxy(request(path.replace("env=sample", "env=production")))).status,
  ).toBe(404);
  state.values.set(SAMPLE_VISIBILITY_COOKIE, "false");
  expect((await proxy(request(path))).status).toBe(404);
  expect(state.credential).not.toHaveBeenCalled();
});
it("preserves sample context across the second proxy pass and strips a bare forged marker", async () => {
  const initial = await proxy(request("/sample/runs"));
  expect(
    initial.headers.get(`x-middleware-request-${SAMPLE_REQUEST_HEADER}`),
  ).toBe("1");
  const rewritten = await proxy(
    request("/runs", {
      headers: {
        [STUDIO_REQUEST_PATH]: "/sample/runs",
        [SAMPLE_REQUEST_HEADER]: "1",
      },
    }),
  );
  expect(
    rewritten.headers.get(`x-middleware-request-${SAMPLE_REQUEST_HEADER}`),
  ).toBe("1");
  expect(rewritten.headers.get("x-middleware-rewrite")).toBeNull();
  const real = await proxy(
    request("/runs", { headers: { [SAMPLE_REQUEST_HEADER]: "1" } }),
  );
  expect(
    real.headers.get(`x-middleware-request-${SAMPLE_REQUEST_HEADER}`),
  ).toBeNull();
});
it("rejects direct sample mutations before asking for a real credential", async () => {
  const headers = { [STUDIO_REQUEST_PATH]: "/sample/runs" };
  expect(
    (
      await proxyPromptRequest(
        request("/api/studio/prompts/actions", { method: "POST", headers }),
        ["actions"],
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await proxyEvalRequest(
        request("/api/studio/evals/runs", { method: "POST", headers }),
        ["runs"],
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await studioReviewRequest(
        request(`/api/studio/runs/${SAMPLE_PROJECT.runs.success}/review`, {
          method: "DELETE",
          headers,
        }),
        SAMPLE_PROJECT.runs.success,
      )
    ).status,
  ).toBe(403);
  expect(state.credential).not.toHaveBeenCalled();
});
it("hides sample deep links and API reads without altering real project access", async () => {
  state.values.set(SAMPLE_VISIBILITY_COOKIE, "false");
  expect((await proxy(request("/sample/runs"))).status).toBe(307);
  expect(
    (
      await proxy(
        request("/api/studio/evals/runs", {
          headers: { [STUDIO_REQUEST_PATH]: "/sample/runs" },
        }),
      )
    ).status,
  ).toBe(404);
  expect((await proxy(request("/runs"))).status).toBe(200);
});
it("validates preference origin, JSON, shape and return destinations", async () => {
  expect(
    (
      await samplePreferenceRequest(
        preference(
          { action: "visibility", visible: false },
          "https://outside.test",
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await samplePreferenceRequest(
        preference({ action: "visibility", visible: "false" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await samplePreferenceRequest(
        request("/api/preferences/sample-project", {
          method: "POST",
          headers: {
            origin: "https://studio.test",
            "content-type": "application/json",
          },
          body: "{",
        }),
      )
    ).status,
  ).toBe(400);
  const response = await samplePreferenceRequest(
    preference({ action: "enter", returnTo: "//outside.test/runs" }),
  );
  expect(await response.json()).toEqual({ returnTo: "/runs" });
  expect(response.headers.get("set-cookie")).toContain(
    `${SAMPLE_RETURN_COOKIE}=%2Fruns`,
  );
});
it("uses optional account preferences and propagates storage failures", async () => {
  state.settings.sampleProjectVisibility = {
    get: state.accountGet,
    set: state.accountSet,
  };
  state.accountGet.mockResolvedValue(false);
  expect((await proxy(request("/sample/runs"))).status).toBe(307);
  await samplePreferenceRequest(
    preference({ action: "visibility", visible: true }),
  );
  expect(state.accountSet).toHaveBeenCalledWith(true);
  state.accountSet.mockRejectedValue(
    new Error("Preference storage unavailable"),
  );
  await expect(
    samplePreferenceRequest(
      preference({ action: "visibility", visible: false }),
    ),
  ).rejects.toThrow("Preference storage unavailable");
});

it("keeps real projects available when the optional preference store fails", async () => {
  state.settings.sampleProjectVisibility = {
    get: state.accountGet,
    set: state.accountSet,
  };
  state.accountGet.mockRejectedValue(new Error("Preference store unavailable"));
  expect((await proxy(request("/runs"))).status).toBe(200);
  expect((await proxy(request("/sample/runs"))).status).toBe(503);
  const { readSampleProjectPreference } = await import("./server");
  expect(await readSampleProjectPreference()).toEqual({
    visible: false,
    available: false,
  });
});

it("isolates sample table preference endpoints from the real project", async () => {
  for (const [method, handler, expected] of [
    ["GET", getTablePreferences, 404],
    ["POST", saveTablePreferences, 403],
  ] as const) {
    const response = await handler(
      request("/api/studio/table-preferences/runs", {
        method,
        headers: { [STUDIO_REQUEST_PATH]: "/sample/runs" },
      }),
      { params: Promise.resolve({ tableId: "runs" }) },
    );
    expect(response.status).toBe(expected);
  }
  expect(state.credential).not.toHaveBeenCalled();
});

it("routes sample comparison summaries through immutable reads with auth and visibility intact", async () => {
  const { readModalComparison } = await import("../evals/api/modal-comparison");
  const path = `/api/studio/evals/comparison?run=${SAMPLE_PROJECT.evaluationId}&baseline=${SAMPLE_PROJECT.evaluationIds.baseline}`;
  const makeRequest = () =>
    request(path, { headers: { [STUDIO_REQUEST_PATH]: "/sample/evals/runs" } });
  const forwarded = await proxy(makeRequest());
  expect(forwarded.headers.get("x-middleware-next")).toBe("1");
  const response = await readModalComparison(makeRequest());
  expect(response.status).toBe(200);
  expect((await response.json()).state).toBe("ready");
  expect(state.credential).not.toHaveBeenCalled();
  state.values.set(SAMPLE_VISIBILITY_COOKIE, "false");
  expect((await proxy(makeRequest())).status).toBe(404);
  expect((await readModalComparison(makeRequest())).status).toBe(503);
  state.authorize.mockResolvedValue(new Response("Denied", { status: 401 }));
  expect((await proxy(makeRequest())).status).toBe(401);
  expect((await readModalComparison(makeRequest())).status).toBe(401);
});
