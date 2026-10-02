import { createEvalJudge, type EvalJudge } from "@kortyx/agent";
import { createOpenAI } from "@kortyx/openai";

/** Optional server-owned judge. No provider key is returned to consumers or browsers. */
export function loadStudioEvalJudge(
  env: NodeJS.ProcessEnv = process.env,
): EvalJudge | undefined {
  const model = env.KORTYX_EVAL_JUDGE_MODEL?.trim();
  if (!model) return undefined;
  const apiKey = env.KORTYX_EVAL_JUDGE_API_KEY?.trim();
  if (!apiKey)
    throw new Error(
      "KORTYX_EVAL_JUDGE_API_KEY is required when Studio judging is enabled.",
    );
  const baseUrl = env.KORTYX_EVAL_JUDGE_BASE_URL?.trim();
  if (baseUrl && new URL(baseUrl).protocol !== "https:")
    throw new Error("Studio judge provider URLs require HTTPS.");
  const api = env.KORTYX_EVAL_JUDGE_API?.trim() || "responses";
  if (api !== "responses" && api !== "chat-completions")
    throw new Error(
      "KORTYX_EVAL_JUDGE_API must be responses or chat-completions.",
    );
  const provider = createOpenAI({
    apiKey,
    api,
    ...(baseUrl ? { baseUrl } : {}),
  });
  const judge = createEvalJudge({
    model: provider(model),
    id: env.KORTYX_EVAL_JUDGE_ID?.trim() || `studio/openai/${model}`,
    ...(env.KORTYX_EVAL_JUDGE_VERSION?.trim()
      ? { version: env.KORTYX_EVAL_JUDGE_VERSION.trim() }
      : {}),
  });
  return { ...judge, location: "studio" };
}
