import { getEvalSuiteRevision } from "@kortyx/agent";
import { EvalRunResultSchema } from "@kortyx/agent/evals";
import postgres from "postgres";
import { EVAL_FIXTURE, EVAL_SUITE } from "./eval-plan";
import { DRAWER_FIXTURE } from "./telemetry-fixture";

export { EVAL_FIXTURE } from "./eval-plan";

const database = () =>
  postgres(
    process.env.DATABASE_URL ??
      "postgres://kortyx:kortyx@127.0.0.1:6543/kortyx",
    { max: 1 },
  );
export async function cleanupEvalFixture() {
  const sql = database();
  try {
    await sql`delete from evaluation_runs where target_id = 'e2e-ktx25-eval'`;
    await sql`delete from eval_runs where target_id = 'e2e-ktx25-eval'`;
  } finally {
    await sql.end();
  }
}
export async function seedEvalFixture() {
  const sql = database();
  try {
    const [scope] =
      await sql`select organization_id,project_id,environment from studio_runs where run_id=${DRAWER_FIXTURE.runId} limit 1`;
    if (!scope) throw new Error("Seed drawer fixture before eval fixture.");
    const suite = EVAL_SUITE;
    const suiteRevision = getEvalSuiteRevision(suite);
    for (const [id, status] of [
      [EVAL_FIXTURE.baseline, "failed"],
      [EVAL_FIXTURE.candidate, "passed"],
      [EVAL_FIXTURE.alternate, "passed"],
      [EVAL_FIXTURE.repeatedBaseline, "failed"],
      [EVAL_FIXTURE.repeatedCandidate, "passed"],
    ] as const) {
      const createdAt =
        id === EVAL_FIXTURE.alternate
          ? "2026-10-01T00:01:00.000Z"
          : "2026-10-01T00:00:00.000Z";
      const repeated =
        id === EVAL_FIXTURE.repeatedBaseline ||
        id === EVAL_FIXTURE.repeatedCandidate;
      const cases = repeated
        ? suite.cases.filter((item) => item.id === "repeated-role")
        : suite.cases;
      const repetitions = repeated ? 2 : 1;
      const total = cases.length * repetitions;
      const failed = status === "failed" ? total : repeated ? 1 : 0;
      const runStatus = failed ? "failed" : "passed";
      const result = EvalRunResultSchema.parse({
        id,
        suiteId: suite.id,
        suiteRevision,
        suite,
        judge: { id: "fixture-judge", version: "1" },
        startedAt: createdAt,
        durationMs: 10,
        status: runStatus,
        counts: {
          passed: total - failed,
          failed,
          error: 0,
          cancelled: 0,
        },
        errors: [],
        cases: cases.flatMap((item) =>
          Array.from({ length: repetitions }, (_, index) => {
            const caseStatus =
              item.id === "repeated-role" && index === 1 ? "failed" : status;
            return {
              caseId: item.id,
              repetition: index + 1,
              sessionId: DRAWER_FIXTURE.sessionId,
              status: caseStatus,
              durationMs: 10,
              errors: [],
              steps: item.steps.map((step, stepIndex) => ({
                index: stepIndex,
                input:
                  "message" in step
                    ? { message: step.message }
                    : { resume: step.resume },
                expectation: step.expect,
                observation: {
                  type: step.expect.type,
                  text:
                    id === EVAL_FIXTURE.alternate
                      ? "Alternate baseline role description"
                      : "Software Engineer role description",
                  structured: [],
                  runId: DRAWER_FIXTURE.runId,
                  ...(step.expect.type === "interrupt"
                    ? {
                        interrupt: {
                          requestId: "choice",
                          kind: "choice",
                          schemaId: "job-picker",
                          schemaVersion: "1",
                          options: [
                            { id: "paris", label: "Paris" },
                            { id: "barcelona", label: "Barcelona" },
                          ],
                        },
                      }
                    : {}),
                },
                status: caseStatus,
                criteria: (step.expect.criteria ?? []).map(
                  (criterion, criterionIndex) => ({
                    id:
                      typeof criterion === "string"
                        ? String(criterionIndex)
                        : criterion.id,
                    text:
                      typeof criterion === "string"
                        ? criterion
                        : criterion.text,
                    passed: caseStatus === "passed",
                    reason:
                      caseStatus === "passed"
                        ? id === EVAL_FIXTURE.alternate
                          ? "Alternate baseline role description was verified."
                          : "The selected role description is present."
                        : "The selected role description is missing.",
                    evidence: ["Software Engineer role description"],
                  }),
                ),
              })),
            };
          }),
        ),
      });
      await sql`insert into eval_runs (id,organization_id,project_id,environment,target_id,target_name,suite_id,suite_revision,suite,request,status,result,requested_by,created_at,started_at,ended_at) values (${id},${scope.organization_id},${scope.project_id},${scope.environment},'e2e-ktx25-eval','E2E eval application',${suite.id},${suiteRevision},${sql.json(suite)},${sql.json({ repetitions, caseIds: cases.map((item) => item.id) })},${runStatus},${sql.json(result)},'e2e',${createdAt},${createdAt},${createdAt})`;
    }
  } finally {
    await sql.end();
  }
}
