import { createOpenAI } from "@kortyx/openai";
import { createOpenRouter } from "@kortyx/openrouter";
import {
  type EvaluatorExecution,
  JudgeVerdictSchema,
} from "@kortyx/telemetry-contracts";
import { z } from "zod";
export interface EvaluatorModelService {
  models: readonly string[];
  provider?: string;
  invoke(
    model: string,
    messages: EvaluatorExecution["renderedMessages"],
    signal: AbortSignal,
    onUsage: (usage: NonNullable<EvaluatorExecution["usage"]>) => void,
  ): Promise<unknown>;
}
export function loadEvaluatorModels(
  env: NodeJS.ProcessEnv = process.env,
): EvaluatorModelService | undefined {
  const key = env.KORTYX_EVAL_JUDGE_API_KEY?.trim();
  const configured = [
    env.KORTYX_EVAL_JUDGE_MODEL,
    ...(env.KORTYX_EVALUATOR_MODELS ?? "").split(","),
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
  if (!key || !configured.length) return undefined;
  const baseUrl = env.KORTYX_EVAL_JUDGE_BASE_URL?.trim();
  if (baseUrl && new URL(baseUrl).protocol !== "https:")
    throw new Error("Evaluator model URLs require HTTPS.");
  const provider =
    baseUrl && new URL(baseUrl).hostname === "openrouter.ai"
      ? createOpenRouter({ apiKey: key, baseUrl })
      : createOpenAI({
          apiKey: key,
          api:
            env.KORTYX_EVAL_JUDGE_API === "chat-completions"
              ? "chat-completions"
              : "responses",
          ...(baseUrl ? { baseUrl } : {}),
        });
  const models = [...new Set(configured)];
  return {
    models,
    provider: provider.id,
    async invoke(model, messages, signal, onUsage) {
      if (!models.includes(model))
        throw new Error("Model is not enabled by this installation.");
      const result = await provider(model)
        .provider.getModel(model, {
          streaming: false,
          abortSignal: signal,
          maxOutputTokens: 4096,
          responseFormat: {
            type: "json",
            name: "judge_preview",
            schema: z.toJSONSchema(JudgeVerdictSchema),
          },
        })
        .invoke(messages);
      const metadata = result.providerMetadata;
      const cost =
        metadata?.isByok === true
          ? (
              metadata.costDetails as
                | { upstreamInferenceCost?: unknown }
                | undefined
            )?.upstreamInferenceCost
          : metadata?.cost;
      const tokenUsage = Object.fromEntries(
        Object.entries(result.usage ?? {}).filter(
          ([key, value]) =>
            [
              "input",
              "output",
              "total",
              "reasoning",
              "cacheRead",
              "cacheWrite",
              "cacheWrite1h",
              "inputIncludesCacheRead",
              "inputIncludesCacheWrite",
              "outputIncludesReasoning",
            ].includes(key) &&
            ((typeof value === "number" &&
              Number.isFinite(value) &&
              value >= 0) ||
              typeof value === "boolean"),
        ),
      ) as Record<string, number | boolean>;
      onUsage({
        tokenUsage,
        costSource:
          provider.id === "openrouter" && typeof cost === "number"
            ? "provider"
            : "unavailable",
        inputTokens: result.usage?.input ?? null,
        outputTokens: result.usage?.output ?? null,
        costUsd:
          provider.id === "openrouter" &&
          typeof cost === "number" &&
          Number.isFinite(cost) &&
          cost >= 0
            ? cost
            : null,
      });
      signal.throwIfAborted();
      if (result.finishReason && result.finishReason.unified !== "stop")
        throw new Error("Judge response was incomplete.");
      return JudgeVerdictSchema.parse(JSON.parse(result.content));
    },
  };
}
