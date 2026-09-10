import { z } from "zod";

export const ExecutionLimitsSchema = z
  .object({
    maxNodeExecutions: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    maxModelPasses: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    maxToolCalls: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    maxChildInvocations: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
  })
  .strict();
export type ExecutionLimits = z.infer<typeof ExecutionLimitsSchema>;
export type ExecutionLimit = keyof ExecutionLimits;
export type ExecutionLimitReached = {
  limit: ExecutionLimit;
  maximum: number;
  consumed: number;
};
export type ExecutionBudget = {
  limits: ExecutionLimits;
  consumed: Record<ExecutionLimit, number>;
  blocked?: ExecutionLimitReached;
};

export const createExecutionBudget = (
  defaults?: ExecutionLimits,
  overrides?: ExecutionLimits,
): ExecutionBudget => ({
  limits: {
    ...ExecutionLimitsSchema.parse(defaults ?? {}),
    ...Object.fromEntries(
      Object.entries(ExecutionLimitsSchema.parse(overrides ?? {})).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  },
  consumed: {
    maxNodeExecutions: 0,
    maxModelPasses: 0,
    maxToolCalls: 0,
    maxChildInvocations: 0,
  },
});

export const isExecutionLimitReached = (
  error: unknown,
): error is Error & {
  code: "EXECUTION_LIMIT_REACHED";
  limitReached: ExecutionLimitReached;
} =>
  error instanceof Error &&
  "code" in error &&
  error.code === "EXECUTION_LIMIT_REACHED";

export const assertExecutionBudget = (budget: ExecutionBudget): void => {
  if (budget.blocked)
    throw Object.assign(
      new Error(
        `Execution limit reached: ${budget.blocked.limit} (${budget.blocked.consumed}/${budget.blocked.maximum}).`,
      ),
      {
        name: "ExecutionLimitReachedError",
        code: "EXECUTION_LIMIT_REACHED" as const,
        limitReached: budget.blocked,
      },
    );
};

/** Reserve before dispatch. Failed attempts consume allowance; restored results do not. */
export const consumeExecutionBudget = (
  budget: ExecutionBudget,
  limit: ExecutionLimit,
): void => {
  assertExecutionBudget(budget);
  const maximum = budget.limits[limit];
  const consumed = budget.consumed[limit];
  if (maximum !== undefined && consumed >= maximum) {
    budget.blocked = { limit, maximum, consumed };
    assertExecutionBudget(budget);
  }
  budget.consumed[limit]++;
};

/** A limit continuation starts a fresh server-owned allowance at the saved checkpoint. */
export const restartExecutionBudget = (
  budget: ExecutionBudget,
  overrides?: ExecutionLimits,
): ExecutionBudget => createExecutionBudget(budget.limits, overrides);
