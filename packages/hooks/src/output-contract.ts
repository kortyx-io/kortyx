import { toJSONSchema } from "zod";
import { assertStructuredPath } from "./structured-path";
import type {
  OutputContract,
  OutputContractMap,
  UseReasonOutputsConfig,
} from "./types";

const EMIT_PREFIX = "kortyx_emit__";
const RETURN_PREFIX = "kortyx_return__";
const STREAM_EMIT_PREFIX = "kortyx_stream_emit__";
const STREAM_RETURN_PREFIX = "kortyx_stream_return__";
let legacyOutputWarningEmitted = false;

export const warnLegacyReasonOutput = (): void => {
  if (legacyOutputWarningEmitted) return;
  legacyOutputWarningEmitted = true;
  process.emitWarning(
    "useReason({ outputSchema, structured }) and result.output are deprecated and will be removed in the next major release. Define reusable contracts with defineOutputContract() and pass them through useReason({ outputs }). See docs/internal/next-major-removals.md.",
    { code: "KORTYX_USE_REASON_OUTPUT_DEPRECATED", type: "DeprecationWarning" },
  );
};

export const defineOutputContract = <TData>(
  contract: OutputContract<TData>,
): OutputContract<TData> => {
  if (!contract || typeof contract !== "object")
    throw new Error("defineOutputContract requires a contract object.");
  for (const [field, value] of [
    ["description", contract.description],
    ["schemaId", contract.schemaId],
    ["schemaVersion", contract.schemaVersion],
  ] as const)
    if (typeof value !== "string" || value.trim().length === 0)
      throw new Error(`Output contract ${field} must be a non-empty string.`);
  if (typeof contract.schema?.safeParse !== "function")
    throw new Error("Output contract schema must provide safeParse(value).");
  if (contract.stream) {
    if (
      !contract.stream.fields ||
      Object.keys(contract.stream.fields).length === 0
    )
      throw new Error("Output contract stream.fields must not be empty.");
    for (const [path, mode] of Object.entries(contract.stream.fields)) {
      assertStructuredPath(path, "Output contract stream.fields");
      if (!(["set", "append", "text-delta"] as unknown[]).includes(mode))
        throw new Error(`Invalid output contract stream mode for "${path}".`);
    }
  }
  return contract;
};

export const outputControlToolName = (
  kind: "emit" | "return" | "stream-emit" | "stream-return",
  name: string,
): string =>
  `${kind === "emit" ? EMIT_PREFIX : kind === "return" ? RETURN_PREFIX : kind === "stream-emit" ? STREAM_EMIT_PREFIX : STREAM_RETURN_PREFIX}${name}`;

export const isOutputControlToolName = (name: string): boolean =>
  name.startsWith(EMIT_PREFIX) ||
  name.startsWith(RETURN_PREFIX) ||
  name.startsWith(STREAM_EMIT_PREFIX) ||
  name.startsWith(STREAM_RETURN_PREFIX);

export const normalizeReasonOutputs = (
  config:
    | UseReasonOutputsConfig<OutputContractMap, OutputContractMap>
    | undefined,
  hasLegacyOutput: boolean,
): typeof config => {
  if (!config) return undefined;
  if (hasLegacyOutput)
    throw new Error(
      "useReason cannot combine `outputs` with deprecated `outputSchema` or `structured`.",
    );
  const entries = [
    ...Object.entries(config.emit ?? {}).map(([name, contract]) => ({
      name,
      contract,
      kind: "emit" as const,
    })),
    ...Object.entries(config.return ?? {}).map(([name, contract]) => ({
      name,
      contract,
      kind: "return" as const,
    })),
  ];
  if (entries.length === 0)
    throw new Error(
      "useReason outputs must include at least one emit or return contract.",
    );
  for (const { name, contract, kind } of entries) {
    if (
      !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) ||
      outputControlToolName(kind, name).length > 64
    )
      throw new Error(`Invalid useReason output contract name "${name}".`);
    defineOutputContract(contract);
    if (contract.schema["~kortyx"]?.nativeOutput === true)
      throw new Error(
        `useReason output contract "${name}" uses a provider-native output schema that cannot be selected through tools. Continue using outputSchema for this provider until a non-tool contract path is available.`,
      );
    if (
      contract.stream &&
      outputControlToolName(
        kind === "emit" ? "stream-emit" : "stream-return",
        name,
      ).length > 64
    )
      throw new Error(
        `Invalid useReason output contract name "${name}" for streaming tools.`,
      );
    try {
      const json = toJSONSchema(contract.schema as never);
      if (json.type !== "object")
        throw new Error("The tool input schema must have an object root.");
    } catch (error) {
      throw new Error(
        `useReason output contract "${name}" schema must support JSON Schema conversion.`,
        { cause: error },
      );
    }
  }
  if (
    config.maxEmissions !== undefined &&
    (!Number.isInteger(config.maxEmissions) || config.maxEmissions < 1)
  )
    throw new Error("useReason outputs.maxEmissions must be at least 1.");
  return config;
};
