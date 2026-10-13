import {
  errorProperty,
  isControlFlowError,
  isFailureDescriptor,
  serializeFailure,
} from "@kortyx/core/errors";
import { z } from "zod";
import type { Agent } from "../chat/create-agent";
import type { EvalIssue, EvalPhase } from "./types";

const messages: Record<EvalPhase, string> = {
  params: "Case parameters failed validation.",
  setup: "Case setup failed.",
  execute: "Agent execution failed or returned an invalid observation.",
  responder:
    "Interrupt response failed or was incompatible with the waiting contract.",
  reference: "Reference resolution failed or returned non-JSON data.",
  grading: "Grading failed or returned an invalid verdict.",
  verification: "Case verification failed or returned an invalid verdict.",
  cleanup: "Case cleanup failed.",
  reporting: "Progress reporting failed.",
};

/** Public eval evidence contains bounded safe descriptors and opaque references only. */
export function createEvalIssue(
  phase: EvalPhase,
  error: unknown,
  options: {
    code?: string;
    diagnosticId?: string;
    reportError?: Agent["reportError"];
    correlation?: Parameters<NonNullable<Agent["reportError"]>>[1];
  } = {},
): EvalIssue {
  const control = isControlFlowError(error);
  const declared =
    !control &&
    (isFailureDescriptor(error) ||
      isFailureDescriptor(errorProperty(error, "failure")));
  const failure = serializeFailure(control ? undefined : error);
  let diagnosticId: unknown =
    options.diagnosticId ?? errorProperty(error, "diagnosticId");
  if (!control && !diagnosticId && options.reportError) {
    try {
      diagnosticId = options.reportError(error, options.correlation);
    } catch {
      // Optional observability must preserve the eval outcome.
    }
  }
  return {
    phase,
    code: declared ? failure.code : (options.code ?? "EVAL_HOOK_FAILED"),
    message: declared ? failure.message : messages[phase],
    failure,
    ...(typeof diagnosticId === "string" &&
    z.uuid().safeParse(diagnosticId).success
      ? { diagnosticId }
      : {}),
  };
}
