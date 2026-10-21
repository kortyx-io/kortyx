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
import { studioAuth } from "@studio/auth";
import { z } from "zod";
import { readBoundedJson } from "@/lib/read-bounded-json";
import {
  EvalDetailSchema,
  EvalHistorySchema,
  EvalTargetsResponseSchema,
} from "../schema";

async function read<T>(
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
  const url = process.env.KORTYX_API_URL;
  const credential = await studioAuth.getApiCredential(request);
  if (!url || !credential) throw new Error("Studio API is not configured.");
  const response = await fetch(
    `${url.replace(/\/$/, "")}/v1/studio/evals/${path}`,
    {
      headers: {
        authorization: credential.authorization,
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
  if (!response.ok)
    throw new Error(
      "Eval service is unavailable. Check the API version and connection.",
    );
  return schema.parse(
    maxBytes
      ? await readBoundedJson(response, maxBytes)
      : await response.json(),
  );
}
export const readEvalTargets = () => read("targets", EvalTargetsResponseSchema);
export const readEvalHistory = (latestPerSuite = false) =>
  read(latestPerSuite ? "runs?latestPerSuite=true" : "runs", EvalHistorySchema);
export const readEvalDetail = (id: string) =>
  read(`runs/${encodeURIComponent(id)}`, EvalDetailSchema);

export const readEvaluationHistory = (request?: Request) =>
  read("evaluations", StudioEvaluationHistorySchema, request);
export const readEvaluationDetail = (id: string, request?: Request) =>
  read(
    `evaluations/${encodeURIComponent(id)}`,
    StudioEvaluationDetailSchema,
    request,
  );
export const readEvaluationComparison = (id: string, request?: Request) =>
  read(
    `evaluations/${encodeURIComponent(id)}/comparison`,
    StudioEvaluationComparisonSchema,
    request,
    EVAL_COMPARISON_LIMITS.responseBytes,
  );

export const readEvaluationTable = (
  query: Record<string, string | string[] | undefined> = {},
) =>
  read(
    `evaluations/table?${new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (value === undefined ? [] : [[key, Array.isArray(value) ? value.join(",") : value]])))}`,
    StudioEvaluationHistorySchema.extend({
      totalCount: z.number().int().nonnegative(),
    }),
  );

export const readEvalLiveDetail = (id: string) =>
  read(`runs/${encodeURIComponent(id)}/live`, StudioEvalLiveDetailSchema);
export const readEvalCapabilities = () =>
  read("capabilities", z.object({ canRun: z.boolean() }));
export const readEvalCase = (id: string, caseId: string, repetition: number) =>
  read(
    `runs/${encodeURIComponent(id)}/case?${new URLSearchParams({ caseId, repetition: String(repetition) })}`,
    EvalDetailSchema,
  );
