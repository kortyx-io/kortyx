import type { KortyxPromptMessage, ModelOptions } from "@kortyx/providers";
import type {
  DeepSeekChatCompletionRequest,
  DeepSeekChatMessage,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getProviderOptions = (
  options: ModelOptions,
): Record<string, unknown> | undefined => {
  const providerOptions = options.providerOptions;
  if (!providerOptions) return undefined;
  const nested = providerOptions.deepseek;
  return isRecord(nested) ? nested : undefined;
};

const normalizeThinkingType = (
  options: ModelOptions,
): "enabled" | "disabled" | undefined => {
  const explicit = getProviderOptions(options)?.thinking;
  if (
    explicit &&
    typeof explicit === "object" &&
    "type" in explicit &&
    (explicit.type === "enabled" || explicit.type === "disabled")
  ) {
    return explicit.type;
  }

  if (options.reasoning === undefined) return undefined;
  if (
    options.reasoning.effort === "none" ||
    options.reasoning.maxTokens === 0
  ) {
    return "disabled";
  }
  return "enabled";
};

const toMessages = (
  messages: KortyxPromptMessage[],
  options: ModelOptions,
): DeepSeekChatMessage[] => {
  const result: DeepSeekChatMessage[] = [];

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
      (message): DeepSeekChatMessage => ({
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
): DeepSeekChatCompletionRequest => {
  const thinkingType = normalizeThinkingType(options);

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
    ...(options.responseFormat?.type === "json"
      ? { response_format: { type: "json_object" } }
      : {}),
    ...(thinkingType !== undefined ? { thinking: { type: thinkingType } } : {}),
  };
};
