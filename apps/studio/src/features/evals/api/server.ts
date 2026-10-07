import "server-only";
import {
  StudioEvaluationDetailSchema,
  StudioEvaluationHistorySchema,
} from "@kortyx/agent/evals";
import { studioAuth } from "@studio/auth";
import type { z } from "zod";
import {
  EvalDetailSchema,
  EvalHistorySchema,
  EvalTargetsResponseSchema,
} from "../schema";

async function read<T>(path: string, schema: z.ZodType<T>): Promise<T> {
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
export const readEvalHistory = () => read("runs", EvalHistorySchema);
export const readEvalDetail = (id: string) =>
  read(`runs/${encodeURIComponent(id)}`, EvalDetailSchema);

export const readEvaluationHistory = () =>
  read("evaluations", StudioEvaluationHistorySchema);
export const readEvaluationDetail = (id: string) =>
  read(`evaluations/${encodeURIComponent(id)}`, StudioEvaluationDetailSchema);
