// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPageHelpPlan } from "./page-help-plan";
import { PAGE_GUIDES, pageGuideId } from "./page-help-registry";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(10, 80, 650, 100),
  );
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function plan(path: string, html: string) {
  document.body.innerHTML = `<main data-studio-page="true">${html}</main>`;
  return createPageHelpPlan(new URL(path, "https://studio.example"));
}
it("explains a real execution's current tab without navigating or reading its content", () => {
  const path =
    "/projects/prj_0123456789abcdef01234567/runs/customer-run?tab=events&event=customer-event&env=production";
  const result = plan(
    path,
    `<div data-run-detail-id="customer-run"><div data-responsive-surface="detail-header">private-message</div><div data-page-help="tabs"></div><div data-detail-tab-content="trace" aria-hidden="true"></div><div data-detail-tab-content="events" aria-hidden="false">private-payload</div></div>`,
  );
  expect(result.id).toBe("run");
  expect(result.empty).toBe(false);
  expect(result.url).toBe(`https://studio.example${path}`);
  expect(result.steps.map((step) => step.id)).toEqual(["overview", "content"]);
  expect(result.steps.at(-1)?.content).toContain(
    "Events is the ordered telemetry record",
  );
  expect(result.steps.at(-1)?.target.dataset.detailTabContent).toBe("events");
  expect(
    JSON.stringify(
      result.steps.map(({ content, title }) => ({ content, title })),
    ),
  ).not.toMatch(/private-|customer-|support assistant|fictional/);
});
it("uses the active drawer rather than records retained underneath it", () => {
  document.body.innerHTML = `<main data-studio-page="true"><header data-page-help="header">old</header><div data-page-help-records="50"></div></main><section data-detail-drawer="/sessions/current" data-state="open"><div data-session-detail-id="current"><div data-responsive-surface="detail-header">current</div><div data-page-help="tabs"></div><div data-detail-tab-content="runs" aria-hidden="false"></div></div></section>`;
  const drawer = document.querySelector<HTMLElement>("[data-detail-drawer]");
  if (!drawer) throw new Error("Missing drawer fixture");
  Object.assign(drawer, { getAnimations: () => [] });
  const result = createPageHelpPlan(
    new URL("https://studio.example/sample/sessions/current?sessionTab=runs"),
  );
  expect(result.id).toBe("session");
  expect(result.empty).toBe(false);
  expect(result.steps.every((step) => drawer?.contains(step.target))).toBe(
    true,
  );
});
it("plans an entering drawer and leaves settling to the runtime instead of reporting missing data", () => {
  document.body.innerHTML = `<main data-studio-page="true"></main><section data-detail-drawer="/runs/current" data-state="open"><div data-run-detail-id="current"><div data-responsive-surface="detail-header"></div><div data-page-help="tabs"></div><div data-detail-tab-content="trace" aria-hidden="false"></div></div></section>`;
  const drawer = document.querySelector<HTMLElement>("[data-detail-drawer]");
  if (!drawer) throw new Error("Missing drawer fixture");
  Object.assign(drawer, { getAnimations: () => [{ playState: "running" }] });
  const result = createPageHelpPlan(
    new URL("https://studio.example/sample/runs/current?tab=trace"),
  );
  expect(result.empty).toBe(false);
  expect(result.steps.map((step) => step.id)).toEqual(["overview", "content"]);
});
it("explains the selected prompt activity tab rather than its content editor", () => {
  const result = plan(
    "/prompts/current?v=2&tab=activity",
    `<div data-prompt-detail-id="current"><div data-prompt-header></div><nav data-prompt-tabs-row></nav><div data-page-help="prompt-content"></div></div>`,
  );
  expect(result.steps.at(-1)?.content).toContain("Activity records changes");
  expect(result.url).toContain("v=2&tab=activity");
});
it("distinguishes empty or unavailable views from visible real records", () => {
  const empty = plan(
    "/runs?q=unmatched",
    `<header data-page-help="header"></header><div data-table-controls="runs"></div><div data-page-help-records="0"></div>`,
  );
  expect(empty.empty).toBe(true);
  expect(empty.steps.map((step) => step.id)).toEqual(["overview", "controls"]);
  const full = plan(
    "/runs",
    `<header data-page-help="header"></header><div data-page-help-records="1"><table><tbody><tr data-row-key="real"><td>private</td></tr></tbody></table></div>`,
  );
  expect(full.empty).toBe(false);
  expect(full.steps.at(-1)?.id).toBe("records");
  const failed = plan(
    "/sessions",
    `<div data-page-help-state="error"><h1>Unavailable</h1><p>Connection failed</p></div>`,
  );
  expect(failed.empty).toBe(true);
  expect(failed.steps.at(-1)?.content).toContain(
    "does not repair the connection",
  );
});
it("explains settings in place, including sections outside sample walkthroughs", () => {
  const result = plan(
    "/settings/privacy",
    `<nav aria-label="Settings sections"></nav><section data-settings-section="privacy"><section data-settings-card><div><h2>Privacy</h2></div></section></section>`,
  );
  expect(result.empty).toBe(false);
  expect(result.example).toBeUndefined();
  expect(result.steps.at(-1)?.content).toContain(
    "maintainer product-usage telemetry",
  );
});
it("covers every primary Studio route and retains help for extension pages", () => {
  const routes = {
    "/runs": "runs",
    "/runs/id": "run",
    "/sessions": "sessions",
    "/sessions/id": "session",
    "/workflows": "workflows",
    "/interrupts": "interrupts",
    "/interrupts/id": "interrupt",
    "/prompts": "prompts",
    "/prompts/id": "prompt",
    "/prompts/categories/id": "prompts",
    "/prompts/by-key/team/support": "prompt",
    "/prompts/groups": "prompt-groups",
    "/prompts/groups/id": "prompt-group",
    "/evals": "evals",
    "/evals/runs": "evals",
    "/evals/runs/id": "eval-run",
    "/evals/evaluations/id": "evaluation",
    "/evals/suites": "eval-suites",
    "/evals/suites/target/suite": "eval-suite",
    "/evals/runs/id/compare": "eval-comparison",
    "/evals/cases/run/case/1": "eval-case",
    "/evals/cases/run/case/compare": "eval-case-comparison",
    "/diagnostics/id": "diagnostic",
    "/settings": "settings",
    "/settings/members": "settings",
    "/onboarding": "onboarding",
    "/extension": "other",
  };
  for (const [path, expected] of Object.entries(routes))
    expect(pageGuideId(path), path).toBe(expected);
  for (const guide of Object.values(PAGE_GUIDES)) {
    expect(guide.overview.length).toBeLessThan(400);
    expect(guide.content.length).toBeLessThan(400);
  }
});

it("gets to selected evidence without teaching generic table or tab controls again", () => {
  const result = plan(
    "/sample/sessions/current?sessionTab=runs",
    `<div data-session-detail-id="current"><div data-responsive-surface="detail-header"></div><div data-page-help="tabs"></div><div data-detail-tab-content="runs" aria-hidden="false"><div data-table-controls="runs"></div><table><tr data-row-key="private"><td>Private</td></tr></table></div></div>`,
  );
  expect(result.steps.map((step) => step.id)).toEqual(["overview", "content"]);
  expect(result.steps[1]?.target.dataset.detailTabContent).toBe("runs");
});

it("retains domain help for related records on detail pages without tab panels", () => {
  const result = plan(
    "/sample/evals/evaluations/current",
    `<header data-tour-surface="eval-summary"></header><div data-table-controls="evaluation-suites"></div><table><tr data-row-key="private-suite"><td>Private suite</td></tr></table>`,
  );
  expect(result.steps.map((step) => step.id)).toEqual(["overview", "content"]);
  expect(result.steps[1]?.content).toContain("Open a suite");
  expect(result.steps[1]?.target.tagName).toBe("TD");
});
