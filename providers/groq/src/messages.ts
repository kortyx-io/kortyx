import type {
  KortyxPromptMessage,
  KortyxToolCall,
  KortyxToolDefinition,
  ModelOptions,
} from "@kortyx/providers";
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
  if (
    options.reasoning?.maxTokens === 0 &&
    options.reasoning.effort &&
    options.reasoning.effort !== "none"
  )
    throw new Error("Conflicting reasoning effort and zero token budget.");
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
      if (options.reasoning.effort !== undefined)
        throw new Error(
          `Unsupported Groq reasoning effort: ${options.reasoning.effort}`,
        );
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

export const usesNativeSchema = (options: ModelOptions): boolean =>
  options.responseFormat?.type === "json" &&
  options.responseFormat.schema !== undefined &&
  shouldUseStructuredOutputs(options);

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

const toGroqTool = (tool: KortyxToolDefinition) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    parameters: tool.inputSchema,
  },
});

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
    ...messages.map((message): GroqChatMessage => {
      if (message.role === "tool") {
        return {
          role: "tool",
          content: message.content,
          tool_call_id: message.toolCallId ?? "",
          ...(message.name ? { name: message.name } : {}),
        };
      }

      if (
        message.role === "assistant" &&
        message.continuation?.providerId === "groq" &&
        message.continuation.api === "chat-completions"
      ) {
        const native = message.continuation.items[0] as
          | GroqChatMessage
          | undefined;
        if (native) return { ...native, role: "assistant" };
      }
      return {
        role: message.role,
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((toolCall: KortyxToolCall) => ({
                id: toolCall.id,
                type: "function" as const,
                function: {
                  name: toolCall.name,
                  arguments: JSON.stringify(toolCall.input ?? {}),
                },
              })),
            }
          : {}),
      };
    }),
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
  const tools = options.tools?.map(toGroqTool);
  if (responseFormat?.type === "json_schema" && tools?.length)
    throw new Error(
      "Groq cannot combine native JSON schema output and tools in one request. Use useReason for automatic finalization, or make a separate schema-only call.",
    );
  if (reasoningFormat === "raw" && (tools?.length || responseFormat))
    throw new Error(
      "Groq raw reasoning is incompatible with tools and JSON output.",
    );
  if (reasoningEffort === "none" && modelId.startsWith("openai/gpt-oss"))
    throw new Error("Groq GPT-OSS models cannot disable reasoning.");
  if (reasoningEffort && /^(llama-|meta-llama\/)/.test(modelId))
    throw new Error(`Groq ${modelId} does not support reasoning effort.`);
  if (usesNativeSchema(options) && /^(llama-|meta-llama\/)/.test(modelId))
    throw new Error(
      `Groq ${modelId} does not support native schema output. Select a compatible model or explicitly set structuredOutputs: false.`,
    );

  return {
    model: modelId,
    messages: toMessages(messages, options),
    stream: usesNativeSchema(options) ? false : stream,
    ...(stream && !usesNativeSchema(options)
      ? { stream_options: { include_usage: true } }
      : {}),
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
    ...(tools?.length ? { tools } : {}),
  };
};
