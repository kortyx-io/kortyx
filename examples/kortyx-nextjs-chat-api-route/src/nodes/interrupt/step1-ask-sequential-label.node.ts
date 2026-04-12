import { useInterrupt, useStructuredData } from "kortyx";

export const step1AskSequentialLabelNode = async () => {
  useStructuredData({
    dataType: "hooks",
    data: {
      step: "sequential-ask-label",
    },
  });

  const picked = await useInterrupt({
    request: {
      kind: "text",
      question: "First interrupt: enter a short label for this run.",
    },
  });

  const label = String(picked ?? "").trim();

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "sequential-label-captured",
      label,
      length: label.length,
    },
  });

  return {
    data: { label },
    ui: {
      message: label ? `Captured label: **${label}**` : "No label provided.",
    },
  };
};
