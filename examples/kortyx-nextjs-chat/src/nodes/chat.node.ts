import type { ProviderModelRef } from "kortyx";
import { useReason } from "kortyx";
import { google } from "@/lib/providers";

export type ChatNodeParams = {
  model?: ProviderModelRef;
  temperature?: number;
  system?: string;
};

export const chatNode = async ({
  input,
  params,
}: {
  input: unknown;
  params: ChatNodeParams;
}) => {
  const {
    model = google("gemini-2.5-flash"),
    temperature = 0.3,
    system = "",
  } = params;

  const res = await useReason({
    model,
    system:
      system ||
      "You are a helpful assistant in a demo Next.js app. Keep responses concise and practical.",
    input: String(input ?? ""),
    temperature,
    emit: true,
    stream: true,
  });

  return {
    data: { text: res.text },
    ui: { message: res.text },
  };
};
