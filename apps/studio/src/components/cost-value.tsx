"use client";

import { InfoTooltip } from "@/components/ui/info-tooltip";
import { type CostDisplayValue, costDisplay } from "@/lib/cost";
import { studioHelp } from "@/lib/studio-help";

export function CostValue({
  value,
  average = false,
}: {
  value: CostDisplayValue;
  average?: boolean;
}) {
  const display = costDisplay(value);
  const note = average
    ? `${display.note} The average uses known costs divided by every run shown, including runs with missing costs.`
    : display.note;
  return (
    <InfoTooltip
      label={average ? "Average model cost" : "Model cost"}
      documentationUrl={studioHelp.cost.documentationUrl}
      trigger={
        <button
          type="button"
          className="pointer-events-auto cursor-help"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          aria-label={`${average ? "Average model cost" : "Model cost"}: ${display.label}`}
        >
          {display.label}
        </button>
      }
    >
      {note}
    </InfoTooltip>
  );
}
