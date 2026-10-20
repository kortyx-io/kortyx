import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { EVAL_FIXTURE } from "./support/eval-plan";

for (const status of ["retrying", "reconnecting", "unknown"] as const) {
  test(`inspects ${status} attempt without a fabricated workflow link`, async ({
    page,
  }) => {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    const id = randomUUID();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await sql`INSERT INTO eval_runs (id,organization_id,project_id,environment,target_id,target_name,suite_id,suite_revision,suite,request,status,requested_by,lease_owner,lease_expires_at) SELECT ${id},organization_id,project_id,environment,target_id,target_name,suite_id,suite_revision,suite,${sql.json({ repetitions: 1, caseIds: [EVAL_FIXTURE.caseId] })},${status === "unknown" ? "error" : "running"},'e2e','fixture',now()+interval '1 hour' FROM eval_runs WHERE id=${EVAL_FIXTURE.baseline}`;
      await sql`INSERT INTO eval_run_events(organization_id,project_id,run_id,event) SELECT organization_id,project_id,id,${sql.json({ type: "case-dispatch", caseId: EVAL_FIXTURE.caseId, repetition: 1, status: status === "unknown" ? "reconnecting" : status, httpStatus: 503, retryAt: new Date(Date.now() + 2000).toISOString() })} FROM eval_runs WHERE id=${id}`;
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/evals/runs/${id}`);
      await page
        .getByRole("link", { name: "Ambiguous role", exact: true })
        .click();
      const drawer = page.getByRole("dialog", {
        name: "Ambiguous role",
        exact: true,
      });
      await expect(
        drawer.getByText(
          status === "unknown"
            ? "Status unknown"
            : status === "retrying"
              ? "Retrying"
              : "Reconnecting",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        drawer.getByText(
          status === "unknown"
            ? "Execution status is unknown. Inspect the consumer before running this attempt again."
            : status === "reconnecting"
              ? "Reconnecting to the accepted execution. Captured evidence is retained."
              : /Consumer busy\. Retrying/,
        ),
      ).toBeVisible();
      await expect(
        drawer.getByRole("link", { name: "Inspect workflow" }),
      ).toHaveCount(0);
      expect(errors).toEqual([]);
      await expect
        .poll(() =>
          drawer.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        )
        .toBe(true);
    } finally {
      await sql`DELETE FROM eval_runs WHERE id=${id}`;
      await sql.end();
    }
  });
}
