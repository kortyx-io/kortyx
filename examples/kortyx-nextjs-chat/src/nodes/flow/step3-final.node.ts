import { useStructuredData, useWorkflowState } from "kortyx";
import type { step2EnrichNode } from "./step2-enrich.node";

type Step2Data = Awaited<ReturnType<typeof step2EnrichNode>>["data"];

type Step3Input = { rawInput: string } & Step2Data;

export const step3FinalNode = async ({ input }: { input: Step3Input }) => {
  const [todos] = useWorkflowState<string[]>("todos", []);
  const [checked] = useWorkflowState<
    Array<{ item: string; ok: boolean; reason: string }>
  >("checked", []);

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "final",
      result: input.upper,
      todos: todos.length,
      checked: checked.length,
    },
  });

  const okCount = checked.filter((c) => c.ok).length;
  return {
    data: {
      result: input.upper,
    },
    ui: {
      message: `Result: ${input.upper}\nTodo check: ${okCount}/${checked.length}`,
    },
  };
};
