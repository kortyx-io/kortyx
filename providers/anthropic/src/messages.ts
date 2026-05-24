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

export const getThinkingRequest = (
  options: ModelOptions,
): AnthropicThinkingRequest | undefined => {
  const providerOptions = getProviderOptions(options);
  const explicitThinking = providerOptions?.thinking;

  if (isRecord(explicitThinking)) {
    if (explicitThinking.type === "disabled") {
      return { type: "disabled" };
    }
    if (explicitThinking.type === "enabled") {
      const explicitBudget =
        typeof explicitThinking.budgetTokens === "number"
          ? explicitThinking.budgetTokens
          : typeof explicitThinking.budget_tokens === "number"
            ? explicitThinking.budget_tokens
            : undefined;
      return {
        type: "enabled",
        budget_tokens: Math.max(
          MIN_THINKING_BUDGET_TOKENS,
          explicitBudget ?? MIN_THINKING_BUDGET_TOKENS,
        ),
      };
    }
  }

  if (options.reasoning?.maxTokens === 0) {
    return { type: "disabled" };
  }

  if (
    options.reasoning?.maxTokens !== undefined ||
    options.reasoning?.effort !== undefined ||
    options.reasoning?.includeThoughts !== undefined
  ) {
    return {
      type: "enabled",
      budget_tokens: Math.max(
        MIN_THINKING_BUDGET_TOKENS,
        options.reasoning.maxTokens ?? MIN_THINKING_BUDGET_TOKENS,
      ),
    };
  }

  return undefined;
};

export const createMessagesRequest = (
  modelId: string,
  messages: KortyxPromptMessage[],
  options: ModelOptions,
  stream: boolean,
): AnthropicMessagesRequest => {
  const thinking = getThinkingRequest(options);
  const thinkingBudget =
    thinking?.type === "enabled" ? thinking.budget_tokens : 0;
  const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const system = toSystemPrompt(messages, options);
  const topP = getNumberProviderOption(options, "topP", "top_p");
  const topK = getNumberProviderOption(options, "topK", "top_k");
  const tools = options.tools?.map(toAnthropicTool);

  return {
    model: modelId,
    max_tokens: maxOutputTokens + thinkingBudget,
    messages: toMessages(messages),
    stream,
    ...(system !== undefined ? { system } : {}),
    ...(options.temperature !== undefined && thinking?.type !== "enabled"
      ? { temperature: options.temperature }
      : {}),
    ...(topP !== undefined ? { top_p: topP } : {}),
    ...(topK !== undefined ? { top_k: topK } : {}),
    ...(options.stopSequences !== undefined
      ? { stop_sequences: options.stopSequences }
      : {}),
    ...(thinking !== undefined ? { thinking } : {}),
    ...(tools?.length ? { tools } : {}),
  };
};
