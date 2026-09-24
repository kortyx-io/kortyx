import type {
  KortyxPromptMessage,
  KortyxToolCall,
  KortyxToolDefinition,
  ModelOptions,
} from "@kortyx/providers";
import type {
  ChatFunctionTool,
  ChatMessages,
  ChatRequest,
  ChatRequestEffort,
  ReasoningDetailUnion,
} from "@openrouter/sdk/models";
import { ProviderConfigurationError } from "./errors.js";
import type { OpenRouterCallOptions } from "./types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const getOpenRouterOptions = (
  options: ModelOptions,
): OpenRouterCallOptions => {
  const nested = options.providerOptions?.openrouter;
  return isRecord(nested)
    ? (nested as OpenRouterCallOptions)
    : ({} as OpenRouterCallOptions);
};

const toToolCall = (call: KortyxToolCall) => ({
  id: call.id,
  type: "function" as const,
  function: {
    name: call.name,
    arguments: JSON.stringify(call.input ?? {}),
  },
});

const continuationReasoning = (
  message: KortyxPromptMessage,
): ReasoningDetailUnion[] | undefined => {
  if (!message.continuation) return undefined;
  if (
    message.continuation.providerId !== "openrouter" ||
    message.continuation.api !== "chat-completions"
  ) {
    throw new ProviderConfigurationError(
      "Cannot use another provider's continuation with OpenRouter Chat Completions.",
    );
  }
  return message.continuation.items as ReasoningDetailUnion[];
};

export const toMessages = (messages: KortyxPromptMessage[]): ChatMessages[] => {
  const result = messages.map((message): ChatMessages => {
    if (message.role === "tool") {
      if (!message.toolCallId)
        throw new ProviderConfigurationError(
          "OpenRouter tool results require a toolCallId.",
        );
      return {
        role: "tool",
        content: message.content,
        toolCallId: message.toolCallId,
      };
    }
    if (message.role === "assistant") {
      const reasoningDetails = continuationReasoning(message);
      return {
        role: "assistant",
        content: message.content,
        ...(message.name ? { name: message.name } : {}),
        ...(message.toolCalls?.length
          ? { toolCalls: message.toolCalls.map(toToolCall) }
          : {}),
        ...(reasoningDetails?.length ? { reasoningDetails } : {}),
      };
    }
    return {
      role: message.role,
      content: message.content,
      ...(message.name ? { name: message.name } : {}),
    };
  });
  return result.length > 0 ? result : [{ role: "user", content: "" }];
};

const toTool = (tool: KortyxToolDefinition): ChatFunctionTool => ({
  type: "function",
  function: {
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    parameters: isRecord(tool.inputSchema) ? tool.inputSchema : {},
    strict: false,
  },
});

export const createChatRequest = (
  modelId: string,
  messages: KortyxPromptMessage[],
  options: ModelOptions,
  stream: boolean,
): ChatRequest => {
  const extra = getOpenRouterOptions(options);
  const needsRequiredParameters =
    Boolean(options.tools?.length) ||
    (options.responseFormat?.type === "json" &&
      options.responseFormat.schema !== undefined);
  const provider = {
    ...extra.provider,
    ...(needsRequiredParameters &&
    extra.provider?.requireParameters === undefined
      ? { requireParameters: true }
      : {}),
  };
  const reasoning = options.reasoning
    ? {
        ...(extra.reasoning ?? {}),
        ...(options.reasoning.effort !== undefined
          ? {
              effort: options.reasoning.effort as unknown as ChatRequestEffort,
            }
          : {}),
        ...(options.reasoning.includeThoughts
          ? { summary: "auto" as const }
          : {}),
      }
    : extra.reasoning;

  return {
    ...extra,
    model: modelId,
    messages: toMessages(messages),
    stream,
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    ...(options.maxOutputTokens !== undefined
      ? { maxCompletionTokens: options.maxOutputTokens }
      : {}),
    ...(options.stopSequences !== undefined
      ? { stop: options.stopSequences }
      : {}),
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(options.responseFormat?.type === "json"
      ? options.responseFormat.schema !== undefined
        ? {
            responseFormat: {
              type: "json_schema" as const,
              jsonSchema: {
                name: options.responseFormat.name ?? "response",
                schema: isRecord(options.responseFormat.schema)
                  ? options.responseFormat.schema
                  : {},
                strict: true,
              },
            },
          }
        : { responseFormat: { type: "json_object" as const } }
      : {}),
    ...(options.tools?.length ? { tools: options.tools.map(toTool) } : {}),
    ...(Object.keys(provider).length > 0 ? { provider } : {}),
  };
};
