"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type CostDisplayValue, costDisplay } from "@/lib/cost";

export function CostValue({
  value,
  average = false,
}: {
  value: CostDisplayValue;
  average?: boolean;
}) {
  const display = costDisplay(value);
  const note = average
    ? `${display.note} Known costs divided by all runs in this selection, including runs with incomplete cost data.`
    : display.note;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="pointer-events-auto cursor-help"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          aria-label={`${average ? "Average model cost" : "Model cost"}: ${display.label}`}
        >
          {display.label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{note}</TooltipContent>
    </Tooltip>
  );
}
