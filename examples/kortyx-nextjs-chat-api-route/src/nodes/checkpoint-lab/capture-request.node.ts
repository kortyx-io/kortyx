import { useStructuredData, useWorkflowState } from "kortyx";

export const checkpointLabCaptureRequestNode = async ({
  input,
}: {
  input: string;
}) => {
  const prompt = String(input ?? "").trim() || "Plan a small product update.";
  const [, setPrompt] = useWorkflowState<string>("checkpointLab.prompt", "");

  setPrompt(prompt);

  useStructuredData({
    dataType: "checkpoint-lab.step",
    data: {
      step: "capture-request",
      prompt,
    },
  });

  return {
    data: { prompt },
  };
};
