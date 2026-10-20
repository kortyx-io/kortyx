import { sampleResponse } from "@/features/sample-project/http";
import { isSampleProject } from "@/features/sample-project/server";
import "server-only";
import {
  StudioEvalLiveDetailSchema,
  StudioEvaluationDetailSchema,
  StudioEvaluationHistorySchema,
} from "@kortyx/agent/evals";
import { studioAuth } from "@studio/auth";
import { z } from "zod";
import {
  EvalDetailSchema,
  EvalHistorySchema,
  EvalTargetsResponseSchema,
} from "../schema";

async function read<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  if (await isSampleProject()) {
    const response = sampleResponse(`/v1/studio/evals/${path}`);
    if (!response.ok) throw new Error("Sample evaluation unavailable.");
    return schema.parse(await response.json());
  }
  const url = process.env.KORTYX_API_URL;
  const credential = await studioAuth.getApiCredential();
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
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok)
    throw new Error(
      "Eval service is unavailable. Check the API version and connection.",
    );
  return schema.parse(await response.json());
}
export const readEvalTargets = () => read("targets", EvalTargetsResponseSchema);
export const readEvalHistory = (latestPerSuite = false) =>
  read(latestPerSuite ? "runs?latestPerSuite=true" : "runs", EvalHistorySchema);
export const readEvalDetail = (id: string) =>
  read(`runs/${encodeURIComponent(id)}`, EvalDetailSchema);

export const readEvaluationHistory = () =>
  read("evaluations", StudioEvaluationHistorySchema);
export const readEvaluationDetail = (id: string) =>
  read(`evaluations/${encodeURIComponent(id)}`, StudioEvaluationDetailSchema);

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
