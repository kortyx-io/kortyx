// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSamplePrompts } from "@/features/sample-project/prompts";
import { PromptDiff } from "./prompt-diff";

let root: Root;
let container: HTMLDivElement;
const onClose = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function render(tour = false) {
  const [before, after] = createSamplePrompts().detail.versions;
  if (!before || !after) throw new Error("Missing sample prompt versions");
  if (tour) {
    const controls = document.createElement("button");
    controls.dataset.studioTour = "true";
    controls.textContent = "Next";
    document.body.append(controls);
    controls.focus();
  }
  await act(async () => {
    root.render(
      <PromptDiff
        before={before.content}
        after={after.content}
        beforeLabel="v1"
        afterLabel="v2"
        modal={false}
        comparisonId="sample:1:2"
        onClose={onClose}
      />,
    );
  });
}
it("keeps tour focus and does not dismiss the comparison when its controls receive focus", async () => {
  await render(true);
  const controls =
    document.querySelector<HTMLButtonElement>("[data-studio-tour]");
  expect(document.activeElement).toBe(controls);
  expect(
    document.querySelector(
      '[data-slot="dialog-content"] [data-prompt-comparison]',
    ),
  ).not.toBeNull();
  await act(() => {
    document
      .querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')
      ?.focus();
    controls?.focus();
  });
  expect(onClose).not.toHaveBeenCalled();
});
it("continues to dismiss a normal comparison on outside focus", async () => {
  await render();
  const outside = document.createElement("button");
  document.body.append(outside);
  await act(() => outside.focus());
  expect(onClose).toHaveBeenCalledOnce();
});
