import { useInterrupt, useStructuredData, useWorkflowState } from "kortyx";

export const checkpointLabSelectDepthNode = async () => {
  const [, setDepth] = useWorkflowState<string>("checkpointLab.depth", "");

  const picked = await useInterrupt({
    request: {
      kind: "choice",
      question: "Checkpoint lab: choose the level of detail.",
      options: [
        {
          id: "compact",
          label: "Compact",
          description: "Short summary with three bullets.",
        },
        {
          id: "standard",
          label: "Standard",
          description: "Balanced summary with concrete next steps.",
        },
        {
          id: "deep",
          label: "Deep",
          description: "More detailed brief with risks and assumptions.",
        },
      ],
    },
  });

  const nextDepth = String(picked ?? "").trim() || "standard";
  setDepth(nextDepth);

  useStructuredData({
    dataType: "checkpoint-lab.step",
    data: {
      step: "select-depth",
      depth: nextDepth,
    },
  });

  return {
    data: { depth: nextDepth },
    ui: {
      message: `Depth selected: **${nextDepth}**`,
    },
  };
};
