import { z } from "zod";

export const DIAGNOSTIC_LIMITS = {
  bytes: 8 * 1024 * 1024,
  partBytes: 64 * 1024,
  parts: 128,
  nodes: 10_000,
  depth: 128,
  properties: 1_000,
} as const;

export const DiagnosticNoteSchema = z
  .object({
    path: z.string().max(4096),
    reason: z.string().max(128),
    originalBytes: z.number().int().nonnegative().optional(),
    originalCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export const DiagnosticContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    data: z.record(z.string(), z.unknown()),
    capture: z
      .object({
        status: z.enum(["complete", "partial", "failed"]),
        omissions: z.array(DiagnosticNoteSchema).max(10_000),
        redactions: z.array(DiagnosticNoteSchema).max(10_000),
      })
      .strict(),
  })
  .strict();
export type DiagnosticContent = z.infer<typeof DiagnosticContentSchema>;
export type DiagnosticNote = z.infer<typeof DiagnosticNoteSchema>;

export const DiagnosticCorrelationSchema = z
  .object({
    runId: z.string().optional(),
    workflowId: z.string().optional(),
    nodeId: z.string().optional(),
    sessionId: z.string().optional(),
    invocationId: z.string().optional(),
    parentInvocationId: z.string().optional(),
    branchId: z.string().optional(),
    toolCallId: z.string().optional(),
    attemptId: z.string().optional(),
    workflowRevisionId: z.string().optional(),
    traceId: z.string().optional(),
    spanId: z.string().optional(),
    parentSpanId: z.string().optional(),
  })
  .strict();

export const DiagnosticManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    diagnosticId: z.string().uuid(),
    occurrenceId: z.string().uuid(),
    occurredAt: z.string().datetime({ offset: true }),
    environment: z.string().min(1).max(256),
    service: z
      .object({
        name: z.string().min(1).max(256),
        deploymentRef: z.string().max(1024).optional(),
      })
      .strict(),
    correlation: DiagnosticCorrelationSchema,
    handled: z.boolean(),
    severity: z.enum(["warning", "error"]),
    mechanism: z.enum(["span", "report", "tool"]),
    summary: z
      .object({ type: z.string().max(256), message: z.string().max(8192) })
      .strict(),
    captureStatus: z.enum(["complete", "partial", "failed"]),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.number().int().min(1).max(DIAGNOSTIC_LIMITS.bytes),
    partCount: z.number().int().min(1).max(DIAGNOSTIC_LIMITS.parts),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.partCount !==
      Math.ceil(value.byteLength / DIAGNOSTIC_LIMITS.partBytes)
    )
      ctx.addIssue({
        code: "custom",
        path: ["partCount"],
        message: "Part count does not match byte length.",
      });
  });
export type DiagnosticManifest = z.infer<typeof DiagnosticManifestSchema>;
export const DiagnosticPartSchema = z
  .object({
    index: z
      .number()
      .int()
      .min(0)
      .max(DIAGNOSTIC_LIMITS.parts - 1),
    data: z
      .string()
      .max(Math.ceil(DIAGNOSTIC_LIMITS.partBytes / 3) * 4)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      ),
  })
  .strict();
export const DiagnosticResponseSchema = z
  .object({
    manifest: DiagnosticManifestSchema,
    state: z.enum(["pending", "available", "incomplete", "expired"]),
    receivedParts: z.number().int().nonnegative(),
    expiresAt: z.string().datetime({ offset: true }),
    content: DiagnosticContentSchema.nullable(),
    contentChecksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    contentByteLength: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type DiagnosticResponse = z.infer<typeof DiagnosticResponseSchema>;

/** Shared mandatory policy for diagnostic keys and embedded credential text. */
export const isPrivateDiagnosticField = (key: string) =>
  /^(?:password|passwd|secret|clientsecret|privatekey|credential|credentials|authorization|proxyauthorization|bearer|bearertoken|jwt|token|accesstoken|refreshtoken|authtoken|apikey|xapikey|apitoken|xauthtoken|xaccesstoken|awsaccesskeyid|awssecretaccesskey|awssessiontoken|xamzsecuritytoken|apisecret|cookie|setcookie|resumehandle|resumetoken)$/.test(
    key.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );

export function redactDiagnosticText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /\b(?:ktyx_(?:test|live)_[^\s"'<>]+|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g,
      "[REDACTED]",
    )
    .replace(
      /(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|token|client[_-]?secret|authorization|cookie)["']?\s*[:=]\s*)(["'])(.*?)\2/gi,
      "$1$2[REDACTED]$2",
    )
    .replace(
      /(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|token|client[_-]?secret)\s*[:=]\s*)(?!["'[])[^\s,;}&]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /(\b(?:authorization|proxy-authorization)\s*:\s*Basic\s+)[A-Za-z0-9+/=]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /([?&](?:api[_-]?key|token|access[_-]?token|password)=)[^&#\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@");
}

/** A summary intentionally omits custom fields; the diagnostic preserves them. */
export function summarizeDiagnostic(
  data: Record<string, unknown>,
  depth = 0,
): { type: string; message: string; stack?: string; cause?: unknown } {
  return {
    type: typeof data.type === "string" ? data.type.slice(0, 256) : "Error",
    message:
      typeof data.message === "string"
        ? data.message.slice(0, 8192)
        : "Execution reported a fault.",
    ...(typeof data.stack === "string"
      ? { stack: data.stack.slice(0, 32768) }
      : {}),
    ...(depth < 4 &&
    data.cause &&
    typeof data.cause === "object" &&
    !Array.isArray(data.cause)
      ? {
          cause: summarizeDiagnostic(
            data.cause as Record<string, unknown>,
            depth + 1,
          ),
        }
      : {}),
  };
}

/** Defense in depth for JSON received directly by the diagnostic API. */
export function redactDiagnosticContent(
  content: DiagnosticContent,
): DiagnosticContent {
  const redactions = [...content.capture.redactions];
  const omissions = [...content.capture.omissions];
  let nodes = 0;
  const visit = (value: unknown, path: string, depth = 0): unknown => {
    if (++nodes > DIAGNOSTIC_LIMITS.nodes || depth > DIAGNOSTIC_LIMITS.depth) {
      const reason =
        depth > DIAGNOSTIC_LIMITS.depth
          ? "server_depth_limit"
          : "server_node_limit";
      if (omissions.length < 10_000)
        omissions.push({ path: path.slice(0, 4096), reason });
      return { $omitted: reason };
    }
    if (typeof value === "string") {
      const clean = redactDiagnosticText(value);
      if (clean !== value && redactions.length < 10_000)
        redactions.push({
          path: path.slice(0, 4096),
          reason: "server_credential_text",
        });
      return clean;
    }
    if (Array.isArray(value)) {
      if (
        value.length > DIAGNOSTIC_LIMITS.properties &&
        omissions.length < 10_000
      )
        omissions.push({
          path: path.slice(0, 4096),
          reason: "server_collection_limit",
          originalCount: value.length,
        });
      return value
        .slice(0, DIAGNOSTIC_LIMITS.properties)
        .map((item, index) => visit(item, `${path}/${index}`, depth + 1));
    }
    if (value && typeof value === "object") {
      const keys = Object.keys(value);
      if (
        keys.length > DIAGNOSTIC_LIMITS.properties &&
        omissions.length < 10_000
      )
        omissions.push({
          path: path.slice(0, 4096),
          reason: "server_property_limit",
          originalCount: keys.length,
        });
      return Object.fromEntries(
        keys.slice(0, DIAGNOSTIC_LIMITS.properties).map((key) => {
          const nested = (value as Record<string, unknown>)[key];
          if (isPrivateDiagnosticField(key)) {
            if (redactions.length < 10_000 && nested !== "[REDACTED]")
              redactions.push({
                path: `${path}/${key}`.slice(0, 4096),
                reason: "server_credential_field",
              });
            return [key, "[REDACTED]"];
          }
          return [key, visit(nested, `${path}/${key}`, depth + 1)];
        }),
      );
    }
    return value;
  };
  return {
    ...content,
    data: visit(content.data, "#/data") as Record<string, unknown>,
    capture: {
      ...content.capture,
      status:
        content.capture.status === "failed"
          ? "failed"
          : omissions.length
            ? "partial"
            : "complete",
      omissions: omissions.map((note) => ({
        ...note,
        path: redactDiagnosticText(note.path),
        reason: redactDiagnosticText(note.reason),
      })),
      redactions: redactions.map((note) => ({
        ...note,
        path: redactDiagnosticText(note.path),
        reason: redactDiagnosticText(note.reason),
      })),
    },
  };
}
