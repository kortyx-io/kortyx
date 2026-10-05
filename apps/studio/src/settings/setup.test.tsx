import { expect, it, vi } from "vitest";
import { buildStudioShellContext } from "../lib/studio-context-model";
vi.mock("server-only", () => ({}));
it("keeps OSS first-use guidance on empty resources, not above Settings", async () => {
  const { studioSettings } = await import("./server");
  const context = buildStudioShellContext({
    authMode: "none",
    studioVersion: "test",
    apiUrlConfigured: false,
    studioApiKeyConfigured: false,
    context: {
      data: null,
      error: { type: "not_configured", message: "Missing" },
    },
  });
  const result = await studioSettings.resolve(context);
  expect(result.setupRequired).toBe(false);
  expect(result.onboarding).toBeUndefined();
  expect(result.categories?.map((item) => item.id)).toEqual([
    "environments",
    "api-keys",
    "evaluations",
  ]);
});
