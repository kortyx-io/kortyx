import type { EvalProgress, EvalSuite } from "@kortyx/agent";
import { createEvals } from "@kortyx/agent";
import { afterEach, expect, it, vi } from "vitest";
import { createEvalTerminalReporter } from "../src/evals/reporter";

const suite: EvalSuite = {
  id: "catalog",
  name: "Product catalog",
  cases: ["products", "pricing"].map((id) => ({
    id,
    name: `Show ${id}`,
    steps: [
      { message: "Show products", expect: { type: "answer" } },
      { message: "More", expect: { type: "answer" } },
    ],
  })),
};
const runStart: EvalProgress = {
  type: "run-started",
  caseIds: ["products", "pricing"],
  repetitions: 2,
  concurrency: 2,
};
const start = (caseId: string, repetition = 1): EvalProgress => ({
  type: "case-started",
  caseId,
  repetition,
  sessionId: "fixture",
});
// biome-ignore lint/suspicious/noControlCharactersInRegex: Remove known ANSI sequences from terminal test output.
const ansi = /\u001b\[[0-9;]*[A-Za-z]/g;
const strip = (output: string) => output.replace(ansi, "");
function harness(color = true, columns = 100) {
  const write = vi.fn();
  const reporter = createEvalTerminalReporter(write, color, {
    columns: () => columns,
  });
  reporter.start(suite);
  return {
    reporter,
    write,
    output: () => write.mock.calls.map(([value]) => value).join(""),
  };
}
afterEach(() => vi.useRealTimers());

it("animates long calls, keeps concurrent attempts distinct, and stops its timer on close", () => {
  vi.useFakeTimers();
  const h = harness();
  h.reporter.progress(runStart);
  h.reporter.progress(start("products"));
  h.reporter.progress(start("pricing", 2));
  h.reporter.progress({
    type: "case-progress",
    caseId: "products",
    repetition: 1,
    phase: "grading",
    stepIndex: 1,
  });
  vi.advanceTimersByTime(1200);
  const output = strip(h.output());
  expect(output).toContain("0/4 · 0%");
  expect(output).toContain("2 running · 2 queued");
  expect(output).toContain("Show products #1");
  expect(output).toContain("Show pricing #2");
  expect(output).toContain("Step 2/2 · Checking expectations · 1.2s");
  h.reporter.close();
  const count = h.write.mock.calls.length;
  vi.advanceTimersByTime(1000);
  expect(h.write.mock.calls).toHaveLength(count);
  expect(vi.getTimerCount()).toBe(0);
});

it("pauses rendering around application logs and resumes without losing attempt state", () => {
  vi.useFakeTimers();
  const h = harness();
  h.reporter.progress(runStart);
  h.reporter.progress(start("products"));
  h.reporter.pause();
  const count = h.write.mock.calls.length;
  vi.advanceTimersByTime(500);
  expect(h.write.mock.calls).toHaveLength(count);
  h.reporter.resume();
  expect(strip(h.output())).toContain("Show products #1");
  h.reporter.close();
});

it("clips narrow live rows including wide and combining characters, and strips app cursor/bidi controls", () => {
  vi.useFakeTimers();
  const write = vi.fn();
  const reporter = createEvalTerminalReporter(write, true, {
    columns: () => 28,
  });
  const first = suite.cases[0];
  if (!first) throw new Error("Fixture required");
  reporter.start({
    ...suite,
    cases: [{ ...first, name: "商品商品商品商品商品 é\u001b[2J\u202E unsafe" }],
  });
  write.mockClear();
  reporter.progress(runStart);
  write.mockClear();
  reporter.progress(start("products"));
  const live = strip(write.mock.calls.at(-1)?.[0] ?? "");
  expect(live).toContain("…");
  expect(live).not.toContain("\u202E");
  for (const row of live.trimEnd().split("\n")) {
    const width = [...row].reduce(
      (size, char) =>
        size + (/\p{Mark}/u.test(char) ? 0 : /[商品]/u.test(char) ? 2 : 1),
      0,
    );
    expect(width).toBeLessThan(28);
  }
  reporter.close();
});

it("renders every passed step and attempt in plain output, with no animation or leaked timers", async () => {
  const h = harness(false);
  const evals = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    execute: () => ({
      observation: { type: "answer", text: "Products", structured: [] },
    }),
  });
  const result = await evals.run({
    suiteId: suite.id,
    includeActivity: true,
    onProgress: h.reporter.progress,
    repetitions: 2,
  });
  h.reporter.finish(result);
  expect(h.output()).toContain("2 tests · 4 attempts");
  expect(h.output()).toContain("products #2 · Step 2/2");
  expect(h.output()).toContain("pricing #1 · Step 1/2");
  expect(h.output()).toContain("4 passed");
  expect(h.output()).not.toContain("\u001b");
});

it("limits the active viewport without hiding the total active count and ignores unrelated phase updates", () => {
  const h = harness();
  h.reporter.progress(runStart);
  h.reporter.progress({
    type: "case-progress",
    caseId: "not-active",
    repetition: 1,
    phase: "execute",
  });
  for (let repetition = 1; repetition <= 8; repetition++)
    h.reporter.progress(start("products", repetition));
  expect(strip(h.output())).toContain("8 running");
  expect(strip(h.output())).toContain("+2 more running");
  h.reporter.close();
});

it("restarting a reporter clears old attempts and can finish an ungraded cancelled run", async () => {
  vi.useFakeTimers();
  const h = harness();
  h.reporter.progress(start("products"));
  h.reporter.start(suite);
  h.reporter.progress(runStart);
  expect(vi.getTimerCount()).toBe(1);
  const result = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    execute: () => ({
      observation: { type: "answer", text: "", structured: [] },
    }),
  }).run({ suiteId: suite.id });
  result.status = "ungraded";
  result.counts.ungraded = 2;
  h.reporter.finish(result);
  expect(strip(h.output())).toContain("SUITE UNGRADED");
  expect(strip(h.output())).toContain("2 ungraded");
  expect(vi.getTimerCount()).toBe(0);
});

it("prints an ungraded attempt and late unknown step evidence without inventing a passing verdict", async () => {
  const h = harness(false);
  const result = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    execute: () => ({
      observation: { type: "answer", text: "", structured: [] },
    }),
  }).run({ suiteId: suite.id });
  const item = result.cases[0];
  const step = item?.steps[0];
  if (!item || !step) throw new Error("Fixture required");
  h.reporter.progress(start("external-case"));
  h.reporter.progress({
    type: "step-completed",
    caseId: "late-case",
    repetition: 1,
    step,
  });
  h.reporter.progress({
    type: "case-completed",
    result: { ...item, status: "ungraded" },
  });
  expect(h.output()).toContain("external-case [external-case] #1 RUNNING");
  expect(h.output()).toContain("late-case #1 · Step 1/?");
  expect(h.output()).toContain("◇ Show products");
  expect(h.output()).toContain("UNGRADED");
  h.reporter.close();
});

it("uses a cancelled suite verdict and yellow cancellation counts instead of a success banner", async () => {
  const h = harness();
  const controller = new AbortController();
  controller.abort();
  const result = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
  }).run({
    suiteId: suite.id,
    signal: controller.signal,
    includeActivity: true,
    onProgress: h.reporter.progress,
  });
  h.reporter.finish(result);
  expect(strip(h.output())).toContain("SUITE CANCELLED");
  expect(strip(h.output())).toContain("2 cancelled");
  expect(strip(h.output())).not.toContain("SUITE PASSED");
});
