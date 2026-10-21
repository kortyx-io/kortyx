import { createEvalJudge, type EvalJudge } from "@kortyx/agent";
import type { EvalJudgeIdentity } from "@kortyx/agent/evals";
import { createOpenAI } from "@kortyx/openai";
import { createOpenRouter } from "@kortyx/openrouter";

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
  const provider =
    baseUrl &&
    new URL(baseUrl).hostname === "openrouter.ai" &&
    api === "chat-completions"
      ? createOpenRouter({
          apiKey,
          baseUrl,
          fetch: (input, init) => globalThis.fetch(input, init),
        })
      : createOpenAI({
          apiKey,
          api,
          ...(baseUrl ? { baseUrl } : {}),
        });
  const judge = createEvalJudge({
    model: provider(model),
    id: env.KORTYX_EVAL_JUDGE_ID?.trim() || `studio/${provider.id}/${model}`,
    ...(env.KORTYX_EVAL_JUDGE_VERSION?.trim()
      ? { version: env.KORTYX_EVAL_JUDGE_VERSION.trim() }
      : {}),
  });
  return { ...judge, location: "studio" };
}

/** Persist the full portable identity without undefined fields or executable bindings. */
export function snapshotEvalJudge(judge: EvalJudgeIdentity) {
  return {
    id: judge.id,
    version: judge.version,
    ...(judge.location ? { location: judge.location } : {}),
    ...(judge.instructions ? { instructions: judge.instructions } : {}),
    ...(judge.prompt ? { prompt: judge.prompt } : {}),
    ...(judge.promptTemplates ? { promptTemplates: true as const } : {}),
    ...(judge.model ? { model: judge.model } : {}),
  };
}
