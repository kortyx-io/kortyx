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
      return "medium";
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

      const parts: GoogleContent["parts"] = [];
      if (message.content.length > 0 || !message.toolCalls?.length) {
        parts.push({ text: message.content });
      }
      for (const toolCall of message.toolCalls ?? []) {
        parts.push({
          functionCall: {
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

const toGoogleSchema = (schema: unknown): unknown => {
  if (Array.isArray(schema)) return schema.map(toGoogleSchema);
  if (!schema || typeof schema !== "object") return schema;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (
      key === "$schema" ||
      key === "$defs" ||
      key === "definitions" ||
      key === "additionalProperties"
    ) {
      continue;
    }
    result[key] = toGoogleSchema(value);
  }
  return result;
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
        parameters: toGoogleSchema(tool.inputSchema),
      })),
    },
  ];
};

export const createGenerateContentRequest = (
  messages: KortyxPromptMessage[],
  options: ModelOptions,
): GoogleGenerateContentRequest => {
  const systemInstruction = toSystemInstruction(messages);
  const normalizedThinkingLevel = normalizeThinkingLevel(
    options.reasoning?.effort,
  );
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
          ...(options.reasoning?.maxTokens !== undefined
            ? { thinkingBudget: options.reasoning.maxTokens }
            : {}),
          ...(options.reasoning?.maxTokens === undefined &&
          normalizedThinkingLevel !== undefined
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
      ...(thinkingConfig !== undefined ? { thinkingConfig } : {}),
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
    .map((part) => part.text)
    .filter((text): text is string => typeof text === "string")
    .join("");
};
