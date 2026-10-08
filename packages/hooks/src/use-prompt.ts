import type { CompiledPrompt, PromptRef } from "@kortyx/prompts";
import { PromptError } from "@kortyx/prompts";
import { getHookContext } from "./context";

/** Resolve both roles from one immutable version in the current execution. */
export async function usePrompt<Inputs, Config>(
  reference: PromptRef<Inputs, Config>,
  options: { variables: Inputs; version?: number },
): Promise<CompiledPrompt<Config>> {
  const ctx = getHookContext();
  if (!ctx.node.prompts)
    throw new PromptError(
      "PROMPT_SOURCE_NOT_CONFIGURED",
      "Configure createAgent({ prompts: createPrompts(...) }) before calling usePrompt.",
    );
  const stored = ctx.workflowState.__promptSnapshot;
  const snapshot = await ctx.node.prompts.snapshot(stored);
  if (!stored) {
    ctx.workflowState.__promptSnapshot = snapshot;
    ctx.stateDirty = true;
  }
  const key = `__promptPin:${reference.id}:${options.version ?? "assignment"}`;
  const pin =
    options.version !== undefined
      ? await ctx.node.prompts.pin(
          reference.id,
          options.version,
          ctx.workflowState[key],
        )
      : undefined;
  if (pin && !ctx.workflowState[key]) {
    ctx.workflowState[key] = pin;
    ctx.stateDirty = true;
  }
  return ctx.node.prompts.resolve(reference, {
    ...options,
    stored: snapshot,
    ...(pin ? { pin } : {}),
  });
}
