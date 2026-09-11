import type {
  KortyxPromptMessage,
  KortyxToolDefinition,
  ModelOptions,
} from "@kortyx/providers";
import type {
  GoogleContent,
  GoogleGenerateContentRequest,
  GoogleGenerateContentResponse,
} from "./types";

const normalizeThinkingLevel = (
  effort: string | undefined,
): NonNullable<
  NonNullable<
    GoogleGenerateContentRequest["generationConfig"]
  >["thinkingConfig"]
>["thinkingLevel"] => {
  switch (effort) {
    case "minimal":
    case "low":
    case "medium":
    case "high":
      return effort;
    case undefined:
      return undefined;
    default:
      throw new Error(
        `Google does not support reasoning effort "${effort}". Use a supported effort or an explicit budget.`,
      );
  }
};

export const toSystemInstruction = (
  messages: KortyxPromptMessage[],
): string | undefined => {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);

  if (systemMessages.length === 0) return undefined;
  return systemMessages.join("\n\n");
};

export const toContents = (
  messages: KortyxPromptMessage[],
): GoogleContent[] => {
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message): GoogleContent => {
      if (message.role === "tool") {
        return {
          role: "user",
          parts: [
            {
              functionResponse: {
                ...(message.toolCallId &&
                !message.toolCallId.startsWith("google-")
                  ? { id: message.toolCallId }
                  : {}),
                name: message.name ?? "tool",
                response: {
                  content: message.content,
                  ...(message.structuredContent !== undefined
                    ? { structuredContent: message.structuredContent }
                    : {}),
                  ...(message.isError !== undefined
                    ? { isError: message.isError }
                    : {}),
                },
              },
            },
          ],
        };
      }

      if (
        message.role === "assistant" &&
        message.continuation?.providerId === "google" &&
        message.continuation.api === "generate-content"
      ) {
        return {
          role: "model",
          parts: message.continuation.items as GoogleContent["parts"],
        };
      }
      const parts: GoogleContent["parts"] = [];
      if (message.content.length > 0 || !message.toolCalls?.length) {
        parts.push({ text: message.content });
      }
      for (const toolCall of message.toolCalls ?? []) {
        parts.push({
          functionCall: {
            id: toolCall.id,
            name: toolCall.name,
            args: toolCall.input,
          },
        });
      }

      return {
        role: message.role === "assistant" ? "model" : "user",
        parts,
      };
    });

  if (contents.length === 0) {
    contents.push({
      role: "user",
      parts: [{ text: "" }],
    });
  }

  return contents;
};

const toGoogleTools = (
  tools: KortyxToolDefinition[] | undefined,
): GoogleGenerateContentRequest["tools"] => {
  if (!tools?.length) return undefined;
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        parametersJsonSchema: tool.inputSchema,
      })),
    },
  ];
};

export const createGenerateContentRequest = (
  messages: KortyxPromptMessage[],
  options: ModelOptions,
  modelId?: string,
): GoogleGenerateContentRequest => {
  const systemInstruction = toSystemInstruction(messages);
  const nativeOptions = options.providerOptions?.google as
    | {
        thinkingConfig?: {
          thinkingBudget?: number;
          thinkingLevel?: "minimal" | "low" | "medium" | "high";
          includeThoughts?: boolean;
        };
      }
    | undefined;
  const effort = options.reasoning?.effort;
  const is25 = modelId?.includes("gemini-2.5");
  if (effort !== undefined && options.reasoning?.maxTokens !== undefined)
    throw new Error(
      "Google reasoning accepts either effort or maxTokens, not both.",
    );
  if (effort === "none" && modelId && !is25)
    throw new Error(
      `Google ${modelId} cannot disable thinking through reasoning.effort. Select a compatible model.`,
    );
  if (
    (effort === "none" || options.reasoning?.maxTokens === 0) &&
    modelId?.includes("gemini-2.5-pro")
  )
    throw new Error("Gemini 2.5 Pro cannot disable thinking.");
  const budgets: Record<string, number> = {
    none: 0,
    minimal: 512,
    low: 1024,
    medium: 8192,
    high: 24576,
  };
  if (is25 && effort !== undefined && budgets[effort] === undefined)
    throw new Error(`Unsupported Google reasoning effort: ${effort}`);
  const budget =
    options.reasoning?.maxTokens ??
    (is25 && effort ? budgets[effort] : effort === "none" ? 0 : undefined);
  const normalizedThinkingLevel =
    budget === undefined ? normalizeThinkingLevel(effort) : undefined;
  const temperature = options.temperature ?? 0.7;
  const responseMimeType =
    options.responseFormat?.type === "json"
      ? "application/json"
      : options.responseFormat?.type === "text"
        ? "text/plain"
        : undefined;
  const thinkingConfig:
    | NonNullable<
        NonNullable<
          GoogleGenerateContentRequest["generationConfig"]
        >["thinkingConfig"]
      >
    | undefined =
    options.reasoning?.maxTokens !== undefined ||
    options.reasoning?.effort !== undefined ||
    options.reasoning?.includeThoughts !== undefined
      ? {
          ...(budget !== undefined ? { thinkingBudget: budget } : {}),
          ...(budget === undefined && normalizedThinkingLevel !== undefined
            ? {
                thinkingLevel: normalizedThinkingLevel,
              }
            : {}),
          ...(options.reasoning?.includeThoughts !== undefined
            ? { includeThoughts: options.reasoning.includeThoughts }
            : {}),
        }
      : undefined;

  return {
    contents: toContents(messages),
    ...(toGoogleTools(options.tools) !== undefined
      ? { tools: toGoogleTools(options.tools) }
      : {}),
    generationConfig: {
      temperature,
      ...(options.maxOutputTokens !== undefined
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
      ...(options.stopSequences !== undefined
        ? { stopSequences: options.stopSequences }
        : {}),
      ...(responseMimeType !== undefined ? { responseMimeType } : {}),
      ...((nativeOptions?.thinkingConfig ?? thinkingConfig) !== undefined
        ? { thinkingConfig: nativeOptions?.thinkingConfig ?? thinkingConfig }
        : {}),
      ...(options.responseFormat?.type === "json" &&
      options.responseFormat.schema !== undefined
        ? { responseJsonSchema: options.responseFormat.schema }
        : {}),
    },
    ...(systemInstruction
      ? {
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
        }
      : {}),
  };
};

export const extractText = (
  response: GoogleGenerateContentResponse,
): string => {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => !part.thought)
    .map((part) => part.text)
    .filter((text): text is string => typeof text === "string")
    .join("");
};
