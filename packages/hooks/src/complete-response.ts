import { z } from "zod";
import { getHookContext, snapshotHookState } from "./context";
import { usage } from "./usage";

export type CompleteResponseOptions = {
  message?: string | undefined;
  data?: unknown;
};

const optionsSchema = z
  .object({
    message: z.string().optional(),
    data: z.json().optional(),
  })
  .strict();

/** Finish client delivery, leaving the node and workflow execution running. */
async function completeResponseInternal(
  options: CompleteResponseOptions = {},
): Promise<void> {
  const ctx = getHookContext();
  const parsed = optionsSchema.parse(options);
  if (!ctx.node.completeResponse) {
    throw new Error(
      "completeResponse requires an agent-managed root workflow.",
    );
  }
  await ctx.node.completeResponse(parsed, snapshotHookState());
}

export function completeResponse(
  options: CompleteResponseOptions = {},
): Promise<void> {
  return usage.measure("sdk.complete_response", () =>
    completeResponseInternal(options),
  );
}
