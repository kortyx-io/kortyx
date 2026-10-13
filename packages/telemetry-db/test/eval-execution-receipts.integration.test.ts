import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTelemetryDbClient } from "../src/client";
import {
  appendEvalProgress,
  getEvalAttemptEvidence,
  getEvalExecutionGeneration,
} from "../src/repositories/evals";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("persisted eval admission recovery", () => {
  it("restores the original fence per attempt under the current lease, without leaking sibling or foreign records", async () => {
    const client = createTelemetryDbClient(url!);
    const org = randomUUID(),
      project = randomUUID(),
      run = randomUUID(),
      id = randomUUID(),
      generation = randomUUID();
    try {
      await client.sql`INSERT INTO organizations(id,name) VALUES(${org},'eval-recovery-test')`;
      await client.sql`INSERT INTO projects(id,organization_id,name) VALUES(${project},${org},'eval-recovery-test')`;
      await client.sql`INSERT INTO eval_runs(id,organization_id,project_id,environment,target_id,target_name,suite_id,suite_revision,suite,request,status,requested_by,lease_owner,lease_expires_at) VALUES(${run},${org},${project},'test','app','App','suite','revision',${JSON.stringify({ id: "suite", cases: [] })}::jsonb,'{}','running','test','owner',now()+interval '1 hour')`;
      expect(
        await getEvalExecutionGeneration(client.db, run, "owner", id, "a", 1),
      ).toBeUndefined();
      await appendEvalProgress(client.db, run, "owner", {
        type: "case-dispatch",
        caseId: "a",
        repetition: 1,
        status: "queued",
        executionId: id,
        generation,
      });
      expect(
        await getEvalExecutionGeneration(client.db, run, "owner", id, "a", 1),
      ).toBe(generation);
      expect(
        await getEvalExecutionGeneration(client.db, run, "wrong", id, "a", 1),
      ).toBeUndefined();
      expect(
        await getEvalExecutionGeneration(client.db, run, "owner", id, "b", 1),
      ).toBeUndefined();
      expect(
        await getEvalExecutionGeneration(client.db, run, "owner", id, "a", 2),
      ).toBeUndefined();
      await appendEvalProgress(client.db, run, "owner", {
        type: "case-dispatch",
        caseId: "a",
        repetition: 1,
        status: "retrying",
      });
      expect(
        await getEvalExecutionGeneration(client.db, run, "owner", id, "a", 1),
      ).toBe(generation);
      await appendEvalProgress(client.db, run, "owner", {
        type: "case-started",
        caseId: "b",
        repetition: 1,
        sessionId: "real-session",
      });
      expect(
        await getEvalExecutionGeneration(client.db, run, "owner", id, "b", 1),
      ).toBeNull();
      expect(
        await getEvalExecutionGeneration(client.db, run, "owner", id),
      ).toBe(generation);
      expect(
        await getEvalAttemptEvidence(client.db, run, "owner", "b", 1),
      ).toMatchObject({ sessionId: "real-session", steps: [] });
      expect(
        await getEvalAttemptEvidence(client.db, run, "wrong", "b", 1),
      ).toBeUndefined();
      const step = {
        index: 0,
        input: { message: "hi" },
        expectation: { type: "answer" as const },
        observation: {
          type: "answer" as const,
          text: "captured evidence",
          structured: [],
        },
        status: "ungraded" as const,
        criteria: [],
      };
      await appendEvalProgress(client.db, run, "owner", {
        type: "step-completed",
        caseId: "b",
        repetition: 1,
        step,
      });
      await appendEvalProgress(client.db, run, "owner", {
        type: "step-completed",
        caseId: "b",
        repetition: 1,
        step: {
          ...step,
          observation: { ...step.observation, text: "updated evidence" },
        },
      });
      expect(
        (await getEvalAttemptEvidence(client.db, run, "owner", "b", 1))?.steps,
      ).toHaveLength(1);
      expect(
        (await getEvalAttemptEvidence(client.db, run, "owner", "b", 1))
          ?.steps?.[0]?.observation.text,
      ).toBe("updated evidence");
      expect(
        await getEvalAttemptEvidence(client.db, run, "owner", "a", 1),
      ).toBeUndefined();
      await appendEvalProgress(client.db, run, "owner", {
        type: "case-completed",
        result: {
          caseId: "b",
          repetition: 1,
          sessionId: "real-session",
          status: "error",
          durationMs: 1,
          steps: [step],
          errors: [],
        },
      });
      expect(
        (await getEvalAttemptEvidence(client.db, run, "owner", "b", 1))?.status,
      ).toBe("error");
      await appendEvalProgress(client.db, run, "owner", {
        type: "case-started",
        caseId: "b",
        repetition: 1,
        sessionId: "real-session",
      });
      expect(
        (await getEvalAttemptEvidence(client.db, run, "owner", "b", 1))?.steps,
      ).toHaveLength(1);
      await appendEvalProgress(client.db, run, "owner", {
        type: "case-started",
        caseId: "b",
        repetition: 1,
        sessionId: "replacement-session",
      });
      expect(
        (await getEvalAttemptEvidence(client.db, run, "owner", "b", 1))?.steps,
      ).toEqual([]);
      await client.sql`UPDATE eval_runs SET lease_owner='next' WHERE id=${run}`;
      expect(
        await getEvalExecutionGeneration(client.db, run, "next", id, "a", 1),
      ).toBe(generation);
    } finally {
      await client.sql`DELETE FROM organizations WHERE id=${org}`;
      await client.close();
    }
  });
});
