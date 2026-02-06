import { useAiInterrupt, useStructuredData } from "kortyx";

export const step2AskMultiNode = async () => {
  const picked = await useAiInterrupt({
    kind: "multi-choice",
    question: "Pick one or more:",
    options: [
      { id: "product", label: "Product" },
      { id: "engineering", label: "Engineering" },
      { id: "design", label: "Design" },
      { id: "marketing", label: "Marketing" },
    ],
  });

  const selected = Array.isArray(picked)
    ? picked.map((x) => String(x))
    : typeof picked === "string" && picked.length > 0
      ? [picked]
      : [];

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "ask-multi",
      selected,
      count: selected.length,
    },
  });

  return {
    data: { selected },
    ui: {
      message:
        selected.length > 0
          ? `Selected: **${selected.join(", ")}**`
          : "No selection.",
    },
  };
};
