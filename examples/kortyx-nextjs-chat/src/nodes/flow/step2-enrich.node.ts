import { useStructuredData, useWorkflowState } from "kortyx";
import type { step1ParseInputNode } from "./step1-parse-input.node";

type Step1Data = Awaited<ReturnType<typeof step1ParseInputNode>>["data"];

type Step2Input = { rawInput: string } & Step1Data;

export const step2EnrichNode = async ({ input }: { input: Step2Input }) => {
  const [checked] = useWorkflowState<
    Array<{ item: string; ok: boolean; reason: string }>
  >("checked", []);

  const upper = input.query.toUpperCase();
  const okCount = checked.filter((c) => c.ok).length;
  const total = checked.length;

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "enrich",
      upper,
      checked: { ok: okCount, total },
    },
  });

  return {
    data: {
      upper,
      checked: { ok: okCount, total },
    },
  } satisfies {
    data: { upper: string; checked: { ok: number; total: number } };
  };
};
