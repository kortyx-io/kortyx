import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { buildStudioShellContext } from "../lib/studio-context-model";
import { LocalStudioSetup } from "./setup";
import { LOCAL_SETUP_COOKIE } from "./setup-state";

const cookieValue = vi.hoisted(() => ({
  value: undefined as string | undefined,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === LOCAL_SETUP_COOKIE ? cookieValue : undefined,
  }),
}));
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
beforeEach(() => {
  cookieValue.value = undefined;
});
it("guides first-time self-hosted entry inside Settings without changing authorization", async () => {
  const { studioSettings } = await import("./server");
  const result = await studioSettings.resolve(context);
  expect(result.setupRequired).toBe(true);
  const html = renderToStaticMarkup(result.onboarding);
  expect(html).toContain("Get started with Studio");
  expect(html).toContain("Check your connection");
  expect(html).toContain("disabled");
  expect(html).not.toContain("Organization name");
});
it("remembers completed local setup as a display preference only", async () => {
  cookieValue.value = "1";
  const { studioSettings } = await import("./server");
  const result = await studioSettings.resolve(context);
  expect(result.setupRequired).toBe(false);
  expect(result.onboarding).toBeNull();
});
it("uses shared Settings controls when the local API is connected", () => {
  const html = renderToStaticMarkup(<LocalStudioSetup connected />);
  expect(html).toContain("Your Studio API connection is ready");
  expect(html).not.toContain('disabled=""');
});
