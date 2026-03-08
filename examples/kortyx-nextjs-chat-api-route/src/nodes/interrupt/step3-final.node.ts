import { useStructuredData } from "kortyx";

export const step3InterruptFinalNode = async ({
  input,
}: {
  input: {
    rawInput: string;
    mode?: string;
    choice?: string;
    text?: string;
    selected?: string[];
  };
}) => {
  const mode = String(input.mode ?? "");
  const choice = typeof input.choice === "string" ? input.choice : "";
  const text = typeof input.text === "string" ? input.text : "";
  const selected = Array.isArray(input.selected)
    ? input.selected.map((x) => String(x))
    : [];

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "final",
      mode,
      choice,
      textLen: text.length,
      selectedCount: selected.length,
    },
  });

  const line =
    mode === "text"
      ? `Text: ${text || "(empty)"}`
      : mode === "multi"
        ? `Selected: ${selected.length ? selected.join(", ") : "(none)"}`
        : `Choice: ${choice || "(none)"}`;

  return {
    ui: {
      message: `Interrupt demo completed.\n${line}`,
    },
  };
};
