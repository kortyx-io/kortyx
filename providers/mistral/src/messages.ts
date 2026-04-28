import type { KortyxPromptMessage, ModelOptions } from "@kortyx/providers";
import type {
  MistralChatCompletionRequest,
  MistralChatMessage,
  MistralResponseFormat,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getProviderOptions = (
  options: ModelOptions,
): Record<string, unknown> | undefined => {
  const providerOptions = options.providerOptions;
  if (!providerOptions) return undefined;
  const nested = providerOptions.mistral;
  if (isRecord(nested)) return nested;
  return providerOptions;
};

const getBooleanProviderOption = (
  options: ModelOptions,
  key: string,
): boolean | undefined => {
  const value = getProviderOptions(options)?.[key];
  return typeof value === "boolean" ? value : undefined;
};

const getNumberProviderOption = (
  options: ModelOptions,
  key: string,
): number | undefined => {
  const value = getProviderOptions(options)?.[key];
  return typeof value === "number" ? value : undefined;
};

const shouldUseStructuredOutputs = (options: ModelOptions): boolean =>
  getBooleanProviderOption(options, "structuredOutputs") !== false;

const shouldUseStrictJsonSchema = (options: ModelOptions): boolean =>
  getBooleanProviderOption(options, "strictJsonSchema") === true;

const createResponseFormat = (
  options: ModelOptions,
): MistralResponseFormat | undefined => {
  if (options.responseFormat?.type !== "json") return undefined;
  if (
    options.responseFormat.schema !== undefined &&
    shouldUseStructuredOutputs(options)
  ) {
    return {
      type: "json_schema",
      json_schema: {
        name: options.responseFormat.name ?? "response",
        schema: options.responseFormat.schema,
        strict: shouldUseStrictJsonSchema(options),
      },
    };
  }
  return { type: "json_object" };
};

const supportsReasoningEffort = (modelId: string): boolean =>
  modelId === "mistral-small-latest" || modelId === "mistral-small-2603";

export const normalizeReasoningEffort = (
  modelId: string,
  options: ModelOptions,
): "high" | "none" | undefined => {
  if (!supportsReasoningEffort(modelId)) return undefined;

  const providerOptions = getProviderOptions(options);
  const explicit = providerOptions?.reasoningEffort;
  if (explicit === "high" || explicit === "none") {
    return explicit;
  }

  if (options.reasoning === undefined) return undefined;
  if (options.reasoning.maxTokens === 0) return "none";
  return options.reasoning.effort !== undefined ||
    options.reasoning.maxTokens !== undefined ||
    options.reasoning.includeThoughts !== undefined
    ? "high"
    : undefined;
};

const toMessages = (
  messages: KortyxPromptMessage[],
  options: ModelOptions,
): MistralChatMessage[] => {
  const result: MistralChatMessage[] = [];

  if (
    options.responseFormat?.type === "json" &&
    options.responseFormat.schema === undefined
  ) {
    result.push({
      role: "system",
      content: "Return JSON.",
    });
  }

  result.push(
    ...messages.map((message): MistralChatMessage => {
      return {
        role: message.role,
        content: message.content,
      };
    }),
  );

  if (
    result.length === 0 ||
    result.every((message) => message.role === "system")
  ) {
    result.push({
      role: "user",
      content: "",
    });
  }

  return result;
};

export const createChatCompletionRequest = (
  modelId: string,
  messages: KortyxPromptMessage[],
  options: ModelOptions,
  stream: boolean,
): MistralChatCompletionRequest => {
  const responseFormat = createResponseFormat(options);
  const safePrompt = getBooleanProviderOption(options, "safePrompt");
  const topP = getNumberProviderOption(options, "topP");
  const randomSeed = getNumberProviderOption(options, "randomSeed");
  const reasoningEffort = normalizeReasoningEffort(modelId, options);

  return {
    model: modelId,
    messages: toMessages(messages, options),
    stream,
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    ...(options.maxOutputTokens !== undefined
      ? { max_tokens: options.maxOutputTokens }
      : {}),
    ...(topP !== undefined ? { top_p: topP } : {}),
    ...(randomSeed !== undefined ? { random_seed: randomSeed } : {}),
    ...(safePrompt !== undefined ? { safe_prompt: safePrompt } : {}),
    ...(responseFormat !== undefined
      ? { response_format: responseFormat }
      : {}),
    ...(reasoningEffort !== undefined
      ? { reasoning_effort: reasoningEffort }
      : {}),
  };
};

export const modelSupportsReasoningEffort = supportsReasoningEffort;
