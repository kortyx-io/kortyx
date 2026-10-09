import { createHash } from "node:crypto";
import {
  DIAGNOSTIC_LIMITS,
  DiagnosticContentSchema,
  type DiagnosticManifest,
  type DiagnosticResponse,
  redactDiagnosticContent,
  redactDiagnosticText,
} from "@kortyx/telemetry-contracts";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryNotFoundError, TelemetryValidationError } from "../errors";
import {
  diagnosticAccess,
  errorDiagnosticParts,
  errorDiagnostics,
} from "../schema";
import { ensureProjectEnvironmentAllowed } from "./projects";

type Scope = {
  organizationId: string;
  projectId: string;
  environment: string;
  diagnosticId: string;
};
const where = (scope: Scope) =>
  and(
    eq(errorDiagnostics.organizationId, scope.organizationId),
    eq(errorDiagnostics.projectId, scope.projectId),
    eq(errorDiagnostics.environment, scope.environment),
    eq(errorDiagnostics.diagnosticId, scope.diagnosticId),
  );
const digest = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const retentionDays = () => {
  const configured = Number(process.env.KORTYX_DIAGNOSTIC_RETENTION_DAYS ?? 30);
  return Number.isFinite(configured) && configured >= 1 && configured <= 365
    ? configured
    : 30;
};

export async function expireErrorDiagnostics(
  db: TelemetryDb,
  scope: Pick<Scope, "organizationId" | "projectId">,
) {
  const expired = await db
    .update(errorDiagnostics)
    .set({ state: "expired", content: null })
    .where(
      and(
        eq(errorDiagnostics.organizationId, scope.organizationId),
        eq(errorDiagnostics.projectId, scope.projectId),
        lt(errorDiagnostics.expiresAt, new Date()),
      ),
    )
    .returning({ id: errorDiagnostics.id });
  if (expired.length)
    await db.delete(errorDiagnosticParts).where(
      inArray(
        errorDiagnosticParts.diagnosticRecordId,
        expired.map((item) => item.id),
      ),
    );
  await db
    .delete(errorDiagnostics)
    .where(
      and(
        eq(errorDiagnostics.organizationId, scope.organizationId),
        eq(errorDiagnostics.projectId, scope.projectId),
        lt(errorDiagnostics.expiresAt, new Date(Date.now() - 7 * 86400_000)),
      ),
    );
}

export async function beginErrorDiagnostic(
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    manifest: DiagnosticManifest;
  },
) {
  const { manifest } = input;
  await ensureProjectEnvironmentAllowed(db, {
    ...input,
    environment: manifest.environment,
  });
  return db.transaction(async (tx) => {
    const database = tx as unknown as TelemetryDb;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.organizationId}), hashtext(${input.projectId}))`,
    );
    await expireErrorDiagnostics(database, input);
    const scope = {
      ...input,
      environment: manifest.environment,
      diagnosticId: manifest.diagnosticId,
    };
    const [existing] = await tx
      .select()
      .from(errorDiagnostics)
      .where(where(scope))
      .limit(1);
    const safeManifest = {
      ...manifest,
      summary: {
        type: redactDiagnosticText(manifest.summary.type),
        message: redactDiagnosticText(manifest.summary.message),
      },
    };
    if (existing) {
      const canonical = (value: unknown): unknown =>
        Array.isArray(value)
          ? value.map(canonical)
          : value && typeof value === "object"
            ? Object.fromEntries(
                Object.entries(value)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, nested]) => [key, canonical(nested)]),
              )
            : value;
      if (
        JSON.stringify(canonical(existing.manifest)) !==
        JSON.stringify(canonical(safeManifest))
      )
        throw new TelemetryValidationError(
          "Diagnostic identity conflicts with an existing upload.",
        );
      return { state: existing.state };
    }
    const [usage] = await tx
      .select({
        bytes: sql<number>`coalesce(sum((${errorDiagnostics.manifest}->>'byteLength')::bigint), 0)`,
      })
      .from(errorDiagnostics)
      .where(
        and(
          eq(errorDiagnostics.organizationId, input.organizationId),
          eq(errorDiagnostics.projectId, input.projectId),
          sql`${errorDiagnostics.state} <> 'expired'`,
        ),
      );
    const limit = Number(
      process.env.KORTYX_DIAGNOSTIC_PROJECT_BYTES ?? 256 * 1024 * 1024,
    );
    if (
      Number(usage?.bytes ?? 0) + manifest.byteLength >
      (Number.isFinite(limit) && limit > 0 ? limit : 256 * 1024 * 1024)
    )
      throw new TelemetryValidationError(
        "Project diagnostic storage budget exceeded.",
      );
    await tx.insert(errorDiagnostics).values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      diagnosticId: manifest.diagnosticId,
      environment: manifest.environment,
      manifest: safeManifest,
      expiresAt: new Date(Date.now() + 86400_000),
    });
    return { state: "pending" };
  });
}

export async function putErrorDiagnosticPart(
  db: TelemetryDb,
  scope: Scope,
  part: { index: number; data: string },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(errorDiagnostics)
      .where(where(scope))
      .for("update")
      .limit(1);
    if (!row) throw new TelemetryNotFoundError("Diagnostic upload not found.");
    if (row.expiresAt.getTime() <= Date.now())
      throw new TelemetryValidationError("Diagnostic upload expired.");
    if (row.state === "available") return { state: "available" };
    const bytes = Buffer.from(part.data, "base64");
    const expected =
      part.index === row.manifest.partCount - 1
        ? row.manifest.byteLength - part.index * DIAGNOSTIC_LIMITS.partBytes
        : DIAGNOSTIC_LIMITS.partBytes;
    if (
      part.index >= row.manifest.partCount ||
      bytes.length !== expected ||
      bytes.toString("base64") !== part.data
    )
      throw new TelemetryValidationError(
        "Diagnostic part length or encoding is invalid.",
      );
    const [existing] = await tx
      .select()
      .from(errorDiagnosticParts)
      .where(
        and(
          eq(errorDiagnosticParts.diagnosticRecordId, row.id),
          eq(errorDiagnosticParts.index, part.index),
        ),
      )
      .limit(1);
    if (existing && existing.data !== part.data)
      throw new TelemetryValidationError(
        "Diagnostic part conflicts with an existing part.",
      );
    if (!existing)
      await tx.insert(errorDiagnosticParts).values({
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        diagnosticRecordId: row.id,
        index: part.index,
        data: part.data,
      });
    return { state: row.state };
  });
}

export async function completeErrorDiagnostic(db: TelemetryDb, scope: Scope) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(errorDiagnostics)
      .where(where(scope))
      .for("update")
      .limit(1);
    if (!row) throw new TelemetryNotFoundError("Diagnostic upload not found.");
    if (row.expiresAt.getTime() <= Date.now())
      throw new TelemetryValidationError("Diagnostic upload expired.");
    if (row.state === "available") return { state: "available" };
    const parts = await tx
      .select()
      .from(errorDiagnosticParts)
      .where(eq(errorDiagnosticParts.diagnosticRecordId, row.id))
      .orderBy(asc(errorDiagnosticParts.index));
    const bytes = Buffer.concat(
      parts.map((part) => Buffer.from(part.data, "base64")),
    );
    if (
      parts.length !== row.manifest.partCount ||
      parts.some((part, index) => part.index !== index) ||
      bytes.length !== row.manifest.byteLength ||
      digest(bytes) !== row.manifest.checksum
    ) {
      await tx
        .update(errorDiagnostics)
        .set({ state: "incomplete" })
        .where(eq(errorDiagnostics.id, row.id));
      return { state: "incomplete" };
    }
    let content: import("@kortyx/telemetry-contracts").DiagnosticContent;
    try {
      content = redactDiagnosticContent(
        DiagnosticContentSchema.parse(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        ),
      );
    } catch {
      await tx
        .update(errorDiagnostics)
        .set({ state: "incomplete" })
        .where(eq(errorDiagnostics.id, row.id));
      return { state: "incomplete" };
    }
    const serialized = JSON.stringify(content);
    if (Buffer.byteLength(serialized) > DIAGNOSTIC_LIMITS.bytes) {
      await tx
        .update(errorDiagnostics)
        .set({ state: "incomplete" })
        .where(eq(errorDiagnostics.id, row.id));
      return { state: "incomplete" };
    }
    await tx
      .update(errorDiagnostics)
      .set({
        state: "available",
        content: serialized,
        expiresAt: new Date(
          row.createdAt.getTime() + retentionDays() * 86400_000,
        ),
      })
      .where(eq(errorDiagnostics.id, row.id));
    await tx
      .delete(errorDiagnosticParts)
      .where(eq(errorDiagnosticParts.diagnosticRecordId, row.id));
    return { state: "available" };
  });
}

export async function getErrorDiagnostic(
  db: TelemetryDb,
  scope: Scope,
  actor: string,
  download = false,
): Promise<DiagnosticResponse> {
  await expireErrorDiagnostics(db, scope);
  const [row] = await db
    .select()
    .from(errorDiagnostics)
    .where(where(scope))
    .limit(1);
  if (!row)
    throw new TelemetryNotFoundError(
      "Diagnostic was not received or is no longer retained.",
    );
  const [parts] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(errorDiagnosticParts)
    .where(eq(errorDiagnosticParts.diagnosticRecordId, row.id));
  await db.insert(diagnosticAccess).values({
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    diagnosticId: scope.diagnosticId,
    actor,
    action: download ? "download" : "view",
  });
  return {
    manifest: row.manifest,
    state: row.state as DiagnosticResponse["state"],
    expiresAt: row.expiresAt.toISOString(),
    receivedParts:
      row.state === "available" ? row.manifest.partCount : (parts?.count ?? 0),
    content: row.content
      ? DiagnosticContentSchema.parse(JSON.parse(row.content))
      : null,
    contentChecksum: row.content ? digest(row.content) : null,
    contentByteLength: row.content ? Buffer.byteLength(row.content) : null,
  };
}
