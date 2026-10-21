import { PromptVersionSchema } from "@kortyx/prompts/browser";
import { z } from "zod";

/** Same portable content/version contract as ordinary managed prompts. */
export const EvalJudgePromptSchema = PromptVersionSchema.strict();
export type EvalJudgePrompt = z.infer<typeof EvalJudgePromptSchema>;
export const EvalGradingRequestSchema = z
  .object({
    protocol: z.enum(["kortyx-rubric-v4", "eval-verdict-v1"]),
    prompt: EvalJudgePromptSchema.pick({
      id: true,
      version: true,
      hash: true,
    }).optional(),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string(),
          })
          .strict(),
      )
      .min(1)
      .max(101),
  })
  .strict();
export type EvalGradingRequest = z.infer<typeof EvalGradingRequestSchema>;

export function sameJudgePrompt(
  a: EvalJudgePrompt | undefined,
  b: EvalJudgePrompt | undefined,
): boolean {
  return a?.id === b?.id && a?.version === b?.version && a?.hash === b?.hash;
}
