import {
  errorProperty,
  isControlFlowError,
  isFailureDescriptor,
  serializeFailure,
} from "@kortyx/core/errors";
import {
  captureDiagnosticContent,
  redactDiagnosticText,
} from "@kortyx/telemetry-contracts";
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

/** Authenticated eval evidence retains original exceptions with credential-only redaction. */
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
  const exception =
    !control && error !== undefined ? captureDiagnosticContent(error) : null;
  const rawMessage =
    typeof error === "string" ? error : errorProperty(error, "message");
  const originalMessage =
    typeof rawMessage === "string"
      ? redactDiagnosticText(rawMessage)
      : undefined;
  let diagnosticId: unknown =
    options.diagnosticId ?? errorProperty(error, "diagnosticId");
  if (!control && !diagnosticId && options.reportError) {
    try {
      diagnosticId = options.reportError(error, options.correlation);
    } catch {
      // Optional observability must preserve the eval outcome.
    }
  }
  const candidate =
    errorProperty(error, "statusCode") ?? errorProperty(error, "status");
  const httpStatus =
    typeof candidate === "number" &&
    Number.isInteger(candidate) &&
    candidate >= 100 &&
    candidate <= 599
      ? candidate
      : undefined;
  return {
    ...(exception ? { exception } : {}),
    ...(httpStatus ? { details: { httpStatus } } : {}),
    phase,
    code: declared ? failure.code : (options.code ?? "EVAL_HOOK_FAILED"),
    message:
      originalMessage ??
      (declared
        ? failure.message
        : `${messages[phase]}${httpStatus ? ` HTTP ${httpStatus}.` : ""}`),
    failure,
    ...(typeof diagnosticId === "string" &&
    z.uuid().safeParse(diagnosticId).success
      ? { diagnosticId }
      : {}),
  };
}
