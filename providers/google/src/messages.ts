import type { KortyxPromptMessage, ModelOptions } from "@kortyx/providers";
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
    .map(
      (message): GoogleContent => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }),
    );

  if (contents.length === 0) {
    contents.push({
      role: "user",
      parts: [{ text: "" }],
    });
  }

  return contents;
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
