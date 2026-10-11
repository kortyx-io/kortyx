import { beforeEach, expect, it, vi } from "vitest";

const { resolve, redirect } = vi.hoisted(() => ({
  resolve: vi.fn(),
  redirect: vi.fn((href: string): never => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@studio/shell", () => ({ studioShell: { resolve } }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./studio-context", () => ({
  getStudioShellContext: async () => ({}),
}));

import { scopedRedirect } from "./scoped-redirect";

beforeEach(() => {
  vi.clearAllMocks();
  resolve.mockResolvedValue({});
});
it("preserves OSS redirects with no edition scope", async () => {
  await expect(scopedRedirect("/evals/runs")).rejects.toThrow(
    "redirect:/evals/runs",
  );
});
it("uses the independently resolved project, including query parameters", async () => {
  resolve.mockResolvedValue({
    routeScope: { projectPublicId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa" },
  });
  await expect(scopedRedirect("/evals/runs?target=app")).rejects.toThrow(
    "redirect:/projects/prj_aaaaaaaaaaaaaaaaaaaaaaaa/evals/runs?target=app",
  );
});
it("does not fall back to unscoped routing on failed authorization", async () => {
  resolve.mockRejectedValue(new Error("Denied"));
  await expect(scopedRedirect("/evals/runs")).rejects.toThrow("Denied");
  expect(redirect).not.toHaveBeenCalled();
});
