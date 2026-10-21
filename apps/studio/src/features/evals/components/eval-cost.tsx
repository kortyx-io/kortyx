"use client";
import type { EvalCostAmount, EvalCosts } from "@kortyx/agent/evals";
import { CostValue } from "@/components/cost-value";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { costDisplay } from "@/lib/cost";
import { studioHelp } from "@/lib/studio-help";

export { evalFilterCost } from "../lib/cost";

function evalCostValue(value?: EvalCostAmount) {
  return {
    cost: value?.amount,
    currency: value?.currency,
    costSummary: value?.costSummary ?? {
      amounts:
        value?.amount == null
          ? []
          : [{ amount: value.amount, currency: value.currency }],
      complete: value?.status === "complete",
    },
  };
}

export function evalCostLabel(value?: EvalCostAmount) {
  return costDisplay(evalCostValue(value)).label;
}
export function EvalCost({
  costs,
  label = "Total cost",
}: {
  costs?: EvalCosts;
  label?: string;
}) {
  return (
    <InfoTooltip
      label="Evaluation cost"
      documentationUrl={studioHelp.evalCost.documentationUrl}
      trigger={
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="font-mono text-xs"
          aria-label={`${label}: ${evalCostLabel(costs?.total)}`}
        >
          {evalCostLabel(costs?.total)}
        </button>
      }
    >
      <div className="space-y-1">
        <p>Workflow: {evalCostLabel(costs?.workflow)}</p>
        <p>Judge: {evalCostLabel(costs?.judge)}</p>
        <p className="text-muted-foreground">
          {costs?.total.status === "complete"
            ? costs.total.estimated
              ? "Estimated from recorded usage and model rates."
              : "Provider-reported charges for recorded calls."
            : costDisplay(evalCostValue(costs?.total)).note}
        </p>
        <p className="text-muted-foreground">
          Includes model calls; excludes infrastructure and external tool fees.
        </p>
      </div>
    </InfoTooltip>
  );
}
export function EvalCostBreakdown({
  costs,
  loading = false,
}: {
  costs?: EvalCosts;
  loading?: boolean;
}) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 border-y py-3 text-xs">
      <div className="flex gap-2">
        <dt className="text-muted-foreground">Workflow</dt>
        <dd>
          {loading ? (
            <Skeleton className="h-4 w-16" />
          ) : (
            <CostValue value={evalCostValue(costs?.workflow)} />
          )}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-muted-foreground">Judge</dt>
        <dd>
          {loading ? (
            <Skeleton className="h-4 w-16" />
          ) : (
            <CostValue value={evalCostValue(costs?.judge)} />
          )}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-muted-foreground">Total cost</dt>
        <dd>
          {loading ? (
            <button
              type="button"
              disabled
              className="relative font-mono text-xs"
              aria-label="Loading total cost"
            >
              <span className="invisible">Loading</span>
              <Skeleton className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2" />
            </button>
          ) : (
            <EvalCost costs={costs} />
          )}
        </dd>
      </div>
    </dl>
  );
}
