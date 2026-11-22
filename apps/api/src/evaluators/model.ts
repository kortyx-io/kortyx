import { createOpenAI } from "@kortyx/openai";
import { createOpenRouter } from "@kortyx/openrouter";
import type {
  EvaluatorExecution,
  ScoreGroup,
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
    context?: { group: ScoreGroup; evidenceId: string; eventIds: string[] },
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
    async invoke(model, messages, signal, onUsage, context) {
      if (!models.includes(model))
        throw new Error("Model is not enabled by this installation.");
      if (!context)
        throw new Error("A score group and evidence snapshot are required.");
      const recordingReference = z
        .object({
          recordingId: z.literal(context.evidenceId),
          path: z.string().nullable(),
        })
        .strict();
      const reference = context.eventIds.length
        ? z.union([
            recordingReference,
            z
              .object({
                eventId: z.enum(context.eventIds),
                path: z.string().nullable(),
              })
              .strict(),
          ])
        : recordingReference;
      const fields = Object.fromEntries(
        context.group.fields.map((field) => {
          const values = {
            text: z
              .string()
              .min(1)
              .max(field.type === "text" ? field.maxLength : 4000),
            boolean: z.boolean(),
            numeric: z
              .number()
              .min(field.type === "numeric" ? field.min : -1e15)
              .max(field.type === "numeric" ? field.max : 1e15),
            categorical:
              field.type === "categorical"
                ? z.enum(field.categories)
                : z.string(),
          };
          const scored = z
            .object({
              status: z.literal("scored"),
              value: values[field.type],
              evidence: z.array(reference).max(20),
            })
            .strict();
          return [
            field.id,
            field.abstain
              ? z.union([
                  scored,
                  z
                    .object({
                      status: z.enum([
                        "not_applicable",
                        "insufficient_evidence",
                      ]),
                      value: z.null(),
                      evidence: z.array(reference).max(20),
                    })
                    .strict(),
                ])
              : scored,
          ];
        }),
      );
      const responseSchema = z
        .object({ scores: z.object(fields).strict() })
        .strict();
      const result = await provider(model)
        .provider.getModel(model, {
          streaming: false,
          abortSignal: signal,
          maxOutputTokens: 4096,
          responseFormat: {
            type: "json",
            name: "score_group",
            schema: z.toJSONSchema(responseSchema),
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
      const parsed = z
        .object({
          scores: z.record(
            z.string(),
            z.object({
              status: z.enum([
                "scored",
                "not_applicable",
                "insufficient_evidence",
              ]),
              value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
              evidence: z.array(
                z.object({
                  eventId: z.string().optional(),
                  recordingId: z.string().optional(),
                  path: z.string().nullable(),
                }),
              ),
            }),
          ),
        })
        .parse(JSON.parse(result.content));
      return {
        scores: Object.entries(parsed.scores).map(([fieldId, field]) => ({
          fieldId,
          status: field.status,
          ...(field.value === null ? {} : { value: field.value }),
          evidence: field.evidence.map((ref) => ({
            ...(ref.eventId ? { eventId: ref.eventId } : {}),
            ...(ref.recordingId ? { recordingId: ref.recordingId } : {}),
            ...(ref.path === null ? {} : { path: ref.path }),
          })),
        })),
      };
    },
  };
}
