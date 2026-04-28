import type { KortyxPromptMessage, ModelOptions } from "@kortyx/providers";
import type { OpenAIChatCompletionRequest, OpenAIChatMessage } from "./types";

const getProviderOptions = (
  options: ModelOptions,
): Record<string, unknown> | undefined => {
  const providerOptions = options.providerOptions;
  if (!providerOptions) return undefined;
  const nested = providerOptions.openai;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return providerOptions;
};

const normalizeReasoningEffort = (
  options: ModelOptions,
): "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined => {
  const providerOptions = getProviderOptions(options);
  const explicit = providerOptions?.reasoningEffort;
  if (
    explicit === "none" ||
    explicit === "minimal" ||
    explicit === "low" ||
    explicit === "medium" ||
    explicit === "high" ||
    explicit === "xhigh"
  ) {
    return explicit;
  }

  if (options.reasoning === undefined) return undefined;
  if (options.reasoning.maxTokens === 0) return "none";

  switch (options.reasoning.effort) {
    case "none":
      return "none";
    case "minimal":
      return "minimal";
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

const normalizeServiceTier = (
  options: ModelOptions,
): "auto" | "flex" | "priority" | "default" | undefined => {
  const value = getProviderOptions(options)?.serviceTier;
  if (
    value === "auto" ||
    value === "flex" ||
    value === "priority" ||
    value === "default"
  ) {
    return value;
  }
  return undefined;
};

const getMaxCompletionTokens = (options: ModelOptions): number | undefined => {
  const value = getProviderOptions(options)?.maxCompletionTokens;
  return typeof value === "number" ? value : undefined;
};

const getStore = (options: ModelOptions): boolean | undefined => {
  const value = getProviderOptions(options)?.store;
  return typeof value === "boolean" ? value : undefined;
};

const getMetadata = (
  options: ModelOptions,
): Record<string, string> | undefined => {
  const value = getProviderOptions(options)?.metadata;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
};

const shouldUseStructuredOutputs = (options: ModelOptions): boolean =>
  getProviderOptions(options)?.structuredOutputs !== false;

const shouldUseStrictJsonSchema = (options: ModelOptions): boolean =>
  getProviderOptions(options)?.strictJsonSchema !== false;

const createResponseFormat = (
  options: ModelOptions,
): OpenAIChatCompletionRequest["response_format"] => {
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

const isReasoningModel = (modelId: string): boolean =>
  modelId.startsWith("o1") ||
  modelId.startsWith("o3") ||
  modelId.startsWith("o4-mini") ||
  (modelId.startsWith("gpt-5") && !modelId.startsWith("gpt-5-chat"));

const supportsNonReasoningParameters = (modelId: string): boolean =>
  modelId.startsWith("gpt-5.1") ||
  modelId.startsWith("gpt-5.2") ||
  modelId.startsWith("gpt-5.3") ||
  modelId.startsWith("gpt-5.4");

const getSystemMessageMode = (
  modelId: string,
  options: ModelOptions,
): "system" | "developer" | "remove" => {
  const value = getProviderOptions(options)?.systemMessageMode;
  if (value === "system" || value === "developer" || value === "remove") {
    return value;
  }
  return isReasoningModel(modelId) ? "developer" : "system";
};

const toMessages = (
  modelId: string,
  messages: KortyxPromptMessage[],
  options: ModelOptions,
): OpenAIChatMessage[] => {
  const result: OpenAIChatMessage[] = [];
  const systemMessageMode = getSystemMessageMode(modelId, options);

  if (options.responseFormat?.type === "json") {
    const schemaText =
      options.responseFormat.schema !== undefined
        ? ` Return JSON that conforms to this schema: ${JSON.stringify(
            options.responseFormat.schema,
          )}`
        : "";
    result.push({
      role: systemMessageMode === "developer" ? "developer" : "system",
      content: `Return JSON.${schemaText}`,
    });
  }

  const converted = messages
    .map((message): OpenAIChatMessage | undefined => {
      if (message.role !== "system") {
        return {
          role: message.role,
          content: message.content,
        };
      }

      if (systemMessageMode === "remove") return undefined;

      return {
        role: systemMessageMode === "developer" ? "developer" : "system",
        content: message.content,
      };
    })
    .filter((message): message is OpenAIChatMessage => message !== undefined);

  result.push(...converted);

  if (
    result.length === 0 ||
    result.every(
      (message) => message.role === "system" || message.role === "developer",
    )
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
): OpenAIChatCompletionRequest => {
  const reasoningModel = isReasoningModel(modelId);
  const reasoningEffort = normalizeReasoningEffort(options);
  const responseFormat = createResponseFormat(options);
  const serviceTier = normalizeServiceTier(options);
  const maxCompletionTokens = getMaxCompletionTokens(options);
  const useReasoningParameterRestrictions =
    reasoningModel &&
    !(reasoningEffort === "none" && supportsNonReasoningParameters(modelId));

  return {
    model: modelId,
    messages: toMessages(modelId, messages, options),
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(options.temperature !== undefined && !useReasoningParameterRestrictions
      ? { temperature: options.temperature }
      : {}),
    ...(options.maxOutputTokens !== undefined && !reasoningModel
      ? { max_tokens: options.maxOutputTokens }
      : {}),
    ...(maxCompletionTokens !== undefined
      ? { max_completion_tokens: maxCompletionTokens }
      : options.maxOutputTokens !== undefined && reasoningModel
        ? { max_completion_tokens: options.maxOutputTokens }
        : {}),
    ...(options.stopSequences !== undefined
      ? { stop: options.stopSequences }
      : {}),
    ...(responseFormat !== undefined
      ? { response_format: responseFormat }
      : {}),
    ...(reasoningEffort !== undefined
      ? { reasoning_effort: reasoningEffort }
      : {}),
    ...(serviceTier !== undefined ? { service_tier: serviceTier } : {}),
    ...(getStore(options) !== undefined ? { store: getStore(options) } : {}),
    ...(getMetadata(options) !== undefined
      ? { metadata: getMetadata(options) }
      : {}),
  };
};
