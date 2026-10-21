import type { EvalJudgeIdentity } from "@kortyx/agent/evals";

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
