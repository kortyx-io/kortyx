import type { TelemetryDb } from "@kortyx/telemetry-db";
import { recordErrorDiagnostic } from "../record-error-diagnostic";
import type { EvalTarget } from "./targets";

/** Keep the cause private while giving operators stable, useful correlation. */
type DiagnosticScope = {
  organizationId: string;
  projectId: string;
  environment: string;
};
export class EvalWorkerRetirementError extends Error {
  readonly scope: DiagnosticScope | undefined;
  constructor(
    readonly phase: "claim" | "completion" | "verification",
    readonly owner: string,
    cause: unknown,
    readonly suiteRunId?: string,
    scope?: DiagnosticScope,
  ) {
    super(
      phase === "claim"
        ? "Evaluation claim could not be confirmed."
        : phase === "completion"
          ? "Evaluation worker completion could not be confirmed."
          : "Evaluation worker retirement could not be verified.",
      { cause },
    );
    this.name = "EvalWorkerRetirementError";
    this.scope = scope
      ? {
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          environment: scope.environment,
        }
      : undefined;
  }
}

/** Use the existing scoped, redacted diagnostic store; never dump errors or SQL into logs. */
export async function reportWorkerRetirementFailure(
  db: TelemetryDb,
  targets: readonly EvalTarget[],
  error: unknown,
) {
  const failure =
    error instanceof EvalWorkerRetirementError ? error : undefined;
  const scopes = new Map(
    targets.map((t) => [
      JSON.stringify([t.organizationId, t.projectId, t.environment]),
      {
        organizationId: t.organizationId,
        projectId: t.projectId,
        environment: t.environment,
      },
    ]),
  );
  const diagnostics: string[] = [];
  // A global claim error has no tenant identity. Never copy a potentially
  // cross-tenant database exception into every configured project's diagnostics.
  const attributable = failure?.scope
    ? [failure.scope]
    : scopes.size === 1
      ? [...scopes.values()]
      : [];
  for (const scope of attributable) {
    const id = await recordErrorDiagnostic(db, scope, error, {
      service: "kortyx-eval-worker",
      correlation: {
        phase: failure?.phase ?? "retirement",
        ...(failure?.suiteRunId ? { suiteRunId: failure.suiteRunId } : {}),
      },
    });
    if (id) diagnostics.push(id);
  }
  // Keep a bounded database/network code useful even when its diagnostic store
  // is unavailable. Messages, SQL, parameters and stacks stay out of logs.
  let failureCode: string | undefined;
  try {
    let cause = failure?.cause ?? error;
    if (cause instanceof AggregateError) cause = cause.errors.at(-1);
    const code =
      cause && typeof cause === "object"
        ? Object.getOwnPropertyDescriptor(cause, "code")
        : undefined;
    if (
      code &&
      "value" in code &&
      typeof code.value === "string" &&
      /^(?:[A-Z0-9]{5}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE)$/.test(
        code.value,
      )
    )
      failureCode = code.value;
  } catch {
    /* Optional safe metadata must not replace the failure. */
  }
  console.error(
    JSON.stringify({
      event: "eval-worker-retirement-failed",
      phase: failure?.phase ?? "retirement",
      ...(failure ? { owner: failure.owner } : {}),
      ...(failure?.suiteRunId ? { suiteRunId: failure.suiteRunId } : {}),
      diagnosticIds: diagnostics,
      ...(failureCode ? { failureCode } : {}),
      message:
        "Retain the owner and dependencies. Check diagnostics and retry draining after unresolved claims have settled.",
    }),
  );
}
