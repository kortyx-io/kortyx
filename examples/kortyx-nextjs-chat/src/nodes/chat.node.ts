import { useAiProvider } from "kortyx";

export type ChatNodeParams = {
  model?: string;
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
    model = "google:gemini-2.5-flash",
    temperature = 0.3,
    system = "",
  } = params;

  const llm = useAiProvider(model);

  const res = await llm.call({
    system:
      system ||
      "You are a helpful assistant in a demo Next.js app. Keep responses concise and practical.",
    prompt: String(input ?? ""),
    temperature,
    emit: true,
    stream: true,
  });

  return {
    data: { text: res.text },
    ui: { message: res.text },
  };
};
