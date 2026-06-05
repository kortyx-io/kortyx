import { useStructuredData, useWorkflowState } from "kortyx";

type CheckpointLabBrief = {
  title: string;
  template: string;
  depth: string;
  summary: string;
  bullets: string[];
  generatedAt: string;
};

const templateLabels: Record<string, string> = {
  launch: "Launch brief",
  research: "Research brief",
  ops: "Operations brief",
};

const depthLabels: Record<string, string> = {
  compact: "Compact",
  standard: "Standard",
  deep: "Deep",
};

export const checkpointLabDraftBriefNode = async () => {
  const [prompt] = useWorkflowState<string>("checkpointLab.prompt", "");
  const [template] = useWorkflowState<string>("checkpointLab.template", "");
  const [depth] = useWorkflowState<string>("checkpointLab.depth", "");

  const title = `${templateLabels[template] ?? "Brief"}: ${
    prompt || "Untitled request"
  }`;
  const brief: CheckpointLabBrief = {
    title,
    template,
    depth,
    summary: [
      `This draft was generated from the stored prompt: "${prompt}".`,
      `It uses the ${templateLabels[template] ?? template} shape and ${
        depthLabels[depth] ?? depth
      } depth.`,
      "Regenerate this assistant message to verify Kortyx rolls back to the checkpoint before the final draft and resumes from the saved interrupt answers.",
    ].join(" "),
    bullets: [
      "The original user prompt is held in workflow state.",
      "The template and depth answers are held across interrupt resumes.",
      "Rollback invalidates structured chunks emitted after the target checkpoint.",
    ],
    generatedAt: new Date().toISOString(),
  };

  useStructuredData({
    dataType: "checkpoint-lab.brief",
    data: brief,
  });

  return {
    data: { brief },
    ui: {
      message: [
        `## ${brief.title}`,
        "",
        brief.summary,
        "",
        ...brief.bullets.map((bullet) => `- ${bullet}`),
        "",
        `Generated at: ${brief.generatedAt}`,
      ].join("\n"),
    },
  };
};
