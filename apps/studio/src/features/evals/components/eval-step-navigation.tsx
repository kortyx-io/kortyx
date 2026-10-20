"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvalDropdown } from "./eval-dropdown";

/** The same step is selected on both sides of a comparison. Indices are SDK indices. */
export function EvalStepNavigation({
  steps,
  selected,
  onSelect,
}: {
  steps: { index: number; status?: string }[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const position = steps.findIndex((step) => step.index === selected);
  if (steps.length < 2) return null;
  return (
    <nav
      aria-label="Conversation steps"
      className="flex w-full items-center gap-2"
    >
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Previous step"
        disabled={position <= 0}
        onClick={() => onSelect(steps[position - 1].index)}
      >
        <ChevronLeft />
      </Button>
      <EvalDropdown
        className="min-w-0 flex-1"
        label="Conversation step"
        value={String(selected)}
        options={steps.map((step) => ({
          value: String(step.index),
          label: `Step ${step.index + 1}${step.status ? ` · ${step.status}` : ""}`,
        }))}
        onChange={(value) => onSelect(Number(value))}
      />
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Next step"
        disabled={position < 0 || position >= steps.length - 1}
        onClick={() => onSelect(steps[position + 1].index)}
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}
