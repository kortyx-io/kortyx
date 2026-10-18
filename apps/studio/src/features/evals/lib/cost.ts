import type { EvalCosts } from "@kortyx/agent/evals";
export function evalFilterCost(costs?: EvalCosts) {
  const total = costs?.total;
  return (
    total?.amount ??
    (total?.costSummary?.amounts.length === 1
      ? total.costSummary.amounts[0]?.amount
      : undefined)
  );
}
