import { createHash, randomUUID } from "node:crypto";
import {
  captureDiagnosticContent,
  summarizeDiagnostic,
} from "@kortyx/hooks/internal";
import { DIAGNOSTIC_LIMITS } from "@kortyx/telemetry-contracts";
import {
  beginErrorDiagnostic,
  completeErrorDiagnostic,
  putErrorDiagnosticPart,
  type TelemetryDb,
} from "@kortyx/telemetry-db";

/** Reuse the same redaction, budgets, tenant scope and retention as SDK diagnostics. */
export async function recordEvalDiagnostic(
  db: TelemetryDb,
  scope: { organizationId: string; projectId: string; environment: string },
  error: unknown,
): Promise<string | undefined> {
  try {
    const content = captureDiagnosticContent(error);
    if (!content) return undefined;
    const bytes = Buffer.from(JSON.stringify(content));
    const diagnosticId = randomUUID();
    const summary = summarizeDiagnostic(content.data);
    const partCount = Math.ceil(bytes.length / DIAGNOSTIC_LIMITS.partBytes);
    await beginErrorDiagnostic(db, {
      ...scope,
      manifest: {
        schemaVersion: 1,
        diagnosticId,
        occurrenceId: diagnosticId,
        occurredAt: new Date().toISOString(),
        environment: scope.environment,
        service: { name: "kortyx-eval-worker" },
        correlation: {},
        handled: true,
        severity: "error",
        mechanism: "report",
        summary: {
          type: summary?.type ?? "Error",
          message: summary?.message ?? "Evaluation execution failed.",
        },
        captureStatus: content.capture.status,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.length,
        partCount,
      },
    });
    for (let index = 0; index < partCount; index++)
      await putErrorDiagnosticPart(
        db,
        { ...scope, diagnosticId },
        {
          index,
          data: bytes
            .subarray(
              index * DIAGNOSTIC_LIMITS.partBytes,
              (index + 1) * DIAGNOSTIC_LIMITS.partBytes,
            )
            .toString("base64"),
        },
      );
    await completeErrorDiagnostic(db, { ...scope, diagnosticId });
    return diagnosticId;
  } catch {
    return undefined;
  } // Diagnostics never replace the original evaluation outcome.
}
