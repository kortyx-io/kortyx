import { useInterrupt, useStructuredData, useWorkflowState } from "kortyx";

export const checkpointLabSelectTemplateNode = async () => {
  const [, setTemplate] = useWorkflowState<string>(
    "checkpointLab.template",
    "",
  );

  const picked = await useInterrupt({
    request: {
      kind: "choice",
      question: "Checkpoint lab: choose a brief template.",
      options: [
        {
          id: "launch",
          label: "Launch brief",
          description: "Frame the answer around announcement and rollout.",
        },
        {
          id: "research",
          label: "Research brief",
          description:
            "Frame the answer around questions, evidence, and risks.",
        },
        {
          id: "ops",
          label: "Operations brief",
          description: "Frame the answer around owners, tasks, and sequence.",
        },
      ],
    },
  });

  const nextTemplate = String(picked ?? "").trim() || "launch";
  setTemplate(nextTemplate);

  useStructuredData({
    dataType: "checkpoint-lab.step",
    data: {
      step: "select-template",
      template: nextTemplate,
    },
  });

  return {
    data: { template: nextTemplate },
    ui: {
      message: `Template selected: **${nextTemplate}**`,
    },
  };
};
