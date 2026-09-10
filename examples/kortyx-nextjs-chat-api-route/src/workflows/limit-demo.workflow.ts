// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks run in server workflow nodes.
import { defineWorkflow, useWorkflow } from "kortyx";
import { z } from "zod";

export const limitStepWorkflow = defineWorkflow({
  id: "limit-step",
  version: "1.0.0",
  inputSchema: z.object({ step: z.string() }),
  outputSchema: z.object({ step: z.string() }),
  nodes: {
    finish: {
      run: ({ input }: { input: { step: string } }) => ({ data: input }),
    },
  },
  edges: [
    ["__start__", "finish"],
    ["finish", "__end__"],
  ],
});

export const limitDemoWorkflow = defineWorkflow({
  id: "limit-demo",
  version: "1.0.0",
  description:
    "Two child calls share one allowance. Continue reuses the first result.",
  inputSchema: z.string(),
  outputSchema: z.object({ steps: z.array(z.string()) }),
  nodes: {
    work: {
      run: async () => {
        const first = await useWorkflow({
          id: "first",
          workflow: limitStepWorkflow,
          input: { step: "Research" },
        });
        const second = await useWorkflow({
          id: "second",
          workflow: limitStepWorkflow,
          input: { step: "Review" },
        });
        return {
          data: { steps: [first.data.step, second.data.step] },
          ui: {
            message:
              "Research and review complete. Both child workflows finished.",
          },
        };
      },
    },
  },
  edges: [
    ["__start__", "work"],
    ["work", "__end__"],
  ],
});
