"use server";

import { google } from "@kortyx/google";
import { sanitizeGeneratedChatTitle } from "@/lib/chat-title";

const TITLE_SYSTEM_PROMPT = [
  "Generate a concise sidebar title for this chat session.",
  "Output exactly 2 or 3 words.",
  "Prefer 3 words when that makes the topic clearer.",
  "Never output a single word.",
  "No quotes, labels, punctuation, or markdown.",
  "Do not use the words chat or session.",
].join(" ");

export async function generateChatSessionTitle(
  message: string,
): Promise<string> {
  const input = message.trim();
  if (!input) return "";

  try {
    const modelRef = google("gemini-2.5-flash", {
      maxOutputTokens: 50,
      streaming: false,
      temperature: 0.2,
      // Disable Gemini 2.5 Flash's dynamic "thinking" — with a tiny
      // maxOutputTokens budget the thinking tokens consume the whole
      // allowance and Google returns an internal error before any title
      // text is produced. thinkingBudget: 0 turns reasoning off entirely.
      reasoning: { maxTokens: 0 },
    });
    const model = modelRef.provider.getModel(
      modelRef.modelId,
      modelRef.options,
    );
    const result = await model.invoke([
      { role: "system", content: TITLE_SYSTEM_PROMPT },
      { role: "user", content: input.slice(0, 2000) },
    ]);
    return sanitizeGeneratedChatTitle(result.content);
  } catch (error) {
    console.warn("[chat-title] failed to generate title", error);
    return "";
  }
}
