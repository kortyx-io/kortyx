import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WorkspaceNavigation } from "./workspace-navigation";

const route = vi.hoisted(() => ({ pathname: "/settings/members" }));
vi.mock("@/lib/scoped-navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/scoped-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));

it.each([
  ["general", "General"],
  ["project", "General"],
  ["account", "Account"],
  ["appearance", "Appearance"],
  ["about", "About"],
  ["members", "Members"],
  ["api-keys", "API keys"],
  ["environments", "Environments"],
  ["providers", "Providers"],
  ["connection", "Connection"],
  ["evaluations", "Evaluations"],
  ["privacy", "Telemetry &amp; privacy"],
  ["access", "Access"],
])("uses the display label for settings/%s", (section, label) => {
  route.pathname = `/settings/${section}`;
  const html = renderToStaticMarkup(<WorkspaceNavigation />);
  expect(html).toContain(`aria-current="page"`);
  expect(html).toContain(`title="${label}">${label}</span>`);
});

it("uses foreground parent links and muted hover colors", () => {
  route.pathname = "/settings/members";
  const html = renderToStaticMarkup(<WorkspaceNavigation />);
  const parent = html.match(/<a[^>]+href="\/settings"[^>]*>/)?.[0];
  expect(parent).toContain(
    'class="truncate text-foreground transition-colors hover:text-muted-foreground"',
  );
});

it("does not relabel dynamic identifiers as settings sections", () => {
  route.pathname = "/runs/members";
  const html = renderToStaticMarkup(<WorkspaceNavigation />);
  expect(html).toContain('title="members">members</span>');
});
