import type { InterruptInput, InterruptResult } from "@kortyx/core";
import type {
  InterruptContract,
  InterruptContractMap,
  UseReasonInterruptConfig,
  UseReasonInterruptsConfig,
} from "./types";

const CONTROL_TOOL_PREFIX = "kortyx_request_input__";
const LEGACY_CONTRACT_NAME = "default";
let legacyWarningEmitted = false;
const legacyConfigs = new WeakSet<object>();

export const defineInterruptContract = <TRequest, TResponse>(
  contract: InterruptContract<TRequest, TResponse>,
): InterruptContract<TRequest, TResponse> => {
  if (!contract || typeof contract !== "object")
    throw new Error("defineInterruptContract requires a contract object.");
  for (const [field, value] of [
    ["description", contract.description],
    ["schemaId", contract.schemaId],
    ["schemaVersion", contract.schemaVersion],
  ] as const)
    if (typeof value !== "string" || value.trim().length === 0)
      throw new Error(
        `Interrupt contract ${field} must be a non-empty string.`,
      );
  if (typeof contract.requestSchema?.safeParse !== "function")
    throw new Error(
      "Interrupt contract requestSchema must provide safeParse(value).",
    );
  if (typeof contract.responseSchema?.safeParse !== "function")
    throw new Error(
      "Interrupt contract responseSchema must provide safeParse(value).",
    );
  return contract;
};

export const interruptControlToolName = (name: string): string =>
  `${CONTROL_TOOL_PREFIX}${name}`;

export const isInterruptControlToolName = (name: string): boolean =>
  name.startsWith(CONTROL_TOOL_PREFIX);

export const assertInterruptContractName = (name: string): void => {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name))
    throw new Error(
      `Invalid useReason interrupt contract name "${name}". Use letters, numbers, underscores, or hyphens, starting with a letter.`,
    );
  if (interruptControlToolName(name).length > 64)
    throw new Error(
      `useReason interrupt contract name "${name}" is too long for a provider tool name.`,
    );
};

export const warnLegacyUseReasonInterrupt = (): void => {
  if (legacyWarningEmitted) return;
  legacyWarningEmitted = true;
  process.emitWarning(
    "useReason({ interrupt }) is deprecated and will be removed in the next major release. Define an interrupt contract with defineInterruptContract() and pass it through useReason({ interrupts: { contracts } }). See docs/internal/next-major-removals.md.",
    {
      code: "KORTYX_USE_REASON_INTERRUPT_DEPRECATED",
      type: "DeprecationWarning",
    },
  );
};

export const normalizeReasonInterrupts = <
  TRequest extends InterruptInput,
  TResponse,
>(args: {
  interrupt?: UseReasonInterruptConfig<TRequest, TResponse> | undefined;
  interrupts?: UseReasonInterruptsConfig<InterruptContractMap> | undefined;
}): UseReasonInterruptsConfig<InterruptContractMap> | undefined => {
  if (args.interrupt && args.interrupts)
    throw new Error(
      "useReason cannot receive both deprecated `interrupt` and `interrupts`. Migrate the legacy configuration to an interrupt contract.",
    );
  if (args.interrupts) {
    for (const [name, contract] of Object.entries(args.interrupts.contracts)) {
      assertInterruptContractName(name);
      defineInterruptContract(contract);
    }
    if (Object.keys(args.interrupts.contracts).length === 0)
      throw new Error("useReason interrupts.contracts cannot be empty.");
    if (
      args.interrupts.maxRequests !== undefined &&
      (!Number.isInteger(args.interrupts.maxRequests) ||
        args.interrupts.maxRequests < 1)
    )
      throw new Error("useReason interrupts.maxRequests must be at least 1.");
    return args.interrupts;
  }
  if (!args.interrupt) return undefined;

  warnLegacyUseReasonInterrupt();
  const normalized: UseReasonInterruptsConfig<InterruptContractMap> = {
    mode: args.interrupt.mode,
    maxRequests: 1,
    contracts: {
      [LEGACY_CONTRACT_NAME]: {
        description:
          "Ask the user for the additional information required to complete this request.",
        requestSchema: args.interrupt.requestSchema,
        responseSchema:
          args.interrupt.responseSchema ??
          ({
            safeParse: (value: unknown) => ({
              success: true as const,
              data: value as InterruptResult,
            }),
          } satisfies InterruptContract<
            InterruptInput,
            InterruptResult
          >["responseSchema"]),
        schemaId: args.interrupt.schemaId ?? "kortyx.legacy-interrupt",
        schemaVersion: args.interrupt.schemaVersion ?? "1",
      },
    },
  };
  legacyConfigs.add(normalized);
  return normalized;
};

export const isLegacyInterruptContracts = (
  config: UseReasonInterruptsConfig<InterruptContractMap> | undefined,
): boolean => Boolean(config && legacyConfigs.has(config));
