import type {
  EvalCaseResult,
  EvalCostAmount,
  EvalCosts,
  EvalProgress,
  EvalRunResult,
  EvalStepResult,
} from "@kortyx/agent/evals";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import {
  type CalculatedCost,
  calculateGenerationCost,
} from "../pricing/calculate-cost";
import {
  evalRunEvents,
  type ModelRateCard,
  type TelemetryEventRecord,
  telemetryEvents,
} from "../schema";
import { listApplicableModelRateCards } from "./model-rate-cards";

type Scope = { organizationId: string; projectId: string };
type Source = {
  id: string;
  environment: string;
  status: string;
  result: EvalRunResult | null;
  events?: { event: EvalProgress }[];
};
type Attempt = {
  attemptId?: string | undefined;
  runtimeExecutions?: { sessionId: string; runId: string }[] | undefined;
  sessionId: string;
  steps: EvalStepResult[];
  finished: boolean;
};

/** Count each generation once across turns, retries and child workflows. */
export function sumEvalCosts(parts: EvalCostAmount[]): EvalCostAmount {
  const currencies = new Set(
    parts.filter((p) => p.amount !== null).map((p) => p.currency),
  );
  const known = parts.some((p) => p.amount !== null);
  const compatible = currencies.size <= 1;
  const complete = parts.every((p) => p.status === "complete") && compatible;
  return {
    amount:
      known && compatible
        ? parts.reduce(
            (sum, p) => sum + Math.round((p.amount ?? 0) * 1_000_000),
            0,
          ) / 1_000_000
        : null,
    currency: compatible ? ([...currencies][0] ?? "USD") : null,
    status: complete
      ? "complete"
      : known && compatible
        ? "partial"
        : "unavailable",
    calls: parts.reduce((sum, p) => sum + p.calls, 0),
    unpricedCalls: parts.reduce((sum, p) => sum + p.unpricedCalls, 0),
    estimated: parts.some((p) => p.estimated),
  };
}
function summarize(
  prices: CalculatedCost[],
  missing: number,
  finished: boolean,
): EvalCostAmount {
  const currencies = new Set(
    prices.filter((p) => p.cost !== null).map((p) => p.currency),
  );
  const priced = prices.filter((p) => p.costMicros !== null);
  const unpricedCalls = missing + prices.length - priced.length;
  const compatible = currencies.size <= 1;
  const known =
    priced.length > 0 || (prices.length === 0 && missing === 0 && finished);
  return {
    amount:
      known && compatible
        ? priced.reduce((sum, p) => sum + (p.costMicros ?? 0), 0) / 1_000_000
        : null,
    currency: compatible ? ([...currencies][0] ?? "USD") : null,
    status:
      known && compatible
        ? finished && unpricedCalls === 0
          ? "complete"
          : "partial"
        : "unavailable",
    calls: prices.length,
    unpricedCalls,
    estimated: prices.some(
      (p) => p.pricingStatus === "priced" && p.pricingSource !== "provider",
    ),
  };
}
export function calculateEvalAttemptCosts(
  attempt: Attempt,
  events: TelemetryEventRecord[],
  rates: ModelRateCard[],
): EvalCosts {
  const generations = [
    ...new Map(
      events
        .filter((e) => e.type === "generation.completed")
        .map((e) => [e.eventId, e]),
    ).values(),
  ];
  const workflow = summarize(
    generations.map((e) => calculateGenerationCost(e, rates)),
    attempt.attemptId
      ? Math.max(
          attempt.runtimeExecutions?.length ? 0 : 1,
          (attempt.runtimeExecutions ?? []).filter(
            (execution) =>
              !generations.some(
                (event) =>
                  event.runId === execution.runId &&
                  event.sessionId === execution.sessionId,
              ),
          ).length,
        )
      : generations.length
        ? 0
        : 1,
    attempt.finished,
  );
  const judgePrices: CalculatedCost[] = [];
  let missing = 0;
  for (const step of attempt.steps) {
    const usage = step.judgeUsage ?? [];
    // An attempted semantic grade without billing evidence is unknown, never free.
    const expected =
      step.judgeCalls ??
      (step.status === "ungraded"
        ? 0
        : step.criteria.length +
          (step.status === "error" && step.expectation.criteria?.length
            ? 1
            : 0));
    missing += Math.max(0, expected - usage.length);
    for (const record of usage)
      judgePrices.push(
        calculateGenerationCost(
          {
            type: "generation.completed",
            occurredAt: new Date(record.occurredAt),
            payload: {
              provider: record.provider,
              model: record.model,
              usage: record.usage,
              providerMetadata: record.pricingContext,
              pricing: record.pricing,
            },
          },
          rates,
        ),
      );
  }
  const judge = summarize(judgePrices, missing, attempt.finished);
  return { workflow, judge, total: sumEvalCosts([workflow, judge]) };
}
function attempts(source: Source): Map<string, Attempt> {
  const rows = new Map<string, Attempt>();
  const put = (item: EvalCaseResult) =>
    rows.set(`${item.caseId}:${item.repetition}`, {
      sessionId: item.sessionId,
      attemptId: item.attemptId,
      runtimeExecutions: item.runtimeExecutions,
      steps: item.steps,
      finished: item.status !== "ungraded",
    });
  for (const { event } of source.events ?? []) {
    if (event.type === "case-started")
      rows.set(`${event.caseId}:${event.repetition}`, {
        sessionId: event.sessionId,
        attemptId: event.attemptId,
        runtimeExecutions: [],
        steps: [],
        finished: false,
      });
    if (event.type === "case-runtime-associated") {
      const item = rows.get(`${event.caseId}:${event.repetition}`);
      if (
        item?.attemptId === event.attemptId &&
        !item.runtimeExecutions?.some(
          (execution) =>
            execution.runId === event.execution.runId &&
            execution.sessionId === event.execution.sessionId,
        )
      ) {
        item.runtimeExecutions ??= [];
        item.runtimeExecutions.push(event.execution);
      }
    }
    if (event.type === "step-completed") {
      const item = rows.get(`${event.caseId}:${event.repetition}`);
      if (item) {
        item.steps = [
          ...item.steps.filter((s) => s.index !== event.step.index),
          event.step,
        ];
      }
    }
    if (event.type === "case-completed") put(event.result);
  }
  for (const item of source.result?.cases ?? []) put(item);
  return rows;
}
/** New SDK attempts never fall back to session-wide billing. Historical attempts
 * retain their original session lookup. A reused session/run cannot transfer costs. */
export function matchesEvalAttempt(
  attempt: Attempt,
  event: TelemetryEventRecord,
): boolean {
  return attempt.attemptId
    ? event.payload.evalAttemptId === attempt.attemptId &&
        Boolean(
          attempt.runtimeExecutions?.some(
            (execution) =>
              execution.runId === event.runId &&
              execution.sessionId === event.sessionId,
          ),
        )
    : !event.payload.evalAttemptId && event.sessionId === attempt.sessionId;
}
/** Scope and environment are checked before matching per-attempt session identities. */
export async function loadEvalCosts(
  db: TelemetryDb,
  scope: Scope,
  sources: Source[],
) {
  const missingEvents = sources.filter((s) => !s.result && !s.events);
  const progress = missingEvents.length
    ? await db
        .select({ runId: evalRunEvents.runId, event: evalRunEvents.event })
        .from(evalRunEvents)
        .where(
          and(
            eq(evalRunEvents.organizationId, scope.organizationId),
            eq(evalRunEvents.projectId, scope.projectId),
            inArray(
              evalRunEvents.runId,
              missingEvents.map((s) => s.id),
            ),
          ),
        )
        .orderBy(asc(evalRunEvents.id))
    : [];
  const rows = sources.map((source) => ({
    source,
    attempts: attempts({
      ...source,
      events: source.events ?? progress.filter((p) => p.runId === source.id),
    }),
  }));
  const matches = rows.flatMap(({ source, attempts }) =>
    [...attempts.values()].flatMap((a) =>
      (a.attemptId
        ? (a.runtimeExecutions ?? [])
        : [{ sessionId: a.sessionId }]
      ).map((execution) => ({
        sessionId: execution.sessionId,
        runId: "runId" in execution ? execution.runId : undefined,
        attemptId: a.attemptId,
        environment: source.environment,
      })),
    ),
  );
  const filters = [
    ...new Map(matches.map((m) => [JSON.stringify(m), m])).values(),
  ];
  const [rates, events] = await Promise.all([
    listApplicableModelRateCards(db, scope),
    filters.length
      ? db
          .select()
          .from(telemetryEvents)
          .where(
            and(
              eq(telemetryEvents.organizationId, scope.organizationId),
              eq(telemetryEvents.projectId, scope.projectId),
              eq(telemetryEvents.type, "generation.completed"),
              or(
                ...filters.map((m) =>
                  and(
                    eq(telemetryEvents.environment, m.environment),
                    eq(telemetryEvents.sessionId, m.sessionId),
                    m.runId ? eq(telemetryEvents.runId, m.runId) : undefined,
                    m.attemptId
                      ? sql`${telemetryEvents.payload}->>'evalAttemptId' = ${m.attemptId}`
                      : undefined,
                  ),
                ),
              ),
            ),
          )
      : Promise.resolve([]),
  ]);
  return new Map(
    rows.map(({ source, attempts }) => {
      const caseCosts = Object.fromEntries(
        [...attempts].map(([key, attempt]) => [
          key,
          calculateEvalAttemptCosts(
            attempt,
            events.filter(
              (e) =>
                e.environment === source.environment &&
                matchesEvalAttempt(attempt, e),
            ),
            rates,
          ),
        ]),
      );
      const values = Object.values(caseCosts);
      const workflow = sumEvalCosts(values.map((c) => c.workflow));
      const judge = sumEvalCosts(values.map((c) => c.judge));
      // Empty/queued runs have no cost evidence, rather than a misleading zero.
      if (!values.length) {
        workflow.amount = null;
        workflow.status = "unavailable";
        judge.amount = null;
        judge.status = "unavailable";
      }
      if (["queued", "running"].includes(source.status)) {
        if (workflow.amount !== null) workflow.status = "partial";
        if (judge.amount !== null) judge.status = "partial";
      }
      return [
        source.id,
        {
          costs: { workflow, judge, total: sumEvalCosts([workflow, judge]) },
          caseCosts,
        },
      ];
    }),
  );
}
