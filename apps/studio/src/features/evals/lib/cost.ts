import type { EvalCostAmount, EvalCosts } from "@kortyx/agent/evals";
export function evalFilterCost(costs?: EvalCosts) {
  const total = costs?.total;
  return (
    total?.amount ??
    (total?.costSummary?.amounts.length === 1
      ? total.costSummary.amounts[0]?.amount
      : undefined)
  );
}

/** Sum recorded repetitions without converting currencies or treating missing prices as zero. */
export function sumCaseCosts(
  parts: readonly (EvalCosts | undefined)[],
): EvalCosts | undefined {
  if (!parts.length || parts.every((part) => !part)) return undefined;
  const sum = (key: keyof EvalCosts): EvalCostAmount => {
    const amounts = new Map<string | null, number>();
    let complete = true;
    let calls = 0;
    let unpricedCalls = 0;
    let estimated = false;
    for (const costs of parts) {
      const part = costs?.[key];
      if (!part) {
        complete = false;
        continue;
      }
      calls += part.calls;
      unpricedCalls += part.unpricedCalls;
      estimated ||= part.estimated;
      const summary = part.costSummary ?? {
        complete: part.status === "complete",
        amounts:
          part.amount === null
            ? []
            : [{ amount: part.amount, currency: part.currency }],
      };
      complete &&= summary.complete;
      for (const value of summary.amounts)
        amounts.set(
          value.currency,
          (amounts.get(value.currency) ?? 0) +
            Math.round(value.amount * 1_000_000),
        );
    }
    const values = [...amounts]
      .sort(([a], [b]) => (a ?? "").localeCompare(b ?? ""))
      .map(([currency, amount]) => ({ currency, amount: amount / 1_000_000 }));
    return {
      amount: values.length === 1 ? values[0].amount : null,
      currency: values.length === 1 ? values[0].currency : null,
      status:
        complete && values.length === 1
          ? "complete"
          : values.length === 1
            ? "partial"
            : "unavailable",
      costSummary: { amounts: values, complete },
      calls,
      unpricedCalls,
      estimated,
    };
  };
  return {
    workflow: sum("workflow"),
    judge: sum("judge"),
    total: sum("total"),
  };
}
