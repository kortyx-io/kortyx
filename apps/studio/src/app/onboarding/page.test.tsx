import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { StudioShellAdapter } from "../../shell/contracts";
import OnboardingPage from "./page";

const { adapter } = vi.hoisted(() => ({
  adapter: { resolve: vi.fn() } as StudioShellAdapter,
}));
vi.mock("@studio/shell", () => ({ studioShell: adapter }));
vi.mock("@/lib/studio-context", () => ({
  getStudioShellContext: async () => ({
    connection: {
      label: "Connected",
      detail: "Authenticated project context is available.",
    },
  }),
}));
afterEach(() => {
  delete adapter.onboardingPage;
});

it("provides a shared connection guide without exposing managed account operations", async () => {
  const html = renderToStaticMarkup(await OnboardingPage());
  expect(html).toContain("Connect your application");
  expect(html).toContain("Studio API: Connected");
  expect(html).toContain("Sample records and tour");
  expect(html).not.toContain("/auth/organizations/create");
  expect(html).not.toContain("Organization name");
});

it("renders edition onboarding as a Studio page without settings navigation", async () => {
  adapter.onboardingPage = vi.fn(async () => (
    <form action="/auth/organizations/create">
      <label htmlFor="organization">Organization name</label>
      <input id="organization" name="name" />
    </form>
  ));
  const html = renderToStaticMarkup(await OnboardingPage());
  expect(adapter.onboardingPage).toHaveBeenCalledOnce();
  expect(html).toContain("Organization name");
  expect(html).toContain('action="/auth/organizations/create"');
  expect(html).not.toContain("<nav");
});
