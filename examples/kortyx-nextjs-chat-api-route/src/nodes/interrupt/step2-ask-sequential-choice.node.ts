import { useInterrupt, useStructuredData } from "kortyx";

export const step2AskSequentialChoiceNode = async () => {
  useStructuredData({
    dataType: "hooks",
    data: {
      step: "sequential-ask-choice",
    },
  });

  const picked = await useInterrupt({
    request: {
      kind: "choice",
      question: "Second interrupt: pick the next action.",
      options: [
        { id: "review", label: "Review" },
        { id: "fix", label: "Fix" },
        { id: "ship", label: "Ship" },
      ],
    },
  });

  const action = String(picked ?? "").trim();

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "sequential-choice-captured",
      action,
    },
  });

  return {
    data: { action },
    ui: {
      message: action
        ? `Captured action: **${action}**`
        : "No action selected.",
    },
  };
};
