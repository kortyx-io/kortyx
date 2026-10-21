import {
  EVAL_COMPARISON_LIMITS as limits,
  type StudioEvaluationComparison,
} from "@kortyx/agent/evals";
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryNotFoundError, TelemetryValidationError } from "../errors";
import { evalRuns, evaluationRuns } from "../schema";
import { getEvalLiveSummaries } from "./eval-live";
import { summarizeLiveEvaluation } from "./evaluations";

type Scope = {
  organizationId: string;
  projectId: string;
  environment?: string | undefined;
};
type Suite = StudioEvaluationComparison["suites"][number];
const bounded = <T>(value: SQL) => sql<T | null>`CASE
  WHEN octet_length((${value})::text) <= ${limits.responseBytes}
  THEN ${value} ELSE NULL END`;
const definitions = sql`coalesce((SELECT jsonb_agg(jsonb_build_object(
  'id', definition->>'id', 'name', left(coalesce(definition->>'name', definition->>'id'),512),
  'fingerprint', encode(sha256(convert_to(definition::text,'UTF8')),'hex')))
  FROM jsonb_array_elements(${evalRuns.suite}->'cases') definition), '[]'::jsonb)`;
const cases = sql`coalesce((SELECT jsonb_agg(jsonb_build_object(
  'caseId', attempt->>'caseId', 'repetition', attempt->'repetition',
  'contexts', coalesce((SELECT jsonb_agg(jsonb_build_object(
    'index', step->'index', 'fingerprint', encode(sha256(convert_to(jsonb_build_object(
      'input', step->'input', 'reference', step->'reference', 'expectation', step->'expectation',
      'referencePresent', step ? 'reference')::text,'UTF8')),'hex')))
    FROM jsonb_array_elements(attempt->'steps') step), '[]'::jsonb)))
  FROM jsonb_array_elements(${evalRuns.result}->'cases') attempt), '[]'::jsonb)`;

/** Project in PostgreSQL: no transcripts, events, prompts or criterion evidence enter Node. */
export async function getEvaluationComparison(
  db: TelemetryDb,
  scope: Scope,
  id: string,
): Promise<StudioEvaluationComparison> {
  const [parent] = await db
    .select()
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
  if (!parent) throw new TelemetryNotFoundError("Evaluation run not found.");
  const where = and(
    eq(evalRuns.evaluationId, id),
    eq(evalRuns.organizationId, scope.organizationId),
    eq(evalRuns.projectId, scope.projectId),
    scope.environment ? eq(evalRuns.environment, scope.environment) : undefined,
  );
  // Check cardinality before constructing JSON or warming historical live projections.
  const sizes = await db
    .select({
      id: evalRuns.id,
      attempts: sql<number>`greatest(coalesce(jsonb_array_length(${evalRuns.result}->'cases'),0),
      coalesce(jsonb_array_length(${evalRuns.request}->'caseIds'), jsonb_array_length(${evalRuns.suite}->'cases'),0)
        * coalesce((${evalRuns.request}->>'repetitions')::integer,1),
        (SELECT count(*)::integer FROM jsonb_each(coalesce(${evalRuns.liveProjection}->'attempts','{}'::jsonb))))`,
      steps: sql<number>`coalesce((SELECT max(jsonb_array_length(attempt->'steps')) FROM jsonb_array_elements(${evalRuns.result}->'cases') attempt),0)`,
      definitions: sql<number>`coalesce(jsonb_array_length(${evalRuns.suite}->'cases'),0)`,
    })
    .from(evalRuns)
    .where(where)
    .orderBy(asc(evalRuns.id))
    .limit(limits.suites + 1);
  if (
    sizes.length > limits.suites ||
    sizes.reduce((n, s) => n + s.attempts, 0) > limits.attempts ||
    sizes.some(
      (s) =>
        s.steps > limits.stepsPerAttempt || s.definitions > limits.attempts,
    )
  )
    throw new TelemetryValidationError(
      "This evaluation is too large for an automatic comparison. Inspect individual conversations.",
    );
  const suites: Suite[] = [];
  let bytes = 0;
  // One bounded projection and one batched live read, regardless of suite count.
  // The combined byte gate runs in PostgreSQL before any comparison JSON reaches Node.
  type ProjectedSuite = Pick<
    Suite,
    | "id"
    | "suiteId"
    | "targetId"
    | "environment"
    | "name"
    | "judge"
    | "definitions"
  > & {
    selected: string[] | null;
    repetitions: number;
    contexts: {
      caseId: string;
      repetition: number;
      contexts: Suite["cases"][number]["contexts"];
    }[];
  };
  const [projected] = await db
    .select({
      rows: bounded<ProjectedSuite[]>(sql`coalesce(jsonb_agg(jsonb_build_object(
    'id', ${evalRuns.id}, 'suiteId', ${evalRuns.suiteId}, 'targetId', ${evalRuns.targetId},
    'environment', ${evalRuns.environment},
    'name', left(coalesce(${evalRuns.suite}->>'name',${evalRuns.suiteId}),512),
    'selected', ${evalRuns.request}->'caseIds',
    'repetitions', coalesce((${evalRuns.request}->>'repetitions')::integer,1),
    'judge', CASE WHEN NULLIF(${evalRuns.result}->'judge','null'::jsonb) IS NULL THEN NULL
      ELSE encode(sha256(convert_to((${evalRuns.result}->'judge')::text,'UTF8')),'hex') END,
    'definitions', ${definitions}, 'contexts', ${cases}
  ) ORDER BY ${evalRuns.id}), '[]'::jsonb)`),
    })
    .from(evalRuns)
    .where(where);
  if (!projected?.rows)
    throw new TelemetryValidationError(
      "Comparison exceeds the automatic comparison limit.",
    );
  const liveSummaries = await getEvalLiveSummaries(
    db,
    scope,
    sizes.map((size) => size.id),
  );
  const byId = new Map(liveSummaries.map((live) => [live.id, live]));
  for (const row of projected.rows) {
    if (!row || !row.definitions || !row.contexts)
      throw new TelemetryValidationError(
        "Comparison exceeds the automatic comparison limit.",
      );
    const live = byId.get(row.id);
    if (!live) throw new TelemetryNotFoundError("Eval run not found.");
    const contexts = new Map(
      row.contexts.map((c) => [
        JSON.stringify([c.caseId, c.repetition]),
        c.contexts,
      ]),
    );
    const { contexts: _, selected, repetitions, ...metadata } = row;
    const attempts = new Map<string, Suite["cases"][number]>();
    for (const id of selected ?? row.definitions.map((d) => d.id))
      for (let repetition = 1; repetition <= repetitions; repetition++)
        attempts.set(JSON.stringify([id, repetition]), {
          caseId: id,
          repetition,
          status: "not-run",
          contexts: [],
        });
    for (const c of live.cases)
      attempts.set(JSON.stringify([c.caseId, c.repetition]), {
        caseId: c.caseId,
        repetition: c.repetition,
        status: c.status,
        ...(c.durationMs === undefined ? {} : { durationMs: c.durationMs }),
        ...(c.costs ? { costs: c.costs } : {}),
        contexts: contexts.get(JSON.stringify([c.caseId, c.repetition])) ?? [],
      });
    const suite: Suite = {
      ...metadata,
      definitions: row.definitions,
      status: live.status,
      ...(live.resolvedSettings
        ? { resolvedSettings: live.resolvedSettings }
        : {}),
      cases: [...attempts.values()],
    };
    bytes += Buffer.byteLength(JSON.stringify(suite));
    if (bytes > limits.responseBytes)
      throw new TelemetryValidationError(
        "Comparison exceeds the automatic comparison limit.",
      );
    suites.push(suite);
  }
  const summary = summarizeLiveEvaluation(parent, liveSummaries);
  const result = { ...summary, suites };
  if (Buffer.byteLength(JSON.stringify({ run: result })) > limits.responseBytes)
    throw new TelemetryValidationError(
      "Comparison exceeds the automatic comparison limit.",
    );
  return result;
}
