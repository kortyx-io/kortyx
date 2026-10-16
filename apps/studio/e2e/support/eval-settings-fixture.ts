import { createHash, randomUUID } from "node:crypto";
import { getEvalSuiteRevision } from "@kortyx/agent";
import {
  captureDiagnosticContent,
  type DiagnosticContent,
  type DiagnosticManifest,
} from "@kortyx/telemetry-contracts";
import postgres from "postgres";
export const EVAL_SETTINGS_FIXTURE = {
  id: "e892eb96-12bb-4c73-b581-8813695e2d01",
  errorSuite: "e892eb96-12bb-4c73-b581-8813695e2d02",
  targetId: "e2e-eval-settings",
};
export async function seedEvalSettingsFixture() {
  const sql = postgres(
    process.env.DATABASE_URL ??
      "postgres://kortyx:kortyx@127.0.0.1:6543/kortyx",
    { max: 1 },
  );
  try {
    const [scope] =
      await sql`select organization_id,id as project_id from projects where name = 'Default Project' limit 1`;
    if (!scope) throw new Error("Bootstrap the test project first.");
    await sql`delete from error_diagnostics where organization_id=${scope.organization_id} and project_id=${scope.project_id} and manifest->'correlation'->>'evaluationId'=${EVAL_SETTINGS_FIXTURE.id}`;
    const timeoutDiagnosticId = await seedDiagnostic(
      sql,
      {
        organizationId: scope.organization_id,
        projectId: scope.project_id,
        environment: "development",
      },
      new Error(
        "The overall evaluation deadline was reached during grading. Completed results are preserved.",
      ),
      {
        correlation: {
          evaluationId: EVAL_SETTINGS_FIXTURE.id,
          phase: "grading",
        },
      },
    );
    await sql`delete from evaluation_runs where id=${EVAL_SETTINGS_FIXTURE.id}`;
    const settings = {
      values: {
        repetitions: 1,
        concurrency: 2,
        caseTimeoutMs: 120000,
        runTimeoutMs: 1800000,
        judge: "studio",
      },
      sources: {
        repetitions: "sdk-default",
        concurrency: "studio",
        caseTimeoutMs: "sdk",
        runTimeoutMs: "studio-default",
        judge: "studio-default",
      },
    };
    const createdAt = "2026-10-16T10:53:43.000Z",
      endedAt = "2026-10-16T11:23:43.000Z";
    const parentRequest = {
      targetId: EVAL_SETTINGS_FIXTURE.targetId,
      selection: "all",
      suites: [],
      metadata: { source: "manual" },
      resolvedSettings: settings,
    };
    await sql`insert into evaluation_runs (id,organization_id,project_id,environment,target_id,target_name,name,request,request_hash,requested_by,created_at) values (${EVAL_SETTINGS_FIXTURE.id},${scope.organization_id},${scope.project_id},'development',${EVAL_SETTINGS_FIXTURE.targetId},'Example agent','All suites · timeout example',${sql.json(parentRequest)},'fixture','fixture',${createdAt})`;
    const plans = [
      ["Pulse — objectives and results", 6, 6, 0, 0, false],
      ["Shared behavior — access and identity", 15, 8, 0, 1, true],
      ["Screening journeys — review and read back", 4, 4, 1, 1, false],
      ["Today — priorities and meetings", 6, 6, 1, 0, false],
      ["Brief — jobs and clarification", 14, 9, 1, 0, true],
      ["Intake journeys — create and enrich", 4, 4, 2, 1, false],
      ["Daily journeys — reviewed actions", 3, 3, 2, 1, false],
      ["Scribe — CVs and candidate records", 33, 9, 0, 1, true],
      ["General chat — advice and settings", 6, 6, 0, 1, false],
      ["Sift — pipeline and feedback", 16, 8, 0, 0, true],
    ] as const;
    for (const [
      index,
      [name, total, completed, failed, errors, timedOut],
    ] of plans.entries()) {
      const id =
        index === 2
          ? EVAL_SETTINGS_FIXTURE.errorSuite
          : `e892eb96-12bb-4c73-b581-${String(index + 100).padStart(12, "0")}`;
      const suite = {
        id: `suite-${index}`,
        name,
        cases: Array.from({ length: total }, (_, i) => ({
          id: `case-${i}`,
          name: i === 0 ? "Search candidates" : `Conversation ${i + 1}`,
          steps: [
            { message: "Find relevant candidates", expect: { type: "answer" } },
          ],
        })),
      };
      const revision = getEvalSuiteRevision(suite as never);
      const issue = {
        phase: "grading",
        code: "PROVIDER_REQUEST_FAILED",
        message:
          "OpenRouter returned HTTP 429: Rate limit exceeded for the evaluation model.",
        details: { httpStatus: 429 },
        exception: captureDiagnosticContent(
          Object.assign(
            new Error(
              "OpenRouter returned HTTP 429: Rate limit exceeded for the evaluation model.",
              {
                cause: Object.assign(
                  new Error(
                    "Provider concurrency quota exceeded. Retry after 20 seconds.",
                  ),
                  {
                    stack:
                      "Error: Provider concurrency quota exceeded. Retry after 20 seconds.\n    at providerRequest (provider/client.ts:42:9)",
                  },
                ),
              },
            ),
            {
              stack:
                "Error: OpenRouter returned HTTP 429: Rate limit exceeded for the evaluation model.\n    at gradeCriterion (evaluation/judge.ts:84:11)\n    at gradeExecution (evaluation/worker.ts:206:19)",
              status: 429,
              responseBody: {
                error: {
                  message: "Rate limit exceeded",
                  code: "rate_limit_exceeded",
                },
                retryAfter: 20,
              },
            },
          ),
        ),
      };
      const diagnosticId = errors
        ? await seedDiagnostic(
            sql,
            {
              organizationId: scope.organization_id,
              projectId: scope.project_id,
              environment: "development",
            },
            new Error(issue.message),
            {
              content: issue.exception,
              correlation: {
                evaluationId: EVAL_SETTINGS_FIXTURE.id,
                suiteRunId: id,
                caseId: "case-0",
                repetition: "1",
                phase: "grading",
              },
            },
          )
        : undefined;
      const recordedIssue = {
        ...issue,
        ...(diagnosticId ? { diagnosticId } : {}),
      };
      const results = suite.cases.slice(0, completed).map((item, i) => {
        const status =
          i < errors ? "error" : i < errors + failed ? "failed" : "passed";
        return {
          caseId: item.id,
          repetition: 1,
          sessionId: `fixture-${index}-${i}`,
          status,
          durationMs: 1200,
          errors: status === "error" ? [recordedIssue] : [],
          steps: [
            {
              index: 0,
              input: { message: item.steps[0]!.message },
              expectation: item.steps[0]!.expect,
              observation: {
                type: "answer",
                text: "Captured application answer.",
                structured: [],
              },
              status,
              criteria: [],
              ...(status === "error" ? { reason: issue.message } : {}),
            },
          ],
        };
      });
      const counts = {
        passed: completed - failed - errors,
        failed,
        error: errors,
        cancelled: 0,
      };
      const result = timedOut
        ? null
        : {
            id,
            suiteId: suite.id,
            suiteRevision: revision,
            suite,
            startedAt: createdAt,
            durationMs: 900000,
            status: errors ? "error" : failed ? "failed" : "passed",
            counts,
            cases: results,
            errors: [],
          };
      const termination = timedOut
        ? {
            code: "EVAL_RUN_TIMEOUT",
            ...(timeoutDiagnosticId
              ? { diagnosticId: timeoutDiagnosticId }
              : {}),
            message:
              "The overall evaluation deadline was reached during grading. Completed results are preserved.",
            timeoutMs: 1800000,
            phase: "grading",
            cleanup: "signalled",
          }
        : null;
      const request = {
        suiteId: suite.id,
        suiteRevision: revision,
        repetitions: 1,
        concurrency: 2,
        grading: "studio",
        judge: {
          id: "studio/example-evaluator",
          version: "1",
          location: "studio",
        },
        runTimeoutMs: 1800000,
        caseTimeoutMs: 120000,
        resolvedSettings: settings,
      };
      await sql`insert into eval_runs (id,evaluation_id,organization_id,project_id,environment,target_id,target_name,suite_id,suite_revision,suite,request,status,result,error,termination,requested_by,created_at,started_at,ended_at) values (${id},${EVAL_SETTINGS_FIXTURE.id},${scope.organization_id},${scope.project_id},'development',${EVAL_SETTINGS_FIXTURE.targetId},'Example agent',${suite.id},${revision},${sql.json(suite)},${sql.json(request)},${timedOut || errors ? "error" : failed ? "failed" : "passed"},${result ? sql.json(JSON.parse(JSON.stringify(result))) : null},${termination?.message ?? null},${termination ? sql.json(termination) : null},'fixture',${createdAt},${createdAt},${timedOut ? endedAt : "2026-10-16T11:13:43.000Z"})`;
      if (timedOut) {
        const events: unknown[] = results.map((result) => ({
          type: "case-completed",
          result,
        }));
        events.push({
          type: "case-completed",
          result: {
            ...results[0],
            caseId: `case-${completed}`,
            status: "ungraded",
            errors: [],
            steps: [],
          },
        });
        events.push({
          type: "case-started",
          caseId: `case-${completed + 1}`,
          repetition: 1,
          sessionId: `fixture-active-${index}`,
        });
        for (const event of events)
          await sql`insert into eval_run_events (run_id,organization_id,project_id,event) values (${id},${scope.organization_id},${scope.project_id},${sql.json(event as never)})`;
      }
    }
  } finally {
    await sql.end();
  }
}

async function seedDiagnostic(
  sql: postgres.Sql,
  scope: { organizationId: string; projectId: string; environment: string },
  error: Error,
  options: {
    content?: DiagnosticContent | null;
    correlation: DiagnosticManifest["correlation"];
  },
) {
  const content = options.content ?? captureDiagnosticContent(error);
  if (!content) throw new Error("Could not capture fixture error");
  const bytes = JSON.stringify(content);
  const diagnosticId = randomUUID();
  const manifest: DiagnosticManifest = {
    schemaVersion: 1,
    diagnosticId,
    occurrenceId: randomUUID(),
    occurredAt: new Date().toISOString(),
    environment: scope.environment,
    service: { name: "eval-fixture" },
    correlation: options.correlation,
    handled: true,
    severity: "error",
    mechanism: "report",
    summary: { type: "Error", message: error.message },
    captureStatus: content.capture.status,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    byteLength: Buffer.byteLength(bytes),
    partCount: 1,
  };
  await sql`insert into error_diagnostics (organization_id,project_id,diagnostic_id,environment,manifest,content,state,expires_at) values (${scope.organizationId},${scope.projectId},${diagnosticId},${scope.environment},${sql.json(manifest as never)},${bytes},'available',now()+interval '30 days')`;
  return diagnosticId;
}
