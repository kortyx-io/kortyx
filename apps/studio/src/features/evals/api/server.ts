import { sampleResponse } from "@/features/sample-project/http";
import {
  isSampleProject,
  readSampleProjectPreference,
} from "@/features/sample-project/server";
import "server-only";
import {
  EVAL_COMPARISON_LIMITS,
  StudioEvalLiveDetailSchema,
  StudioEvaluationComparisonSchema,
  StudioEvaluationDetailSchema,
  StudioEvaluationHistorySchema,
} from "@kortyx/agent/evals";
import { STUDIO_API_PROTOCOL_VERSION } from "@kortyx/telemetry-contracts";
import { studioAuth } from "@studio/auth";
import { studioUsage } from "@studio/usage";
import { z } from "zod";
import { readBoundedJson } from "@/lib/read-bounded-json";
import {
  EvalDetailSchema,
  EvalHistorySchema,
  EvalTargetsResponseSchema,
} from "../schema";

async function read<T>(
  kind:
    | "targets"
    | "runs"
    | "run"
    | "case"
    | "live"
    | "capabilities"
    | "evaluations"
    | "evaluation"
    | "evaluation_table"
    | "comparison",
  path: string,
  schema: z.ZodType<T>,
  request?: Request,
  maxBytes?: number,
): Promise<T> {
  if (await isSampleProject(request)) {
    if (request && !(await readSampleProjectPreference()).visible)
      throw new Error("Sample project is unavailable.");
    const response = sampleResponse(`/v1/studio/evals/${path}`);
    if (!response.ok) throw new Error("Sample evaluation unavailable.");
    return schema.parse(await response.json());
  }
  const scope = studioUsage.server.start("studio.read", {
    resource: "evals",
    action: "view",
    eval_read: kind,
    origin: "server",
  });
  let phase: "configuration" | "network" | "http" | "parse" = "configuration";
  try {
    const url = process.env.KORTYX_API_URL;
    const credential = await studioAuth.getApiCredential(request);
    if (!url || !credential) {
      scope.end("failed", {
        phase,
        error_code: "STUDIO_NOT_CONFIGURED",
        error_category: "configuration",
        retryable: false,
      });
      throw new Error("Studio API is not configured.");
    }
    phase = "network";
    const response = await fetch(
      `${url.replace(/\/$/, "")}/v1/studio/evals/${path}`,
      {
        headers: {
          authorization: credential.authorization,
          "x-kortyx-studio-api-version": STUDIO_API_PROTOCOL_VERSION,
          ...(credential.environment
            ? { "x-kortyx-environment": credential.environment }
            : {}),
          ...(credential.environmentId
            ? { "x-kortyx-environment-id": credential.environmentId }
            : {}),
          ...(credential.projectId
            ? { "x-kortyx-project-id": credential.projectId }
            : {}),
        },
        cache: "no-store",
        signal: request
          ? AbortSignal.any([request.signal, AbortSignal.timeout(20_000)])
          : AbortSignal.timeout(20_000),
        redirect: "error",
      },
    );
    if (!response.ok) {
      phase = "http";
      scope.end("failed", { phase, http_status: String(response.status) });
      throw new Error(
        "Eval service is unavailable. Check the API version and connection.",
      );
    }
    phase = "parse";
    const result = schema.parse(
      maxBytes
        ? await readBoundedJson(response, maxBytes)
        : await response.json(),
    );
    scope.end();
    return result;
  } catch (error) {
    if (request?.signal.aborted) scope.end("cancelled", { phase });
    else if (phase === "parse") {
      const issue = error instanceof z.ZodError ? error.issues[0] : undefined;
      // Reuse the shared error/cause classifier; the catalog drops arbitrary
      // fields, customer keys, exception text, URLs and response content.
      scope.fail(
        {
          code: "STUDIO_RESPONSE_INVALID",
          category: "validation",
          retryable: false,
          cause: error,
        },
        {
          phase,
          response_failure:
            error instanceof z.ZodError
              ? "schema"
              : error instanceof SyntaxError
                ? "json"
                : "body",
          ...(issue
            ? { validation_issue: issue.code, validation_field: issue.path[0] }
            : {}),
        },
      );
    } else scope.fail(error, { phase });
    throw error;
  }
}
export const readEvalTargets = () =>
  read("targets", "targets", EvalTargetsResponseSchema);
export const readEvalHistory = (latestPerSuite = false) =>
  read(
    "runs",
    latestPerSuite ? "runs?latestPerSuite=true" : "runs",
    EvalHistorySchema,
  );
export const readEvalDetail = (id: string) =>
  read("run", `runs/${encodeURIComponent(id)}`, EvalDetailSchema);

export const readEvaluationHistory = (request?: Request) =>
  read("evaluations", "evaluations", StudioEvaluationHistorySchema, request);
export const readEvaluationDetail = (id: string, request?: Request) =>
  read(
    "evaluation",
    `evaluations/${encodeURIComponent(id)}`,
    StudioEvaluationDetailSchema,
    request,
  );
export const readEvaluationComparison = (id: string, request?: Request) =>
  read(
    "comparison",
    `evaluations/${encodeURIComponent(id)}/comparison`,
    StudioEvaluationComparisonSchema,
    request,
    EVAL_COMPARISON_LIMITS.responseBytes,
  );

export const readEvaluationTable = (
  query: Record<string, string | string[] | undefined> = {},
) =>
  read(
    "evaluation_table",
    `evaluations/table?${new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (value === undefined ? [] : [[key, Array.isArray(value) ? value.join(",") : value]])))}`,
    StudioEvaluationHistorySchema.extend({
      totalCount: z.number().int().nonnegative(),
    }),
  );

export const readEvalLiveDetail = (id: string) =>
  read(
    "live",
    `runs/${encodeURIComponent(id)}/live`,
    StudioEvalLiveDetailSchema,
  );
export const readEvalCapabilities = () =>
  read("capabilities", "capabilities", z.object({ canRun: z.boolean() }));
export const readEvalCase = (id: string, caseId: string, repetition: number) =>
  read(
    "case",
    `runs/${encodeURIComponent(id)}/case?${new URLSearchParams({ caseId, repetition: String(repetition) })}`,
    EvalDetailSchema,
  );
