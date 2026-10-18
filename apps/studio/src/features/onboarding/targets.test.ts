// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  findLessonTarget,
  isLessonTargetReady,
  lessonTargetReady,
  prepareLessonTarget,
} from "./targets";

const destination = () => new URL(window.location.href);
function target(parent = document.body) {
  const element = document.createElement("div");
  element.dataset.testTarget = "true";
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
    new DOMRect(10, 100, 300, 40),
  );
  parent.append(element);
  return element;
}
afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});
it("accepts equivalent query order but waits for the intended tab and record", () => {
  target();
  window.history.replaceState(
    null,
    "",
    "/sample/runs/example?tab=trace&view=detail",
  );
  expect(
    lessonTargetReady(
      "[data-test-target]",
      new URL(
        "/sample/runs/example?view=detail&tab=trace",
        window.location.origin,
      ),
    ),
  ).toBe(true);
  expect(
    lessonTargetReady(
      "[data-test-target]",
      new URL(
        "/sample/runs/other?view=detail&tab=trace",
        window.location.origin,
      ),
    ),
  ).toBe(false);
  expect(
    lessonTargetReady(
      "[data-test-target]",
      new URL("/sample/runs/example?tab=model-io", window.location.origin),
    ),
  ).toBe(false);
});
it("does not accept hidden targets or a drawer still sliding in", () => {
  const drawer = document.createElement("section");
  drawer.dataset.detailDrawer = "/runs/example";
  drawer.dataset.state = "open";
  drawer.style.zIndex = "50";
  const getAnimations = vi.fn(() => [{ playState: "running" }]);
  Object.assign(drawer, { getAnimations });
  document.body.append(drawer);
  const element = target(drawer);
  expect(lessonTargetReady("[data-test-target]", destination())).toBe(false);
  getAnimations.mockReturnValue([]);
  expect(lessonTargetReady("[data-test-target]", destination())).toBe(true);
  element.setAttribute("aria-hidden", "true");
  expect(lessonTargetReady("[data-test-target]", destination())).toBe(false);
  element.removeAttribute("aria-hidden");
  drawer.dataset.state = "closed";
  expect(lessonTargetReady("[data-test-target]", destination())).toBe(false);
});
it("waits for an offscreen target to settle within the viewport", () => {
  const element = target();
  vi.mocked(element.getBoundingClientRect).mockReturnValue(
    new DOMRect(window.innerWidth - 20, 100, 300, 40),
  );
  expect(lessonTargetReady("[data-test-target]", destination())).toBe(false);
  vi.mocked(element.getBoundingClientRect).mockReturnValue(
    new DOMRect(10, 100, 300, 40),
  );
  expect(lessonTargetReady("[data-test-target]", destination())).toBe(true);
});
it("rejects background content while permitting the top drawer or a comparison above it", () => {
  const lower = document.createElement("section");
  lower.dataset.detailDrawer = "/runs/first";
  lower.dataset.state = "open";
  lower.style.zIndex = "50";
  Object.assign(lower, { getAnimations: () => [] });
  const upper = lower.cloneNode() as HTMLElement;
  upper.dataset.detailDrawer = "/runs/second";
  upper.style.zIndex = "60";
  Object.assign(upper, { getAnimations: () => [] });
  document.body.append(lower, upper);
  const element = target(lower);
  expect(lessonTargetReady("[data-test-target]", destination())).toBe(false);
  upper.append(element);
  expect(lessonTargetReady("[data-test-target]", destination())).toBe(true);
  const comparison = document.createElement("div");
  comparison.dataset.slot = "dialog-content";
  comparison.style.zIndex = "410";
  document.body.append(comparison);
  comparison.append(element);
  expect(lessonTargetReady("[data-test-target]", destination())).toBe(true);
});

it("selects the foreground copy after a detail reload and intercepted navigation", () => {
  const background = target();
  const drawer = document.createElement("section");
  drawer.dataset.detailDrawer = "/prompts/example";
  drawer.dataset.state = "open";
  drawer.style.zIndex = "50";
  Object.assign(drawer, { getAnimations: () => [] });
  document.body.append(drawer);
  const foreground = target(drawer);
  expect(document.querySelector("[data-test-target]")).toBe(background);
  expect(findLessonTarget("[data-test-target]")).toBe(foreground);
  expect(lessonTargetReady("[data-test-target]", destination())).toBe(true);
  drawer.dataset.state = "closed";
  expect(findLessonTarget("[data-test-target]")).toBe(background);
});

it("rejects a row clipped behind a table header and scrolls within its own viewport", () => {
  const viewport = document.createElement("div");
  viewport.style.overflowY = "auto";
  viewport.style.overflowX = "auto";
  document.body.append(viewport);
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
    new DOMRect(10, 200, 600, 400),
  );
  viewport.scrollTop = 188;
  const row = target(viewport);
  vi.mocked(row.getBoundingClientRect).mockImplementation(
    () => new DOMRect(20, 268 - viewport.scrollTop, 300, 40),
  );
  expect(isLessonTargetReady(row)).toBe(false);
  expect(prepareLessonTarget(row)).toBe(true);
  expect(viewport.scrollTop).toBe(56);
  expect(row.getBoundingClientRect().top).toBe(212);
});
it("brings a horizontally scrolled identity cell into the table viewport", () => {
  const viewport = document.createElement("div");
  viewport.style.overflowY = "auto";
  viewport.style.overflowX = "auto";
  document.body.append(viewport);
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
    new DOMRect(10, 200, 600, 400),
  );
  const cell = target(viewport);
  vi.mocked(cell.getBoundingClientRect).mockImplementation(
    () => new DOMRect(700 - viewport.scrollLeft, 240, 300, 40),
  );
  expect(isLessonTargetReady(cell)).toBe(false);
  expect(prepareLessonTarget(cell)).toBe(true);
  expect(cell.getBoundingClientRect().left).toBe(10);
});
