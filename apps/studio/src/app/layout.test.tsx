import Script from "next/script";
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
it("loads the theme bootstrap with the native beforeInteractive script strategy", async () => {
  const { default: RootLayout } = await import("./layout");
  const root = await RootLayout({
    children: null,
    interruptDrawer: null,
    runDrawer: null,
    sessionDrawer: null,
    evalCaseDrawer: null,
    evalSuiteDrawer: null,
  });
  const [head] = root.props.children;
  const initializer = head.props.children;
  expect(initializer.type).toBe(Script);
  expect(initializer.props).toMatchObject({
    id: "theme-initializer",
    strategy: "beforeInteractive",
  });
  expect(initializer.props.dangerouslySetInnerHTML.__html).toContain(
    'window.matchMedia("(prefers-color-scheme: dark)")',
  );
  expect(initializer.props.dangerouslySetInnerHTML.__html).toContain(
    'localStorage.removeItem("theme")',
  );
});
