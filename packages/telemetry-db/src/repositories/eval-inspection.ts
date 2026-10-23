import type { EvalInspectionQuery } from "@kortyx/agent/evals";
import { and, asc, eq, or, type SQL, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryNotFoundError, TelemetryValidationError } from "../errors";
import {
  evalRunEvents,
  evalRuns,
  evaluationRuns,
  telemetryEvents,
} from "../schema";
import { evalEvidenceText } from "./eval-inspection-redaction";
import { getEvalLiveSummaries } from "./eval-live";
import { getEvaluation } from "./evaluations";

type Scope = {
  organizationId: string;
  projectId: string;
  environment?: string | undefined;
};
const scopeFor = (scope: Scope) =>
  and(
    eq(evalRuns.organizationId, scope.organizationId),
    eq(evalRuns.projectId, scope.projectId),
    scope.environment ? eq(evalRuns.environment, scope.environment) : undefined,
  );
const page = (available: number, returned: number, cursor: number) => ({
  available,
  returned,
  omitted: available - returned,
  nextCursor: cursor + returned < available ? cursor + returned : null,
});

/** All transcript/evidence selection and slicing happens in SQL, before transfer. */
export async function inspectEvaluation(
  db: TelemetryDb,
  scope: Scope,
  id: string,
  query: EvalInspectionQuery,
) {
  const suites = await db
    .select({
      id: evalRuns.id,
      suiteId: evalRuns.suiteId,
      environment: evalRuns.environment,
      evaluationId: evalRuns.evaluationId,
    })
    .from(evalRuns)
    .where(
      and(
        scopeFor(scope),
        or(eq(evalRuns.evaluationId, id), eq(evalRuns.id, id)),
      ),
    )
    .orderBy(asc(evalRuns.id));
  const [parent] = await db
    .select({ id: evaluationRuns.id })
    .from(evaluationRuns)
    .where(
      and(
        eq(evaluationRuns.id, id),
        eq(evaluationRuns.organizationId, scope.organizationId),
        eq(evaluationRuns.projectId, scope.projectId),
        scope.environment
          ? eq(evaluationRuns.environment, scope.environment)
          : undefined,
      ),
    )
    .limit(1);
  if (!suites.length && !parent)
    throw new TelemetryNotFoundError("Evaluation not found.");
  const envelope = (
    data: unknown,
    paging: ReturnType<typeof page>,
    expand: Array<{ command: string; args: Record<string, string> }> = [],
  ) => ({
    inspectionVersion: 1 as const,
    id,
    view: query.view,
    data,
    page: paging,
    expand,
  });
  if (query.view === "overview") {
    const data = parent
      ? await getEvaluation(db, scope, id)
      : (await getEvalLiveSummaries(db, scope, [id]))[0];
    const live = await getEvalLiveSummaries(
      db,
      scope,
      suites.map((suite) => suite.id),
    );
    const failures = live.flatMap((run) =>
      run.cases
        .filter((item) => ["failed", "error"].includes(item.status))
        .map((item) => ({
          suiteRunId: run.id,
          caseId: item.caseId,
          repetition: item.repetition,
          status: item.status,
        })),
    );
    const {
      failures: _failures,
      cases: _cases,
      errors: _errors,
      ...overview
    } = (data ?? {}) as Record<string, unknown>;
    return envelope(
      {
        ...overview,
        failureInventory: {
          items: failures.slice(0, 50),
          ...page(failures.length, Math.min(failures.length, 50), 0),
        },
      },
      page(1, 1, 0),
      ["error", "failed"].map((status) => ({
        command: `kortyx studio evals attempts ${id}`,
        args: { status },
      })),
    );
  }
  const selected = suites.filter(
    (suite) =>
      !query.suite || query.suite === suite.id || query.suite === suite.suiteId,
  );
  if (query.view === "attempts") {
    const summaries = await getEvalLiveSummaries(
      db,
      scope,
      selected.map((suite) => suite.id),
    );
    const attempts = summaries
      .flatMap((run) =>
        run.cases.map((item) => ({
          ...item,
          suiteRunId: run.id,
          suiteId: run.suiteId,
        })),
      )
      .filter(
        (item) =>
          (!query.caseId || item.caseId === query.caseId) &&
          (!query.status || item.status === query.status) &&
          (!query.phase ||
            item.phase === query.phase ||
            item.errors.some((error) => error.phase === query.phase)) &&
          (!query.repetition || item.repetition === query.repetition),
      )
      .sort(
        (a, b) =>
          a.suiteRunId.localeCompare(b.suiteRunId) ||
          a.caseId.localeCompare(b.caseId) ||
          a.repetition - b.repetition,
      );
    const items = attempts.slice(query.cursor, query.cursor + query.limit);
    return envelope(
      items,
      page(attempts.length, items.length, query.cursor),
      items.map((item) => ({
        command: `kortyx studio evals turn ${id}`,
        args: {
          suite: item.suiteRunId,
          case: item.caseId,
          repetition: String(item.repetition),
          turn: "0",
        },
      })),
    );
  }
  if (selected.length !== 1 || !query.caseId || !query.repetition)
    throw new TelemetryValidationError(
      "Select one --suite, --case and --repetition before inspecting a turn or evidence.",
    );
  const suite = selected[0]!;
  const attemptMatch = sql`(item->>'caseId'=${query.caseId} AND (item->>'repetition')::integer=${query.repetition})`;
  const eventMatch = and(
    eq(evalRunEvents.organizationId, scope.organizationId),
    eq(evalRunEvents.projectId, scope.projectId),
    eq(evalRunEvents.runId, suite.id),
  );
  const attempt: SQL = sql`coalesce((SELECT item FROM jsonb_array_elements(${evalRuns.result}->'cases') item WHERE ${attemptMatch} LIMIT 1),
    (SELECT ${evalRunEvents.event}->'result' FROM ${evalRunEvents} WHERE ${eventMatch} AND ${evalRunEvents.event}->>'type'='case-completed' AND ${evalRunEvents.event}->'result'->>'caseId'=${query.caseId} AND (${evalRunEvents.event}->'result'->>'repetition')::integer=${query.repetition} ORDER BY ${evalRunEvents.id} DESC LIMIT 1))`;
  const step: SQL = sql`coalesce((SELECT turn FROM jsonb_array_elements(${attempt}->'steps') turn WHERE (turn->>'index')::integer=${query.turn} LIMIT 1),
    (SELECT ${evalRunEvents.event}->'step' FROM ${evalRunEvents} WHERE ${eventMatch} AND ${evalRunEvents.event}->>'type'='step-completed' AND ${evalRunEvents.event}->>'caseId'=${query.caseId} AND (${evalRunEvents.event}->>'repetition')::integer=${query.repetition} AND (${evalRunEvents.event}->'step'->>'index')::integer=${query.turn} ORDER BY ${evalRunEvents.id} DESC LIMIT 1))`;
  if (query.view === "turn") {
    const [row] = await db
      .select({
        turn: sql`jsonb_build_object('index', ${step}->'index', 'status', ${step}->'status', 'runId', ${step}->'observation'->'runId', 'sessionId', ${attempt}->'sessionId', 'attemptId', ${attempt}->'attemptId', 'diagnosticId', ${step}->'observation'->'diagnosticId', 'criteria', coalesce((SELECT jsonb_agg(jsonb_build_object('id', value->'id', 'passed', value->'passed')) FROM jsonb_array_elements(${step}->'criteria') value), '[]'::jsonb))`,
        exists: sql<boolean>`${step} IS NOT NULL`,
      })
      .from(evalRuns)
      .where(and(scopeFor(scope), eq(evalRuns.id, suite.id)))
      .limit(1);
    if (!row?.exists)
      throw new TelemetryNotFoundError(
        "Saved turn not found. Active turns may not have evidence yet.",
      );
    return envelope(
      row.turn,
      page(1, 1, 0),
      [
        "input",
        "expectation",
        "observation",
        "criteria",
        "verification",
        "tools",
        "output",
        "interrupt",
        "model",
        "diagnostic",
        "context",
      ].map((section) => ({
        command: `kortyx studio evals evidence ${id}`,
        args: {
          suite: suite.id,
          case: query.caseId!,
          repetition: String(query.repetition),
          turn: String(query.turn),
          section,
        },
      })),
    );
  }
  let value: SQL;
  switch (query.section) {
    case "verification":
      value = sql`${attempt}->'verification'`;
      break;
    case "tools":
      value = sql`${step}->'observation'->'events'`;
      break;
    case "output":
      value = sql`jsonb_build_object('text', ${step}->'observation'->'text', 'structured', ${step}->'observation'->'structured')`;
      break;
    case "interrupt":
      value = sql`${step}->'observation'->'interrupt'`;
      break;
    case "diagnostic":
      value = sql`jsonb_build_object('diagnosticId', ${step}->'observation'->'diagnosticId', 'failure', ${step}->'observation'->'failure')`;
      break;
    case "context":
      value = sql`jsonb_build_object('metadata', ${evalRuns.request}->'metadata', 'judge', ${evalRuns.request}->'judge', 'resolvedSettings', ${evalRuns.request}->'resolvedSettings', 'suiteRevision', ${evalRuns.suiteRevision}, 'promptSnapshot', ${evalRuns.request}->'promptSnapshot')`;
      break;
    case "model": {
      const [link] = await db
        .select({ runId: sql<string | null>`${step}->'observation'->>'runId'` })
        .from(evalRuns)
        .where(and(scopeFor(scope), eq(evalRuns.id, suite.id)))
        .limit(1);
      if (!link?.runId)
        return envelope(
          { state: "not_captured", section: query.section },
          page(0, 0, 0),
        );
      const where = and(
        eq(telemetryEvents.organizationId, scope.organizationId),
        eq(telemetryEvents.projectId, scope.projectId),
        eq(telemetryEvents.environment, suite.environment),
        eq(telemetryEvents.runId, link.runId),
        query.event ? eq(telemetryEvents.id, query.event) : undefined,
      );
      if (!query.event) {
        const [count] = await db
          .select({ total: sql<number>`count(*)::integer` })
          .from(telemetryEvents)
          .where(where);
        const events = await db
          .select({
            id: telemetryEvents.id,
            type: telemetryEvents.type,
            spanId: telemetryEvents.spanId,
          })
          .from(telemetryEvents)
          .where(where)
          .orderBy(asc(telemetryEvents.occurredAt), asc(telemetryEvents.id))
          .limit(query.limit)
          .offset(query.cursor);
        return envelope(
          events,
          page(count?.total ?? 0, events.length, query.cursor),
          events.map((event) => ({
            command: `kortyx studio evals evidence ${id}`,
            args: {
              suite: suite.id,
              case: query.caseId!,
              repetition: String(query.repetition),
              turn: String(query.turn),
              section: "model",
              event: event.id,
            },
          })),
        );
      }
      const text = evalEvidenceText(sql`${telemetryEvents.payload}`);
      const [content] = await db
        .select({
          total: sql<number>`length(${text})`,
          content: sql<string>`substring(${text} FROM ${query.contentCursor + 1} FOR ${query.contentLimit})`,
        })
        .from(telemetryEvents)
        .where(where)
        .limit(1);
      if (!content)
        throw new TelemetryNotFoundError("Captured model event not found.");
      return envelope(
        {
          section: query.section,
          format: "json-text",
          offset: query.contentCursor,
          ...content,
        },
        page(content.total, [...content.content].length, query.contentCursor),
      );
    }
    default:
      value = sql`${step}->${query.section}`;
  }
  const text = evalEvidenceText(value);
  const [row] = await db
    .select({
      total: sql<number>`coalesce(length(${text}),0)`,
      content: sql<
        string | null
      >`substring(${text} FROM ${query.contentCursor + 1} FOR ${query.contentLimit})`,
      exists: sql<boolean>`${step} IS NOT NULL`,
    })
    .from(evalRuns)
    .where(and(scopeFor(scope), eq(evalRuns.id, suite.id)))
    .limit(1);
  if (!row?.exists) throw new TelemetryNotFoundError("Saved turn not found.");
  const content = row.content ?? "";
  const paging = page(row.total, [...content].length, query.contentCursor);
  return envelope(
    {
      section: query.section,
      format: "json-text",
      offset: query.contentCursor,
      content,
      state: row.total ? "captured" : "not_captured",
    },
    paging,
    paging.nextCursor === null
      ? []
      : [
          {
            command: `kortyx studio evals evidence ${id}`,
            args: {
              suite: suite.id,
              case: query.caseId,
              repetition: String(query.repetition),
              turn: String(query.turn),
              section: query.section,
              "content-cursor": String(paging.nextCursor),
            },
          },
        ],
  );
}
