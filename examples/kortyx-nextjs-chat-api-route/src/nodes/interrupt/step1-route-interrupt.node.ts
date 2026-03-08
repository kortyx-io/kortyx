import { useStructuredData } from "kortyx";

export type InterruptMode = "choice" | "multi" | "text";

export const step1RouteInterruptNode = async ({ input }: { input: string }) => {
  const raw = String(input ?? "");
  const q = raw.trim().toLowerCase();

  const mode: InterruptMode =
    q.startsWith("/text") || q.includes(" text") || q === "text"
      ? "text"
      : q.startsWith("/multi") || q.includes(" multi") || q === "multi"
        ? "multi"
        : "choice";

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "route-interrupt",
      mode,
      raw,
    },
  });

  return {
    condition: mode,
    data: { mode },
    ui: {
      message:
        mode === "text"
          ? "Interrupt demo: **text**. Type your answer and press Enter."
          : mode === "multi"
            ? "Interrupt demo: **multi-choice**. Select one or more options."
            : "Interrupt demo: **choice**. Pick one option.",
    },
  };
};
