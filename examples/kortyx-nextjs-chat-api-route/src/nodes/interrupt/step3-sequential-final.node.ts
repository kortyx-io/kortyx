import { useStructuredData } from "kortyx";

export const step3SequentialFinalNode = async ({
  input,
}: {
  input: {
    label?: string;
    action?: string;
  };
}) => {
  const label = typeof input.label === "string" ? input.label : "";
  const action = typeof input.action === "string" ? input.action : "";

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "sequential-final",
      label,
      action,
    },
  });

  return {
    ui: {
      message:
        "Sequential interrupt demo completed.\n" +
        `Label: ${label || "(empty)"}\n` +
        `Action: ${action || "(none)"}`,
    },
  };
};
