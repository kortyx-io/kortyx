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
export async function recordErrorDiagnostic(
  db: TelemetryDb,
  scope: { organizationId: string; projectId: string; environment: string },
  error: unknown,
  options: {
    content?: import("@kortyx/telemetry-contracts").DiagnosticContent;
    correlation?: import("@kortyx/telemetry-contracts").DiagnosticManifest["correlation"];
    severity?: "error" | "warning";
    service?: string;
  } = {},
): Promise<string | undefined> {
  try {
    const content = options.content ?? captureDiagnosticContent(error);
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
        occurrenceId: randomUUID(),
        occurredAt: new Date().toISOString(),
        environment: scope.environment,
        service: { name: options.service ?? "kortyx-api" },
        correlation: options.correlation ?? {},
        handled: true,
        severity: options.severity ?? "error",
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
  } // Diagnostics never replace the original execution outcome.
}
