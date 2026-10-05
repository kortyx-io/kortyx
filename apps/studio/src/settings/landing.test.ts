import { expect, it, vi } from "vitest";

const resolve = vi.hoisted(() => vi.fn());
vi.mock("@studio/settings", () => ({ studioSettings: { resolve } }));
vi.mock("@/lib/studio-context", () => ({
  getStudioShellContext: async () => ({}),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(path);
  },
}));
it.each([
  [true, "/settings"],
  [false, "/runs"],
  [undefined, "/runs"],
])("lands in setup only when requested: %s", async (setupRequired, path) => {
  resolve.mockResolvedValue({ setupRequired });
  const { default: Home } = await import("../app/page");
  await expect(Home()).rejects.toThrow(path);
});
