import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@studio/auth", () => ({ studioAuth: { getApiCredential: vi.fn() } }));
vi.mock("@/features/sample-project/server", () => ({
  isSampleProject: vi.fn(),
  readSampleProjectPreference: vi.fn(),
}));

import { studioAuth } from "@studio/auth";
import {
  isSampleProject,
  readSampleProjectPreference,
} from "@/features/sample-project/server";
import { readEvaluationHistory } from "./server";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("KORTYX_API_URL", "http://api:6400");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses request-scoped credentials for modal reads and keeps project/environment scope", async () => {
  const request = new Request("http://studio/api/studio/evals/comparison");
  vi.mocked(studioAuth.getApiCredential).mockResolvedValue({
    authorization: "Bearer server-key",
    projectId: "project",
    environmentId: "env-id",
    environment: "test",
  });
  const fetch = vi.fn().mockResolvedValue(Response.json({ runs: [] }));
  vi.stubGlobal("fetch", fetch);
  await expect(readEvaluationHistory(request)).resolves.toEqual({ runs: [] });
  expect(studioAuth.getApiCredential).toHaveBeenCalledWith(request);
  expect(isSampleProject).toHaveBeenCalledWith(request);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    headers: {
      authorization: "Bearer server-key",
      "x-kortyx-project-id": "project",
      "x-kortyx-environment-id": "env-id",
      "x-kortyx-environment": "test",
    },
    cache: "no-store",
    redirect: "error",
  });
});
it("rejects hidden or unavailable sample preferences without accessing the API", async () => {
  vi.mocked(isSampleProject).mockResolvedValue(true);
  vi.mocked(readSampleProjectPreference).mockResolvedValue({
    visible: false,
    available: true,
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    readEvaluationHistory(
      new Request("http://studio/api/studio/evals/comparison"),
    ),
  ).rejects.toThrow("Sample project is unavailable");
  expect(studioAuth.getApiCredential).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
