import type {
  KortyxPromptMessage,
  KortyxToolDefinition,
  ModelOptions,
} from "@kortyx/providers";
import type {
  AnthropicContentBlock,
  AnthropicMessage,
  AnthropicMessagesRequest,
  AnthropicThinkingRequest,
  AnthropicToolDefinition,
} from "./types";

const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const MIN_THINKING_BUDGET_TOKENS = 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getProviderOptions = (
  options: ModelOptions,
): Record<string, unknown> | undefined => {
  const providerOptions = options.providerOptions;
  if (!providerOptions) return undefined;
  const nested = providerOptions.anthropic;
  if (isRecord(nested)) return nested;
  return providerOptions;
};

const getNumberProviderOption = (
  options: ModelOptions,
  camelCaseKey: string,
  snakeCaseKey?: string,
): number | undefined => {
  const providerOptions = getProviderOptions(options);
  const value =
    providerOptions?.[camelCaseKey] ??
    (snakeCaseKey ? providerOptions?.[snakeCaseKey] : undefined);
  return typeof value === "number" ? value : undefined;
};

const toSystemPrompt = (
  messages: KortyxPromptMessage[],
  options: ModelOptions,
): string | undefined => {
  const parts: string[] = [];

  if (options.responseFormat?.type === "json") {
    const schemaText =
      options.responseFormat.schema !== undefined
        ? ` Return JSON that conforms to this schema: ${JSON.stringify(
            options.responseFormat.schema,
          )}`
        : "";
    parts.push(`Return JSON.${schemaText}`);
  }

  for (const message of messages) {
    if (message.role === "system" && message.content.trim().length > 0) {
      parts.push(message.content);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
};

const mergeAdjacentMessages = (
  messages: AnthropicMessage[],
): AnthropicMessage[] => {
  const merged: AnthropicMessage[] = [];

  for (const message of messages) {
    const previous = merged.at(-1);
    if (previous?.role === message.role) {
      previous.content.push(...message.content);
      continue;
    }
    merged.push({
      role: message.role,
      content: [...message.content],
    });
  }

  return merged;
};

const toAnthropicTool = (
  tool: KortyxToolDefinition,
): AnthropicToolDefinition => ({
  name: tool.name,
  ...(tool.description ? { description: tool.description } : {}),
  input_schema: tool.inputSchema,
});

const toMessages = (messages: KortyxPromptMessage[]): AnthropicMessage[] => {
  const converted = messages.flatMap((message): AnthropicMessage[] => {
    if (message.role === "system") return [];

    if (message.role === "tool") {
      return [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: message.toolCallId ?? "",
              content: message.content,
              ...(message.isError !== undefined
                ? { is_error: message.isError }
                : {}),
            },
          ],
        },
      ];
    }

    if (
      message.role === "assistant" &&
      message.continuation?.providerId === "anthropic" &&
      message.continuation.api === "messages"
    ) {
      return [
        {
          role: "assistant",
          content: message.continuation.items as AnthropicContentBlock[],
        },
      ];
    }
    const content: AnthropicContentBlock[] = [];
    if (message.content.length > 0) {
      content.push({
        type: "text",
        text: message.content,
      });
    }

    for (const toolCall of message.toolCalls ?? []) {
      content.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input,
      });
    }

    if (content.length === 0) {
      content.push({
        type: "text",
        text: "",
      });
    }

    return [
      {
        role: message.role,
        content,
      },
    ];
  });

  const result = mergeAdjacentMessages(converted);
  if (result.length === 0) {
    result.push({
      role: "user",
      content: [{ type: "text", text: "" }],
    });
  }

  return result;
};

export const supportsAdaptiveThinking = (modelId: string): boolean =>
  /claude-(?:sonnet|opus)-4-[6-9]/.test(modelId) ||
  /claude-(?:sonnet|opus|fable|mythos)-[5-9]/.test(modelId);
export const supportsNativeSchema = (modelId: string): boolean =>
  !/claude-(?:3|(?:sonnet|opus)-4-(?:0|1|2025))/.test(modelId);

export const getThinkingRequest = (
  options: ModelOptions,
  modelId = "",
): AnthropicThinkingRequest | undefined => {
  const explicit = getProviderOptions(options)?.thinking;
  if (isRecord(explicit)) {
    if (explicit.type === "disabled" || explicit.type === "adaptive")
      return { type: explicit.type };
    if (explicit.type === "enabled") {
      const budget =
        explicit.budgetTokens ??
        explicit.budget_tokens ??
        MIN_THINKING_BUDGET_TOKENS;
      if (typeof budget !== "number" || budget < MIN_THINKING_BUDGET_TOKENS)
        throw new Error(
          "Anthropic thinking budget must be at least 1024 tokens.",
        );
      return { type: "enabled", budget_tokens: budget };
    }
    throw new Error("Unsupported Anthropic thinking configuration.");
  }
  const reasoning = options.reasoning;
  if (
    options.reasoning?.maxTokens === 0 &&
    options.reasoning.effort &&
    options.reasoning.effort !== "none"
  )
    throw new Error("Conflicting reasoning effort and zero token budget.");
  if (!reasoning) return undefined;
  if (reasoning.effort === "none" || reasoning.maxTokens === 0)
    return { type: "disabled" };
  if (reasoning.maxTokens !== undefined) {
    if (reasoning.maxTokens < MIN_THINKING_BUDGET_TOKENS)
      throw new Error(
        "Anthropic thinking budget must be at least 1024 tokens.",
      );
    return { type: "enabled", budget_tokens: reasoning.maxTokens };
  }
  if (supportsAdaptiveThinking(modelId)) return { type: "adaptive" };
  const budgets: Record<string, number> = {
    minimal: 1024,
    low: 2048,
    medium: 8192,
    high: 16384,
  };
  if (reasoning.effort && budgets[reasoning.effort] === undefined)
    throw new Error(
      `Unsupported manual Anthropic reasoning effort: ${reasoning.effort}`,
    );
  return {
    type: "enabled",
    budget_tokens: budgets[reasoning.effort ?? "minimal"] ?? 1024,
  };
};

export const createMessagesRequest = (
  modelId: string,
  messages: KortyxPromptMessage[],
  options: ModelOptions,
  stream: boolean,
): AnthropicMessagesRequest => {
  const thinking = getThinkingRequest(options, modelId);
  const thinkingBudget =
    thinking?.type === "enabled" ? thinking.budget_tokens : 0;
  const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const system = toSystemPrompt(messages, options);
  const topP = getNumberProviderOption(options, "topP", "top_p");
  const topK = getNumberProviderOption(options, "topK", "top_k");
  const tools = options.tools?.map(toAnthropicTool);
  const nativeSchema =
    options.responseFormat?.type === "json" &&
    options.responseFormat.schema !== undefined &&
    supportsNativeSchema(modelId)
      ? options.responseFormat.schema
      : undefined;
  const effort =
    getProviderOptions(options)?.effort ??
    ((thinking?.type === "adaptive" || modelId.includes("opus-4-5")) &&
    options.reasoning?.effort !== "none"
      ? options.reasoning?.effort
      : undefined);
  if (
    thinking?.type === "enabled" &&
    /claude-(?:(?:opus-4-[7-9])|(?:sonnet|opus|fable|mythos)-[5-9])/.test(
      modelId,
    )
  )
    throw new Error(
      `${modelId} requires adaptive thinking; manual token budgets are unsupported.`,
    );
  const thinkingOn =
    thinking?.type === "enabled" || thinking?.type === "adaptive";

  return {
    model: modelId,
    max_tokens: maxOutputTokens + thinkingBudget,
    messages: toMessages(messages),
    stream,
    ...(system !== undefined ? { system } : {}),
    ...(options.temperature !== undefined && !thinkingOn
      ? { temperature: options.temperature }
      : {}),
    ...(topP !== undefined ? { top_p: topP } : {}),
    ...(topK !== undefined ? { top_k: topK } : {}),
    ...(options.stopSequences !== undefined
      ? { stop_sequences: options.stopSequences }
      : {}),
    ...(thinking !== undefined ? { thinking } : {}),
    ...(nativeSchema !== undefined || effort !== undefined
      ? {
          output_config: {
            ...(nativeSchema !== undefined
              ? {
                  format: {
                    type: "json_schema" as const,
                    schema: nativeSchema,
                  },
                }
              : {}),
            ...(effort !== undefined ? { effort: String(effort) } : {}),
          },
        }
      : {}),
    ...(tools?.length ? { tools } : {}),
  };
};
