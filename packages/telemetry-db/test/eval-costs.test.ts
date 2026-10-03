import type { EvalStepResult } from "@kortyx/agent/evals";
import { describe, expect, it } from "vitest";
import {
  calculateEvalAttemptCosts,
  sumEvalCosts,
} from "../src/repositories/eval-costs";
import type { TelemetryEventRecord } from "../src/schema";

const generation = (eventId: string, micros: number | null, currency = "USD") =>
  ({
    eventId,
    type: "generation.completed",
    occurredAt: new Date("2026-10-03T00:00:00Z"),
    payload:
      micros === null
        ? {
            provider: "unlisted",
            model: "unlisted",
            usage: { input: 20, output: 10 },
          }
        : {
            pricing: { source: "provider", currency, actualCostMicros: micros },
          },
  }) as TelemetryEventRecord;
const step = (overrides: Partial<EvalStepResult> = {}): EvalStepResult => ({
  index: 0,
  input: { message: "Look up the product" },
  expectation: { type: "answer", criteria: ["Accurate product"] },
  observation: { type: "answer", text: "Product A", structured: [] },
  status: "passed",
  criteria: [
    {
      id: "0",
      text: "Accurate product",
      passed: true,
      reason: "Matches",
      evidence: [],
    },
  ],
  judgeCalls: 1,
  judgeUsage: [
    {
      provider: "openrouter",
      model: "test/model",
      occurredAt: "2026-10-03T00:00:00.000Z",
      pricing: { source: "provider", currency: "USD", actualCostMicros: 250 },
    },
  ],
  ...overrides,
});
const costs = (
  events = [generation("one", 1000)],
  steps = [step()],
  finished = true,
) =>
  calculateEvalAttemptCosts(
    { sessionId: "attempt", steps, finished },
    events,
    [],
  );

describe("eval billing evidence", () => {
  it("combines workflow calls and separate judge calls without rounding sub-cent amounts away", () => {
    expect(costs()).toMatchObject({
      workflow: { amount: 0.001, status: "complete" },
      judge: { amount: 0.00025, status: "complete" },
      total: {
        amount: 0.00125,
        calls: 2,
        status: "complete",
        estimated: false,
      },
    });
  });
  it("deduplicates replayed generation IDs and ignores non-billing span events", () => {
    expect(
      costs([
        generation("one", 1000),
        generation("one", 1000),
        { ...generation("span", 1000), type: "span.ended" },
      ]).workflow.calls,
    ).toBe(1);
  });
  it("counts child generations, retried calls and separate resume turns individually", () => {
    expect(
      costs([
        generation("parent", 1000),
        generation("child", 2000),
        generation("retry", 3000),
        generation("resumed", 4000),
      ]).workflow,
    ).toMatchObject({ amount: 0.01, calls: 4 });
  });
  it("keeps a known subtotal partial when one model has no price", () => {
    expect(
      costs([generation("priced", 1000), generation("unknown", null)]).total,
    ).toMatchObject({ amount: 0.00125, status: "partial", unpricedCalls: 1 });
  });
  it("does not treat absent workflow telemetry as zero", () => {
    expect(costs([])).toMatchObject({
      workflow: { amount: null, status: "unavailable" },
      total: { amount: 0.00025, status: "partial" },
    });
  });
  it("preserves explicitly reported free model calls", () => {
    expect(
      costs(
        [generation("free", 0)],
        [step({ judgeCalls: 0, judgeUsage: [], criteria: [] })],
      ).total,
    ).toMatchObject({ amount: 0, status: "complete" });
  });
  it("historical grades without usage are unknown, even when they passed", () => {
    expect(
      costs(undefined, [
        step({ judgeCalls: undefined, judgeUsage: undefined }),
      ]),
    ).toMatchObject({
      judge: { amount: null, status: "unavailable" },
      total: { status: "partial" },
    });
  });
  it("does not call a failed paid judge free simply because no verdict was recorded", () => {
    expect(
      costs(undefined, [
        step({ status: "error", criteria: [], judgeUsage: [] }),
      ]).judge,
    ).toMatchObject({ amount: null, status: "unavailable", unpricedCalls: 1 });
  });
  it("retains known billing for a malformed judge response", () => {
    expect(
      costs(undefined, [step({ status: "error", criteria: [] })]).judge,
    ).toMatchObject({ amount: 0.00025, calls: 1, status: "complete" });
  });
  it("is partial while execution or Studio grading is still running", () => {
    expect(costs(undefined, undefined, false).total.status).toBe("partial");
  });
  it("counts every criterion and every step rather than just the final grade", () => {
    const first = step();
    const second = step({
      index: 1,
      judgeCalls: 2,
      judgeUsage: [...(first.judgeUsage ?? []), ...(first.judgeUsage ?? [])],
    });
    expect(costs(undefined, [first, second]).judge).toMatchObject({
      amount: 0.00075,
      calls: 3,
    });
  });
  it("does not add EUR workflow charges to a USD judge charge", () => {
    expect(costs([generation("euro", 1000, "EUR")]).total).toMatchObject({
      amount: null,
      currency: null,
      status: "unavailable",
    });
  });
  it("sums integer micro-units so rolling up amounts does not introduce floating point artifacts", () => {
    const a = costs(
      [generation("workflow", 1200)],
      [
        step({
          judgeUsage: [
            {
              provider: "openrouter",
              model: "test",
              occurredAt: "2026-10-03T00:00:00.000Z",
              pricing: {
                source: "provider",
                currency: "USD",
                actualCostMicros: 300,
              },
            },
          ],
        }),
      ],
    );
    expect(a.total.amount).toBe(0.0015);
    expect(sumEvalCosts([a.total, a.total]).amount).toBe(0.003);
  });
  it("keeps missing costs visible when rolling multiple attempts up", () => {
    expect(sumEvalCosts([costs().total, costs([]).total])).toMatchObject({
      amount: 0.0015,
      status: "partial",
    });
  });
});
