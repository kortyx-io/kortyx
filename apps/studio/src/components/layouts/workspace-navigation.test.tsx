import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WorkspaceNavigation } from "./workspace-navigation";

const route = vi.hoisted(() => ({ pathname: "/settings/members", search: "" }));
vi.mock("@/lib/scoped-navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
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
  ["projects", "Projects"],
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

it("links an experiment breadcrumb to the experiments list and preserves environment", () => {
  route.pathname = "/experiments/11111111-1111-4111-8111-111111111111";
  route.search = "env=staging";
  const html = renderToStaticMarkup(<WorkspaceNavigation />);
  route.search = "";
  expect(html).toContain('href="/experiments?env=staging"');
  expect(html).toContain('title="Experiment">Experiment</span>');
  expect(html).not.toContain('aria-label="Eval navigation"');
});

it("labels a dataset breadcrumb without exposing its composite identity", () => {
  route.pathname = "/datasets/%5B%22target%22%2C%22suite%22%5D";
  const html = renderToStaticMarkup(<WorkspaceNavigation />);
  expect(html).toContain('href="/datasets"');
  expect(html).toContain('title="Dataset">Dataset</span>');
});

it("does not link a private diagnostic breadcrumb to a nonexistent inbox", () => {
  route.pathname = "/diagnostics/11111111-1111-4111-8111-111111111111";
  const html = renderToStaticMarkup(<WorkspaceNavigation />);
  expect(html).toContain("Error diagnostic");
  expect(html).not.toContain('href="/diagnostics"');
});

it("uses a prompt label until the detail title is available instead of exposing its id", () => {
  route.pathname = "/prompts/11111111-1111-4111-8111-111111111111";
  const html = renderToStaticMarkup(<WorkspaceNavigation />);
  expect(html).toContain('title="Prompts"');
  expect(html).toContain('title="Prompt">Prompt</span>');
  expect(html).not.toContain("11111111-1111-4111-8111-111111111111");
});

it("gives judge instruction readers a useful breadcrumb without invalid source ancestors", () => {
  route.pathname = "/experiments/judges/target/app";
  const html = renderToStaticMarkup(<WorkspaceNavigation />);
  expect(html).toContain("Judge instructions</span>");
  expect(html).not.toContain('href="/experiments/judges/target"');
});
