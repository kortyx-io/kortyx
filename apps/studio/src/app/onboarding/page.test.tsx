import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { StudioShellAdapter } from "../../shell/contracts";
import OnboardingPage from "./page";

const { adapter } = vi.hoisted(() => ({
  adapter: { resolve: vi.fn() } as StudioShellAdapter,
}));
vi.mock("@studio/shell", () => ({ studioShell: adapter }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));
afterEach(() => {
  delete adapter.onboardingPage;
});

it("does not expose managed onboarding for editions without it", async () => {
  await expect(OnboardingPage()).rejects.toThrow("not-found");
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
