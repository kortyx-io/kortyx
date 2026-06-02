import { useInterrupt, useStructuredData } from "kortyx";

export const step1AskTextResumeRegressionNode = async () => {
  const picked = await useInterrupt({
    id: "text-resume-regression-answer",
    request: {
      kind: "text",
      question: "Regression check: enter a short answer.",
    },
  });

  const answer = String(picked ?? "").trim();

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "text-resume-regression-completed",
      answer,
    },
  });

  return {
    data: { answer },
    ui: {
      message: `Text resume regression completed: ${answer || "(empty)"}`,
    },
  };
};
