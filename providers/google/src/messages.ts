import type { KortyxPromptMessage } from "@kortyx/providers";
import type {
  GoogleContent,
  GoogleGenerateContentRequest,
  GoogleGenerateContentResponse,
} from "./types";

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
  temperature: number,
): GoogleGenerateContentRequest => {
  const systemInstruction = toSystemInstruction(messages);

  return {
    contents: toContents(messages),
    generationConfig: { temperature },
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
