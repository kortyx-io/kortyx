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

it("links an evaluation run breadcrumb to the grouped Runs list", () => {
  route.pathname = "/evals/evaluations/11111111-1111-4111-8111-111111111111";
  const html = renderToStaticMarkup(<WorkspaceNavigation />);
  expect(html).toContain('href="/evals/runs"');
  expect(html).toContain('title="Evaluation run">Evaluation run</span>');
  expect(html).not.toContain('href="/evals/evaluations"');
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

it.each([
  ["/evals/runs", "runs"],
  ["/evals/evaluations/evaluation-id", "runs"],
  ["/evals/evaluations/evaluation-id/compare", "runs"],
  ["/evals/cases/run-id/case-id/1", "runs"],
  ["/evals/suites", "suites"],
  ["/evals/judges/target/app", "suites"],
  ["/evals/judges/run/run-id", "runs"],
  ["/evals/suites/suite-id", "suites"],
])("keeps the eval section switch active on %s and preserves environment scope", (pathname, active) => {
  route.pathname = pathname;
  route.search = "env=staging";
  const html = renderToStaticMarkup(<WorkspaceNavigation />);
  route.search = "";
  const navigation = html.match(
    /<nav aria-label="Eval navigation"[^>]*>(.*?)<\/nav>/,
  )?.[1];
  expect(navigation).toContain('href="/evals/runs?env=staging"');
  expect(navigation).toContain('href="/evals/suites?env=staging"');
  expect(navigation).toContain(
    `href="/evals/${active}?env=staging" aria-current="page"`,
  );
  expect(navigation?.match(/aria-current="page"/g)).toHaveLength(1);
});

it("does not show eval section navigation outside evaluations", () => {
  route.pathname = "/runs";
  expect(renderToStaticMarkup(<WorkspaceNavigation />)).not.toContain(
    'aria-label="Eval navigation"',
  );
});

it("gives judge instruction readers a useful breadcrumb without invalid source ancestors", () => {
  route.pathname = "/evals/judges/target/app";
  const html = renderToStaticMarkup(<WorkspaceNavigation />);
  expect(html).toContain("Judge instructions</span>");
  expect(html).not.toContain('href="/evals/judges/target"');
});
