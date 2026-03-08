import { useInterrupt, useStructuredData } from "kortyx";

export const step2AskChoiceNode = async () => {
  const picked = await useInterrupt({
    request: {
      kind: "choice",
      question: "Pick one:",
      options: [
        { id: "alpha", label: "Alpha" },
        { id: "beta", label: "Beta" },
        { id: "gamma", label: "Gamma" },
      ],
    },
  });

  const choice = String(picked ?? "");

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "ask-choice",
      choice,
    },
  });

  return {
    data: { choice },
    ui: { message: `You picked: **${choice}**` },
  };
};
