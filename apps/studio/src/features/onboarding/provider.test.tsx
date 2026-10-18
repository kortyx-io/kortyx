// @vitest-environment jsdom
import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PageHelpProps } from "./page-help";
import type { RuntimeProps } from "./runtime";

const { feature, replace } = vi.hoisted(() => ({
  feature: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/usage/client", () => ({ studioFeature: feature }));
vi.mock("@/lib/scoped-navigation", () => ({
  usePathname: () => "/runs",
  useRouter: () => ({ replace }),
}));
vi.mock("./runtime", () => ({
  LearningRuntime: (props: RuntimeProps) => {
    const initial = useRef(props);
    useEffect(() => {
      initial.current.onStart();
      initial.current.onStep(initial.current.initialStep);
    }, []);
    return (
      <section aria-label="Mock tour runtime">
        <output data-active-chapter={props.chapter}>{props.initialStep}</output>
        <button type="button" onClick={() => props.onEnd("completed")}>
          Finish fixture chapter
        </button>
        <button type="button" onClick={() => props.onEnd("skipped")}>
          Skip fixture chapter
        </button>
        <button type="button" onClick={() => props.onStep("failure-trace")}>
          Checkpoint trace
        </button>
        <button type="button" onClick={props.onExit}>
          Exit fixture tour
        </button>
        <button type="button" onClick={() => props.onEnd("failed")}>
          Fail fixture target
        </button>
      </section>
    );
  },
}));
vi.mock("./page-help", () => ({
  PageHelp: (props: PageHelpProps) => (
    <section data-page-help-runtime="true">
      <button type="button" onClick={props.onClose}>
        Close page guide
      </button>
    </section>
  ),
}));

import * as navigation from "./navigation";
import {
  checkpoint,
  emptyProgress,
  PROGRESS_KEY,
  startChapter,
} from "./progress";
import { LearningControls, LearningProvider } from "./provider";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
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
async function render(sample = true, available = true) {
  await act(async () =>
    root.render(
      <LearningProvider
        sample={sample}
        visible
        available={available}
        returnTo="/runs"
      >
        <LearningControls />
      </LearningProvider>,
    ),
  );
}
function button(text: string) {
  const node = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === text,
  );
  if (!node) throw new Error(`Button not found: ${text}`);
  return node;
}
async function click(text: string) {
  if (text === "Explore Studio" || text === "Explain this page") {
    await act(async () => {
      button("Explore").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((element) => element.textContent?.trim() === text);
    if (!item) throw new Error("Explore Studio menu item not found");
    await act(async () => {
      item.click();
      await new Promise(requestAnimationFrame);
      await vi.dynamicImportSettled();
    });
    return;
  }
  await act(async () => {
    button(text).click();
    await new Promise(requestAnimationFrame);
    await vi.dynamicImportSettled();
  });
}
const active = () => document.querySelector("[data-active-chapter]");

it.each([
  ["Resume", "resume-chapter", "failure-trace"],
  ["Restart", "chapter", "find-failed-run"],
] as const)("%s from a real page preserves the chosen chapter intent across sample entry", async (action, intent, expectedStep) => {
  const trace = checkpoint(
    startChapter(emptyProgress(), "debug-execution", "chapter"),
    "failure-trace",
  );
  // Another chapter is the global resume point: the card owns its checkpoint.
  const saved = startChapter(trace, "approvals", "chapter");
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(saved));
  const prepare = navigation.prepareSampleTour;
  let destination = "";
  const transfer = vi
    .spyOn(navigation, "prepareSampleTour")
    .mockImplementation(async (input) => {
      const result = await prepare(input, async () => new Response("{}"));
      destination = result.href;
      // Intercept only the native navigation boundary, retaining serialization.
      throw new Error("Navigation intercepted by test");
    });
  await render(false);
  await click("Explore Studio");
  const card = document.querySelector(
    '[data-learning-chapter="debug-execution"]',
  );
  const control = card?.querySelector<HTMLButtonElement>(
    `[aria-label="${action} Debug a failed run"]`,
  );
  expect(control).not.toBeNull();
  await act(async () => {
    control?.click();
    await vi.dynamicImportSettled();
  });
  expect(destination).toBe(
    `/sample/runs?learn=${intent}&chapter=debug-execution`,
  );
  expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}")).toEqual(saved);
  transfer.mockRestore();
  await act(async () => root.unmount());
  root = createRoot(container);
  const originalUrl = window.location.href;
  try {
    window.history.replaceState({}, "", destination);
    await render();
    await act(async () => vi.dynamicImportSettled());
    expect(active()?.getAttribute("data-active-chapter")).toBe(
      "debug-execution",
    );
    expect(active()?.textContent).toBe(expectedStep);
  } finally {
    window.history.replaceState({}, "", originalUrl);
  }
});

it("offers every guide in a scrollable library with fixed actions without launching a tour", async () => {
  await render();
  expect(active()).toBeNull();
  expect(feature).not.toHaveBeenCalled();
  await click("Explore Studio");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Quick orientation",
  );
  expect(document.body.textContent).toContain("Inspect prompt versions");
  expect(document.body.textContent).toContain("Personalize Studio");
  expect(document.body.textContent).toContain(
    "Investigate an error diagnostic",
  );
  expect(document.body.textContent).toContain(
    "Understand an evaluation in progress",
  );
  expect(document.body.textContent).not.toContain("More to explore");
  expect(document.body.textContent).not.toContain("Ready for your own data?");
  const scroll = document.querySelector("[data-learning-scroll]");
  const footer = document.querySelector("[data-learning-footer]");
  expect(scroll?.querySelectorAll("[data-learning-chapter]")).toHaveLength(9);
  expect(footer?.contains(button("Take the full tour"))).toBe(true);
  expect(scroll?.contains(footer)).toBe(false);
  expect(scroll?.contains(document.querySelector('[role="heading"][id]'))).toBe(
    false,
  );
  expect(active()).toBeNull();
});
it("offers page help and documentation through the single Explore menu", async () => {
  await render();
  expect(
    document.querySelectorAll('[data-learning-launcher="true"]'),
  ).toHaveLength(1);
  await act(async () => {
    button("Explore").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  const items = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ];
  expect(items.map((item) => item.textContent?.trim())).toEqual([
    "Explore Studio",
    "Explain this page",
    "Documentation",
  ]);
  const docs = items.find((item) => item.textContent === "Documentation");
  expect(docs?.getAttribute("href")).toBe("https://kortyx.io/docs");
  expect(docs?.getAttribute("target")).toBe("_blank");
  const explain = items.find(
    (item) => item.textContent === "Explain this page",
  );
  await act(async () => {
    explain?.click();
    await new Promise(requestAnimationFrame);
    await vi.dynamicImportSettled();
  });
  expect(document.querySelector("[data-page-help-runtime]")).not.toBeNull();
  expect(active()).toBeNull();
});
it("explains real pages without sample access or changing saved walkthrough progress", async () => {
  const saved = checkpoint(
    startChapter(emptyProgress(), "debug-execution", "full"),
    "failure-trace",
  );
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(saved));
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  await render(false, false);
  await click("Explain this page");
  expect(document.querySelector("[data-page-help-runtime]")).not.toBeNull();
  expect(request).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}")).toEqual(saved);
  await click("Close page guide");
  expect(document.querySelector("[data-page-help-runtime]")).toBeNull();
});
it("runs the full queue with chapter breaks, pause/resume and honest skip totals", async () => {
  await render();
  await click("Explore Studio");
  await click("Take the full tour");
  expect(active()?.getAttribute("data-active-chapter")).toBe(
    "sample-execution",
  );
  await click("Finish fixture chapter");
  expect(
    document.querySelector('[aria-label="Chapter result"]')?.textContent,
  ).toContain("Next: Debug a failed run");
  await click("Continue");
  expect(active()?.getAttribute("data-active-chapter")).toBe("debug-execution");
  await click("Checkpoint trace");
  await click("Exit fixture tour");
  expect(active()).toBeNull();
  await click("Explore Studio");
  await click("Resume tour");
  expect(active()?.textContent).toBe("failure-trace");
  await click("Skip fixture chapter");
  await click("Continue");
  for (const id of [
    "conversation",
    "approvals",
    "prompt-versions",
    "evaluation-results",
  ]) {
    expect(active()?.getAttribute("data-active-chapter")).toBe(id);
    await click("Finish fixture chapter");
    if (id !== "evaluation-results") await click("Continue");
  }
  expect(
    document.querySelector('[aria-label="Tour result"]')?.textContent,
  ).toContain("5 chapters completed · 1 skipped");
  expect(
    feature.mock.calls.filter(
      ([, properties]) => properties.sample_action === "tour_full_partial",
    ),
  ).toHaveLength(1);
  expect(
    feature.mock.calls.some(
      ([, properties]) => properties.sample_action === "tour_full_complete",
    ),
  ).toBe(false);
  expect(
    JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}").resume,
  ).toBeNull();
});
it("restores checkpoints after a new mount without opening an overlay automatically", async () => {
  const progress = checkpoint(
    startChapter(emptyProgress(), "debug-execution", "full"),
    "failure-trace",
  );
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  await render();
  expect(active()).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Explore Studio");
  await click("Resume tour");
  expect(active()?.textContent).toBe("failure-trace");
});
it("missing targets remain resumable and are never marked completed", async () => {
  await render();
  await click("Explore Studio");
  await click("Take the full tour");
  await click("Fail fixture target");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Your place is saved",
  );
  const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}");
  expect(saved.chapters["sample-execution"].status).toBe("in-progress");
  await click("Resume tour");
  expect(active()?.getAttribute("data-active-chapter")).toBe(
    "sample-execution",
  );
});
it("blocked storage preserves useful progress in memory and does not prevent replay", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  await render();
  await click("Explore Studio");
  expect(document.body.textContent).toContain(
    "progress will last only for this visit",
  );
  await click("Take the full tour");
  await click("Exit fixture tour");
  await click("Explore Studio");
  await click("Resume tour");
  expect(active()?.getAttribute("data-active-chapter")).toBe(
    "sample-execution",
  );
});
it("can finish every chapter without reporting skips", async () => {
  await render();
  await click("Explore Studio");
  await click("Take the full tour");
  for (let index = 0; index < 6; index++) {
    await click("Finish fixture chapter");
    if (index < 5) await click("Continue");
  }
  expect(
    document.querySelector('[aria-label="Tour result"]')?.textContent,
  ).toContain("6 chapters completed · 0 skipped");
  expect(
    feature.mock.calls.filter(
      ([, properties]) => properties.sample_action === "tour_full_complete",
    ),
  ).toHaveLength(1);
  expect(
    feature.mock.calls.filter(
      ([, properties]) => properties.sample_action === "tour_start",
    ),
  ).toHaveLength(6);
});

it("resumes at a chapter break after reload instead of replaying the completed chapter", async () => {
  const { finishChapter } = await import("./progress");
  localStorage.setItem(
    PROGRESS_KEY,
    JSON.stringify(
      finishChapter(
        startChapter(emptyProgress(), "sample-execution", "full"),
        "completed",
      ),
    ),
  );
  await render();
  expect(active()).toBeNull();
  await click("Explore Studio");
  await click("Resume tour");
  expect(
    document.querySelector('[aria-label="Chapter result"]')?.textContent,
  ).toContain("Next: Debug a failed run");
  await click("Continue");
  expect(active()?.getAttribute("data-active-chapter")).toBe("debug-execution");
});

it("reset requires an explicit second action and never changes sample visibility", async () => {
  localStorage.setItem(
    PROGRESS_KEY,
    JSON.stringify(startChapter(emptyProgress(), "approvals", "chapter")),
  );
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  await render();
  await click("Explore Studio");
  await click("Reset tour progress");
  expect(
    JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}").resume,
  ).not.toBeNull();
  await click("Reset progress");
  expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}")).toEqual(
    emptyProgress(),
  );
  expect(request).not.toHaveBeenCalled();
});
