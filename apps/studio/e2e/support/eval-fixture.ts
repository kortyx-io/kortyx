import postgres from "postgres";
import { DRAWER_FIXTURE } from "./telemetry-fixture";
export const EVAL_FIXTURE = {
  baseline: "10000000-0000-4000-8000-000000000251",
  candidate: "10000000-0000-4000-8000-000000000252",
  caseId: "ambiguity",
  suiteId: "e2e-ktx25-eval",
};
const database = () =>
  postgres(
    process.env.DATABASE_URL ??
      "postgres://kortyx:kortyx@127.0.0.1:6543/kortyx",
    { max: 1 },
  );
export async function cleanupEvalFixture() {
  const sql = database();
  try {
    await sql`delete from eval_runs where id in (${EVAL_FIXTURE.baseline},${EVAL_FIXTURE.candidate}) and target_id = 'e2e-ktx25-eval'`;
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
    const suite = {
      id: EVAL_FIXTURE.suiteId,
      name: "E2E job conversations",
      cases: [
        {
          id: EVAL_FIXTURE.caseId,
          name: "Ambiguous role",
          steps: [
            {
              message: "Find the AI Software Engineer role",
              expect: {
                type: "answer",
                criteria: [
                  {
                    id: "description",
                    text: "Returns the selected role description",
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    for (const [id, status] of [
      [EVAL_FIXTURE.baseline, "failed"],
      [EVAL_FIXTURE.candidate, "passed"],
    ] as const) {
      const createdAt = "2026-10-01T00:00:00.000Z";
      const result = {
        id,
        suiteId: suite.id,
        suiteRevision: "fixture-1",
        suite,
        judge: { id: "fixture-judge", version: "1" },
        startedAt: createdAt,
        durationMs: 10,
        status,
        counts: {
          passed: status === "passed" ? 1 : 0,
          failed: status === "failed" ? 1 : 0,
          error: 0,
          cancelled: 0,
        },
        errors: [],
        cases: [
          {
            caseId: EVAL_FIXTURE.caseId,
            repetition: 1,
            sessionId: DRAWER_FIXTURE.sessionId,
            status,
            durationMs: 10,
            errors: [],
            steps: [
              {
                index: 0,
                input: { message: suite.cases[0].steps[0].message },
                expectation: suite.cases[0].steps[0].expect,
                observation: {
                  type: "answer",
                  text: "Software Engineer role description",
                  structured: [],
                  runId: DRAWER_FIXTURE.runId,
                },
                status,
                criteria: [
                  {
                    id: "description",
                    text: "Returns the selected role description",
                    passed: status === "passed",
                    reason:
                      status === "passed"
                        ? "The selected role description is present."
                        : "The selected role description is missing.",
                    evidence: ["Software Engineer role description"],
                  },
                ],
              },
            ],
          },
        ],
      };
      await sql`insert into eval_runs (id,organization_id,project_id,environment,target_id,target_name,suite_id,suite_revision,suite,request,status,result,requested_by,created_at,started_at,ended_at) values (${id},${scope.organization_id},${scope.project_id},${scope.environment},'e2e-ktx25-eval','E2E eval application',${suite.id},'fixture-1',${sql.json(suite)},${sql.json({ repetitions: 1, caseIds: [EVAL_FIXTURE.caseId] })},${status},${sql.json(result)},'e2e',${createdAt},${createdAt},${createdAt})`;
    }
  } finally {
    await sql.end();
  }
}
