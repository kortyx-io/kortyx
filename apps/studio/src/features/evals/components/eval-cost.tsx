import type { EvalCostAmount, EvalCosts } from "@kortyx/agent/evals";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/format";

export function evalCostLabel(value?: EvalCostAmount) {
  if (value?.amount == null || !value.currency) return "—";
  return `${formatCurrency(value.amount, { currency: value.currency })}${value.status === "partial" ? "+" : ""}`;
}
export function EvalCost({ costs }: { costs?: EvalCosts }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="font-mono text-xs"
          aria-label={`Total cost: ${evalCostLabel(costs?.total)}`}
        >
          {evalCostLabel(costs?.total)}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1">
          <p>Workflow: {evalCostLabel(costs?.workflow)}</p>
          <p>Judge: {evalCostLabel(costs?.judge)}</p>
          <p className="text-muted-foreground">
            {costs?.total.status === "complete"
              ? costs.total.estimated
                ? "Estimated from recorded usage and model rates."
                : "Provider-reported charges for recorded calls."
              : "Partial or unavailable: usage, prices or execution are incomplete."}
          </p>
          <p className="text-muted-foreground">
            Includes model calls; excludes infrastructure and external tool
            fees.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
export function EvalCostBreakdown({ costs }: { costs?: EvalCosts }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 border-y py-3 text-xs">
      <div className="flex gap-2">
        <dt className="text-muted-foreground">Workflow</dt>
        <dd>{evalCostLabel(costs?.workflow)}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-muted-foreground">Judge</dt>
        <dd>{evalCostLabel(costs?.judge)}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-muted-foreground">Total cost</dt>
        <dd>
          <EvalCost costs={costs} />
        </dd>
      </div>
    </dl>
  );
}
