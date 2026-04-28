import type { KortyxPromptMessage, ModelOptions } from "@kortyx/providers";
import type { GroqChatCompletionRequest, GroqChatMessage } from "./types";

const getProviderOptions = (
  options: ModelOptions,
): Record<string, unknown> | undefined => {
  const providerOptions = options.providerOptions;
  if (!providerOptions) return undefined;
  const nested = providerOptions.groq;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return providerOptions;
};

const normalizeReasoningEffort = (
  options: ModelOptions,
): "none" | "low" | "medium" | "high" | undefined => {
  const providerOptions = getProviderOptions(options);
  const explicit = providerOptions?.reasoningEffort;
  if (
    explicit === "none" ||
    explicit === "low" ||
    explicit === "medium" ||
    explicit === "high"
  ) {
    return explicit;
  }

  if (options.reasoning === undefined) return undefined;
  if (options.reasoning.maxTokens === 0) return "none";

  switch (options.reasoning.effort) {
    case "none":
      return "none";
    case "minimal":
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    default:
      return undefined;
  }
};

const normalizeReasoningFormat = (
  options: ModelOptions,
): "parsed" | "raw" | "hidden" | undefined => {
  const value = getProviderOptions(options)?.reasoningFormat;
  if (value === "parsed" || value === "raw" || value === "hidden") {
    return value;
  }
  return undefined;
};

const normalizeServiceTier = (
  options: ModelOptions,
): "on_demand" | "performance" | "flex" | "auto" | undefined => {
  const value = getProviderOptions(options)?.serviceTier;
  if (
    value === "on_demand" ||
    value === "performance" ||
    value === "flex" ||
    value === "auto"
  ) {
    return value;
  }
  return undefined;
};

const shouldUseStructuredOutputs = (options: ModelOptions): boolean =>
  getProviderOptions(options)?.structuredOutputs !== false;

const shouldUseStrictJsonSchema = (options: ModelOptions): boolean =>
  getProviderOptions(options)?.strictJsonSchema !== false;

const createResponseFormat = (
  options: ModelOptions,
): GroqChatCompletionRequest["response_format"] => {
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

const toMessages = (
  messages: KortyxPromptMessage[],
  options: ModelOptions,
): GroqChatMessage[] => {
  const result: GroqChatMessage[] = [];

  if (options.responseFormat?.type === "json") {
    const schemaText =
      options.responseFormat.schema !== undefined
        ? ` Return JSON that conforms to this schema: ${JSON.stringify(
            options.responseFormat.schema,
          )}`
        : "";
    result.push({
      role: "system",
      content: `Return JSON.${schemaText}`,
    });
  }

  result.push(
    ...messages.map(
      (message): GroqChatMessage => ({
        role: message.role,
        content: message.content,
      }),
    ),
  );

  if (result.length === 0) {
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
): GroqChatCompletionRequest => {
  const reasoningEffort = normalizeReasoningEffort(options);
  const reasoningFormat = normalizeReasoningFormat(options);
  const responseFormat = createResponseFormat(options);
  const serviceTier = normalizeServiceTier(options);

  return {
    model: modelId,
    messages: toMessages(messages, options),
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    temperature: options.temperature ?? 0.7,
    ...(options.maxOutputTokens !== undefined
      ? { max_tokens: options.maxOutputTokens }
      : {}),
    ...(options.stopSequences !== undefined
      ? { stop: options.stopSequences }
      : {}),
    ...(responseFormat !== undefined
      ? { response_format: responseFormat }
      : {}),
    ...(reasoningFormat !== undefined
      ? { reasoning_format: reasoningFormat }
      : {}),
    ...(reasoningEffort !== undefined
      ? { reasoning_effort: reasoningEffort }
      : {}),
    ...(serviceTier !== undefined ? { service_tier: serviceTier } : {}),
  };
};
