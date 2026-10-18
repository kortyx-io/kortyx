// @vitest-environment jsdom
import { SAMPLE_PROJECT } from "@kortyx/telemetry-contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioRouteProvider } from "@/components/studio-route-provider";
import { formatDurationMs } from "@/lib/format";
import { EvalDuration } from "./eval-duration";

let root: Root;
let container: HTMLDivElement;
const startedAt = "2026-10-01T11:45:00.000Z";
const run = { status: "running", startedAt, endedAt: null };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("freezes sample durations at the dataset clock without a timer", async () => {
  await act(async () =>
    root.render(
      <StudioRouteProvider scope={{ sampleProject: true }}>
        <EvalDuration run={run} />
      </StudioRouteProvider>,
    ),
  );
  const expected = formatDurationMs(
    Date.parse(SAMPLE_PROJECT.referenceTime) - Date.parse(startedAt),
  );
  expect(container.textContent).toBe(expected);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(container.textContent).toBe(expected);
});
it("continues ticking for a real project", async () => {
  const currentStart = new Date(Date.now() - 1_000).toISOString();
  await act(async () =>
    root.render(
      <StudioRouteProvider scope={{ projectPublicId: "real-project" }}>
        <EvalDuration run={{ ...run, startedAt: currentStart }} />
      </StudioRouteProvider>,
    ),
  );
  expect(container.textContent).toBe(formatDurationMs(1_000));
  await act(async () => vi.advanceTimersByTime(2_000));
  expect(container.textContent).toBe(formatDurationMs(3_000));
});
