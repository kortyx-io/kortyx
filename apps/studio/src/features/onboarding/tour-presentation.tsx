"use client";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { ArrowRenderProps, TooltipRenderProps } from "react-joyride";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/** Leave the base open and overlap the panel border by one pixel. */
export function LearningArrow({ base, placement, size }: ArrowRenderProps) {
  const side = placement.split("-")[0];
  const vertical = side === "top" || side === "bottom";
  const width = vertical ? base : size;
  const height = vertical ? size : base;
  const points =
    side === "top"
      ? `0,-1 ${base / 2},${size} ${base},-1`
      : side === "bottom"
        ? `0,${size + 1} ${base / 2},0 ${base},${size + 1}`
        : side === "left"
          ? `-1,0 ${size},${base / 2} -1,${base}`
          : `${size + 1},0 0,${base / 2} ${size + 1},${base}`;
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
      data-tour-arrow="true"
    >
      <polygon points={points} fill="var(--popover)" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GuideTooltip({
  backProps,
  primaryProps,
  skipProps,
  index,
  size,
  step,
  tooltipProps,
  isLastStep,
  label,
  footer,
  onExit,
  onPrevious,
  skipLabel = "Skip",
}: TooltipRenderProps & {
  label: string;
  footer?: ReactNode;
  onExit(): void;
  onPrevious?: () => void;
  skipLabel?: string;
}) {
  const canGoBackChapter = Boolean(onPrevious);
  return (
    <div
      {...tooltipProps}
      role="alertdialog"
      data-slot="dialog-content"
      data-studio-tour="true"
      aria-labelledby="studio-lesson-title"
      aria-describedby="studio-lesson-description"
      className="w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <h2 id="studio-lesson-title" className="pt-0.5 text-sm font-semibold">
          {step.title}
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Exit tour"
          onClick={onExit}
        >
          <X />
        </Button>
      </header>
      <p id="studio-lesson-description" className="px-4 pt-2 text-sm">
        {step.content}
      </p>
      <div className="flex flex-wrap items-center gap-2 p-4">
        <Button {...skipProps} variant="ghost" size="sm" className="mr-auto">
          {skipLabel}
        </Button>
        <Button
          {...backProps}
          variant="secondary"
          size="sm"
          disabled={index === 0 && !canGoBackChapter}
          onClick={
            index === 0 && canGoBackChapter ? onPrevious : backProps.onClick
          }
        >
          Back
        </Button>
        <Button {...primaryProps} size="sm">
          {isLastStep ? "Done" : "Next"}
        </Button>
      </div>
      <Separator />
      <footer className="flex flex-wrap items-center justify-between gap-1 px-4 py-3 text-xs text-muted-foreground">
        <span>
          {label} · Step {index + 1} of {size}
        </span>
        {footer}
      </footer>
    </div>
  );
}
