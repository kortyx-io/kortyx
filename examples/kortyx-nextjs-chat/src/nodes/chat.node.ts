import { useAiProvider } from "kortyx";

export const chatNode = async ({
  input,
  params,
}: {
  input: unknown;
  params?: Record<string, unknown> | undefined;
}) => {
  const modelId =
    typeof params?.model === "string"
      ? params.model
      : "google:gemini-2.5-flash";
  const temperature =
    typeof params?.temperature === "number" ? params.temperature : 0.3;
  const system =
    typeof params?.system === "string"
      ? params.system
      : "You are a helpful assistant in a demo Next.js app. Keep responses long intentionally.";

  const model = useAiProvider(modelId);
  const res = await model.call({
    system,
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
