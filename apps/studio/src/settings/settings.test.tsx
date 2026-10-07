import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { buildStudioShellContext } from "../lib/studio-context-model";

const resolve = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@studio/settings", () => ({ studioSettings: { resolve } }));
vi.mock("@/lib/studio-context", () => ({
  getStudioShellContext: async () => context,
}));
vi.mock("@/components/studio-updates", () => ({
  StudioUpdates: () => <div>Studio updates</div>,
}));
vi.mock("@/components/theme-toggle", () => ({
  ThemePreferenceControl: () => <div>Theme preference</div>,
}));
vi.mock("@/components/settings/settings-navigation", () => ({
  SettingsNavigation: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SettingsPanel: ({
    children,
    label,
  }: {
    children: React.ReactNode;
    label: string;
  }) => <section aria-label={label}>{children}</section>,
}));
const context = buildStudioShellContext({
  authMode: "none",
  studioVersion: "test",
  apiUrlConfigured: true,
  studioApiKeyConfigured: true,
  context: {
    data: null,
    error: { type: "not_configured", message: "Test configuration missing" },
  },
});
beforeEach(() => {
  resolve.mockReset().mockResolvedValue({});
});
const render = async () => {
  const { default: Page } = await import("../app/settings/page");
  return renderToStaticMarkup(await Page());
};
it("keeps OSS settings in a flat section layout without an overall header", async () => {
  const html = await render();
  for (const text of [
    "Local scope",
    "Connection",
    "Access",
    "Telemetry &amp; privacy",
    "Appearance",
    "About",
  ])
    expect(html).toContain(text);
  expect(resolve).toHaveBeenCalledWith(context);
  expect(html).not.toContain("Local configuration");
  expect(html).not.toContain("<h1");
  expect(html).toContain(
    'class="h-full overflow-hidden rounded-xl border bg-background shadow-sm"',
  );
  expect(html).toContain('href="https://kortyx.io/docs"');
  expect(html).not.toContain("md:grid-cols-[1fr_auto]");
});
it("contributes to the same page without losing shared cards", async () => {
  resolve.mockResolvedValue({
    label: "Cloud workspace",
    scope: <section>Organization controls</section>,
    connection: null,
    access: <section>Signed-in account</section>,
    sections: <section>API keys</section>,
  });
  const html = await render();
  for (const text of [
    "Organization controls",
    "Signed-in account",
    "API keys",
    "Theme preference",
    "Telemetry &amp; privacy",
    "About",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain("Local scope");
  expect(html).not.toContain("HTTP Basic Auth");
  expect(html).not.toContain("Cloud workspace");
});
it("does not fall back to local settings after an adapter authorization failure", async () => {
  resolve.mockRejectedValue(new Error("Denied"));
  await expect(render()).rejects.toThrow("Denied");
});
