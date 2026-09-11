import { z } from "zod";
import { getHookContext, snapshotHookState } from "./context";

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
export async function completeResponse(
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
