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
it("explains the comparison modal instead of the table underneath without reading content", () => {
  const modal = document.createElement("section");
  modal.setAttribute("data-eval-comparison-modal", "true");
  modal.innerHTML =
    '<header data-page-help="comparison-context">private run name</header><div data-comparison-side="Earlier">private answer</div><div data-comparison-side="This run">private answer</div><footer data-page-help="comparison-navigation"></footer>';
  document.body.append(modal);
  const result = createPageHelpPlan(
    new URL("https://studio.example/sample/evals/runs"),
  );
  expect(result.id).toBe("eval-case-comparison");
  expect(result.steps).toHaveLength(4);
  expect(result.steps.every((step) => modal.contains(step.target))).toBe(true);
  expect(
    JSON.stringify(result.steps.map(({ content }) => content)),
  ).not.toContain("private");
});
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
    "/evals/evaluations/id/compare": "eval-comparison",
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
  expect(
    result.steps[1]?.target
      .closest("[data-detail-tab-content]")
      ?.getAttribute("data-detail-tab-content"),
  ).toBe("runs");
});

it("retains domain help for related records on detail pages without tab panels", () => {
  const result = plan(
    "/sample/evals/evaluations/current",
    `<header data-tour-surface="eval-summary"></header><div data-table-controls="evaluation-conversations"></div><table><tr data-row-key="private-suite"><td>Private suite</td></tr></table>`,
  );
  expect(result.steps.map((step) => step.id)).toEqual(["overview", "content"]);
  expect(result.steps[1]?.content).toContain("filters the same table");
  expect(result.steps[1]?.target.tagName).toBe("TD");
});

it("highlights record identity instead of selection, regardless of column order", () => {
  for (const cells of [
    '<td data-column="selection"><input type="checkbox" /></td><td data-column="name">private name</td>',
    '<td data-column="updated">date</td><td data-column="name">private name</td><td data-column="selection"><input type="checkbox" /></td>',
  ]) {
    const result = plan(
      "/sample/prompts",
      `<header data-page-help="header"></header><table><tr data-row-key="private">${cells}</tr></table>`,
    );
    expect(
      result.steps.find((step) => step.id === "records")?.target.dataset.column,
    ).toBe("name");
  }
});
it("starts directly at an error and keeps simple settings help to one step", () => {
  expect(
    plan(
      "/runs",
      '<div data-page-help-state="error"><p>private connection error</p></div>',
    ).steps.map((s) => s.id),
  ).toEqual(["state"]);
  expect(
    plan(
      "/settings/appearance",
      '<section data-settings-section="appearance"><section data-settings-card><div>Appearance</div><button>Dark</button></section></section>',
    ).steps.map((s) => s.id),
  ).toEqual(["content"]);
});
it("explains the actual selected tab and missing prompt evidence without reading customer text", () => {
  for (const [route, tab, expected] of [
    ["runs/id", "calls", "Execution follows"],
    ["sessions/id", "state", "State shows"],
    ["sessions/id", "metadata", "Metadata shows"],
    ["interrupts/id", "payload", "Payload shows"],
    ["evals/cases/run/case/compare", "candidate", "baseline is hidden"],
  ]) {
    const result = plan(
      `/sample/${route}`,
      `<header data-page-help="header"></header><div data-detail-tab-content="${tab}" aria-hidden="false">private</div>`,
    );
    expect(result.steps.at(-1)?.content).toContain(expected);
    expect(result.steps.at(-1)?.title).not.toBe("Read the selected view");
  }
  const empty = plan(
    "/sample/prompts/id?tab=reviews",
    '<div data-prompt-detail-id="id"><div data-prompt-header></div><div data-page-help="prompt-content" data-guide-empty="true"></div></div>',
  );
  expect(empty.steps.at(-1)?.content).toContain("no recorded entries");
});

it("explains preference ownership, recovery and isolated sample choices", () => {
  const html =
    '<header data-page-help="header"></header><div data-table-controls="runs"></div>';
  const real = plan("/runs", html).steps.find((step) => step.id === "controls");
  expect(real?.content).toContain("Cloud views belong to you in this project");
  expect(real?.content).toContain("retry or reload");
  const sample = plan("/sample/runs", html).steps.find(
    (step) => step.id === "controls",
  );
  expect(sample?.content).toContain("stay in this browser, separately");
  expect(sample?.content).not.toContain("Cloud views");
});

it("uses authored edition settings help without reading account or table data", () => {
  const result = plan(
    "/projects/prj_0123456789abcdef01234567/settings/members",
    `<section data-settings-card data-page-help-topic="true" data-page-help-title="Team collaboration" data-page-help-description="Team invitations are not available yet." data-page-help-documentation="https://kortyx.io/docs/cloud/workspaces#feature-availability"><div>private-account@example.test</div><p>private-customer-data</p></section>`,
  );
  expect(result.steps).toHaveLength(1);
  expect(result.steps[0]).toMatchObject({
    title: "Team collaboration",
    content: "Team invitations are not available yet.",
  });
  expect(result.documentationUrl).toBe(
    "https://kortyx.io/docs/cloud/workspaces#feature-availability",
  );
  expect(JSON.stringify(result.steps)).not.toMatch(
    /private-account|private-customer/,
  );
});

it("uses authored setup help and rejects untrusted documentation destinations", () => {
  for (const destination of [
    "javascript:alert(1)",
    "https://example.test/docs/cloud",
    "https://kortyx.io.evil.test/docs/cloud",
    "not a URL",
  ]) {
    const result = plan(
      "/onboarding",
      `<section data-page-help-topic="true" data-page-help-title="Set up your workspace" data-page-help-description="The key step is optional." data-page-help-documentation="${destination}"></section>`,
    );
    expect(result.steps.at(-1)?.content).toBe("The key step is optional.");
    expect(result.documentationUrl).toBeUndefined();
  }
});

it("explains the conversation results inside the evaluation workspace", () => {
  const result = plan(
    "/evals/evaluations/id?suiteRun=suite&evalTab=cases",
    `<header data-page-help="header"></header><div data-eval-run-id="suite"><button data-page-help="suite-details"></button><div data-detail-tab-content="cases" aria-hidden="false"><table><tbody><tr data-row-key="case"><td>private</td></tr></tbody></table></div></div>`,
  );
  expect(result.id).toBe("eval-run");
  expect(result.steps[0]?.target.dataset.pageHelp).toBe("suite-details");
  expect(result.steps.at(-1)?.content).toContain(
    "Each row represents one conversation",
  );
  expect(result.steps.at(-1)?.content).toContain("Repetition dropdown");
});

it("explains suite details in the open inspector instead of the results underneath", () => {
  document.body.innerHTML = `<main data-studio-page="true"><div data-eval-run-id="suite"><div data-detail-tab-content="cases" aria-hidden="false"></div></div></main><section data-detail-inspector data-state="open"><section data-suite-details-section="context" data-detail-tab-content="context" aria-hidden="false"><h3 data-page-help="header">Configuration</h3><dl data-guide-focus="eval-configuration"><dt>Run ID</dt><dd>private-id</dd></dl></section></section>`;
  const result = createPageHelpPlan(
    new URL(
      "https://studio.example/evals/evaluations/id?suiteRun=suite&evalTab=context",
    ),
  );
  const inspector = document.querySelector("[data-detail-inspector]");
  expect(result.id).toBe("eval-run");
  expect(result.steps.every((step) => inspector?.contains(step.target))).toBe(
    true,
  );
  expect(result.steps.at(-1)?.title).toBe("Configuration");
  expect(result.steps.at(-1)?.content).not.toContain("private-id");
});

it("explains the instruction reader without reading instruction content", () => {
  const result = plan(
    "/sample/evals/judges/target/app?suiteId=suite",
    '<section data-judge-instructions><header data-judge-instructions-context>private judge</header><input type="search" /><article aria-label="Judge instruction text">private instructions</article></section>',
  );
  expect(result.title).toBe("Judge instructions");
  expect(result.steps.map((step) => step.id)).toEqual([
    "overview",
    "controls",
    "content",
  ]);
  expect(
    JSON.stringify(result.steps.map(({ content }) => content)),
  ).not.toContain("private");
});
