import { createHash } from "node:crypto";
import type { StudioEvaluationComparison } from "@kortyx/agent/evals";
import { caseRows } from "@/features/evals/lib/presentation";
import type { EvaluationResults } from "@/features/evals/schema";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
const fingerprint = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");

/** Immutable sample fixtures only; real evaluations are projected inside PostgreSQL. */
export function sampleEvaluationComparison(
  run: EvaluationResults,
): StudioEvaluationComparison {
  return {
    ...run,
    suites: run.suites.map((s) => ({
      id: s.id,
      suiteId: s.suiteId,
      name: s.suite.name ?? s.suiteId,
      targetId: s.targetId,
      environment: s.environment,
      status: s.status,
      ...(s.resolvedSettings ? { resolvedSettings: s.resolvedSettings } : {}),
      judge: s.result?.judge ? fingerprint(s.result.judge) : null,
      definitions: s.suite.cases.map((c) => ({
        id: c.id,
        name: c.name ?? c.id,
        fingerprint: fingerprint(c),
      })),
      cases: caseRows(s).map((c) => ({
        caseId: c.caseId,
        repetition: c.repetition,
        status: c.status,
        ...(c.durationMs === undefined ? {} : { durationMs: c.durationMs }),
        ...(c.costs ? { costs: c.costs } : {}),
        contexts: c.steps.map((step) => ({
          index: step.index,
          fingerprint: fingerprint({
            input: step.input,
            reference: step.reference,
            expectation: step.expectation,
          }),
        })),
      })),
    })),
  };
}
