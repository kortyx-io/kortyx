// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks run in server workflow nodes.
import { defineWorkflow, useInterrupt, useWorkflow } from "kortyx";
import { z } from "zod";

export const briefApprovalWorkflow = defineWorkflow({
  id: "brief-approval",
  version: "1.0.0",
  inputSchema: z.object({ summary: z.string() }),
  outputSchema: z.object({ approved: z.boolean() }),
  nodes: {
    approve: {
      run: async ({ input }: { input: { summary: string } }) => {
        const choice = await useInterrupt({
          id: "approve-brief",
          request: {
            kind: "choice",
            question: `Approve this brief? ${input.summary}`,
            options: [
              { id: "approve", label: "Approve" },
              { id: "decline", label: "Decline" },
            ],
          },
        });
        return { data: { approved: choice === "approve" } };
      },
    },
  },
  edges: [
    ["__start__", "approve"],
    ["approve", "__end__"],
  ],
});

export const briefReviewWorkflow = defineWorkflow({
  id: "brief-review",
  version: "1.0.0",
  description:
    "Summarize a brief and optionally ask a child workflow for approval.",
  inputSchema: z.object({
    brief: z.string().trim().min(1),
    requireApproval: z.boolean(),
  }),
  outputSchema: z.object({
    summary: z.string(),
    approved: z.boolean().nullable(),
  }),
  nodes: {
    summarize: {
      // Deterministic so this example works without model credentials.
      run: ({ input }: { input: { brief: string } }) => ({
        data: { summary: input.brief.replace(/\s+/g, " ").slice(0, 180) },
      }),
    },
    review: {
      run: async ({
        input,
      }: {
        input: { summary: string; requireApproval: boolean };
      }) => {
        const approval = input.requireApproval
          ? await useWorkflow({
              id: "approval",
              workflow: briefApprovalWorkflow,
              input: { summary: input.summary },
            })
          : null;
        return {
          data: {
            summary: input.summary,
            approved: approval?.data.approved ?? null,
          },
        };
      },
    },
  },
  edges: [
    ["__start__", "summarize"],
    ["summarize", "review"],
    ["review", "__end__"],
  ],
});
