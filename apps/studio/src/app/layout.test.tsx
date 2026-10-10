import { expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "sans" }),
  Geist_Mono: () => ({ variable: "mono" }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/components/layouts/sidebar-layout", () => ({
  SidebarLayout: () => null,
}));
vi.mock("@/components/detail/detail-drawer", () => ({
  DetailDrawerHost: () => null,
}));
vi.mock("@/components/detail/detail-slot-presence", () => ({
  DetailSlotPresence: () => null,
}));
it("renders saved theme state without a theme script element", async () => {
  const { default: RootLayout } = await import("./layout");
  const { Providers } = await import("./providers");
  const root = await RootLayout({
    children: null,
    interruptDrawer: null,
    runDrawer: null,
    sessionDrawer: null,
    evalCaseDrawer: null,
    evalSuiteDrawer: null,
    promptDrawer: null,
    promptGroupDrawer: null,
    promptGroupsDrawer: null,
  });
  expect(root.props["data-theme-preference"]).toBe("system");
  expect(root.props.children.type).toBe("body");
  expect(root.props.children.props.children.type).toBe(Providers);
});
