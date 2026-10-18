// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { feature } = vi.hoisted(() => ({ feature: vi.fn() }));
vi.mock("@/usage/client", () => ({ studioFeature: feature }));
vi.mock("@/lib/scoped-navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("react-joyride", () => ({
  EVENTS: {},
  STATUS: {},
  useJoyride: () => ({
    Tour: <section aria-label="Current page guide">Guide stays here</section>,
  }),
}));

import { PageHelp } from "./page-help";

let root: Root;
let container: HTMLDivElement;
const close = vi.fn();
const example = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(10, 80, 650, 100),
  );
  window.history.replaceState(null, "", "/runs?status=failed");
  document.body.innerHTML = `<main data-studio-page="true"><header data-page-help="header"></header><div data-page-help-records="0"></div></main>`;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function render(visible = false, available = true) {
  await act(async () =>
    root.render(
      <PageHelp
        sample={false}
        available={available}
        visible={visible}
        onClose={close}
        onExample={example}
      />,
    ),
  );
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(
    (node) => node.textContent === text,
  );
  if (!button) throw new Error(`Missing ${text}`);
  await act(async () => button.click());
}
it("asks before opening or showing a sample, and can explain an empty page in place", async () => {
  await render();
  expect(document.body.textContent).toContain("No records are visible here");
  expect(document.body.textContent).toContain("show the sample project");
  expect(example).not.toHaveBeenCalled();
  await click("Explain this page");
  expect(
    document.querySelector('[aria-label="Current page guide"]'),
  ).not.toBeNull();
  expect(window.location.pathname + window.location.search).toBe(
    "/runs?status=failed",
  );
  expect(example).not.toHaveBeenCalled();
});
it("opens a sample only after the explicit example choice", async () => {
  await render(true);
  await click("Open sample example");
  expect(example).toHaveBeenCalledExactlyOnceWith("runs");
  expect(feature).toHaveBeenCalledWith("studio.help", {
    help_action: "example_accept",
    help_page: "runs",
    help_context: "real",
  });
});
it("explains populated real pages immediately and works when sample access is unavailable", async () => {
  document
    .querySelector("[data-page-help-records]")
    ?.setAttribute("data-page-help-records", "1");
  await render();
  expect(
    document.querySelector('[aria-label="Current page guide"]'),
  ).not.toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(example).not.toHaveBeenCalled();
});
it("keeps page help available without access to the sample project", async () => {
  await render(false, false);
  expect(
    document.querySelector('[aria-label="Current page guide"]'),
  ).not.toBeNull();
  expect(example).not.toHaveBeenCalled();
});
