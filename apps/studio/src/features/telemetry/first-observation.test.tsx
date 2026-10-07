import { existsSync } from "node:fs";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { FirstObservation } from "./components/first-observation";

vi.mock("@/components/scoped-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));

it("left-aligns first-observation guidance inside the padded surface", () => {
  const html = renderToStaticMarkup(<FirstObservation resource="runs" />);
  expect(html).toContain('class="max-w-3xl space-y-8"');
  expect(html).not.toContain("mx-auto");
  expect(html).toContain("Observe your first run");
});

it.each([
  "runs",
  "sessions",
  "workflows",
  "interrupts",
  "evals",
])("%s waits for its final list view instead of flashing a guessed skeleton", (resource) => {
  expect(
    existsSync(new URL(`../../app/${resource}/loading.tsx`, import.meta.url)),
  ).toBe(false);
});

it.each([
  "runs/[runId]",
  "sessions/[sessionId]",
  "interrupts/[interruptId]",
])("keeps loading feedback for the %s detail page", (detail) => {
  expect(
    existsSync(new URL(`../../app/${detail}/loading.tsx`, import.meta.url)),
  ).toBe(true);
});
