import {
  type CompiledPrompt,
  isCompiledPrompt,
  PromptError,
  promptUsageMetadata,
} from "@kortyx/prompts";
import type { UseReasonArgs } from "../types";

export type UseReasonPromptArgs = Omit<
  UseReasonArgs,
  "input" | "system" | "messages"
> & {
  prompt: CompiledPrompt;
  input?: never;
  system?: never;
};

export function normalizePromptReasonArgs<
  T extends UseReasonArgs | UseReasonPromptArgs,
>(args: T): UseReasonArgs {
  if (!("prompt" in args)) return args;
  if (
    args.input !== undefined ||
    args.system !== undefined ||
    "messages" in args
  )
    throw new PromptError(
      "PROMPT_REASON_CONFLICT",
      "Use either prompt or input/system/messages in useReason.",
    );
  const { prompt, ...rest } = args;
  if (!isCompiledPrompt(prompt))
    throw new PromptError(
      "PROMPT_REASON_INVALID",
      "useReason requires a compiled prompt returned by usePrompt.",
    );
  return {
    ...rest,
    input:
      prompt.format === "system-user"
        ? (prompt.user ?? "")
        : (prompt.messages.filter((message) => message.role === "user").at(-1)
            ?.content ?? ""),
    ...(prompt.format === "system-user"
      ? { system: prompt.system }
      : { messages: structuredClone(prompt.messages) }),
    telemetry: {
      ...args.telemetry,
      prompt: {
        name: prompt.ref.id,
        version: prompt.ref.version,
        type: prompt.format === "chat" ? "chat" : "text",
        source: prompt.ref.source,
        metadata: promptUsageMetadata(prompt),
      },
    },
  };
}
