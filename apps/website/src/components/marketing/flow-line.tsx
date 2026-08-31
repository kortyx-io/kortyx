"use client";

import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

type FlowLineProps = {
  className?: string;
  direction?: "forward" | "reverse";
  orientation?: "horizontal" | "vertical";
  tone?: "violet" | "blue" | "green" | "amber";
};

const tones = {
  violet: { line: "#8f80ff", glow: "#b7adff" },
  blue: { line: "#63b3ff", glow: "#a6d7ff" },
  green: { line: "#58d6a2", glow: "#a2f0cb" },
  amber: { line: "#f8c75b", glow: "#ffe4a3" },
};

export function FlowLine({
  className,
  direction = "forward",
  orientation = "horizontal",
  tone = "violet",
}: FlowLineProps) {
  const reducedMotion = useReducedMotion();
  const vertical = orientation === "vertical";
  const reverse = direction === "reverse";
  const path = vertical ? "M 6 3 V 97" : "M 3 6 H 97";
  const start = reverse ? 97 : 3;
  const end = reverse ? 3 : 97;
  const color = tones[tone];

  return (
    <svg
      viewBox={vertical ? "0 0 12 100" : "0 0 100 12"}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("overflow-visible", className)}
    >
      <path
        d={path}
        fill="none"
        stroke={color.line}
        strokeWidth="1"
        strokeDasharray="4 8"
        opacity="0.2"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path}
        fill="none"
        stroke={color.line}
        strokeWidth="1.5"
        strokeDasharray="5 9"
        strokeDashoffset={reducedMotion ? 0 : undefined}
        vectorEffect="non-scaling-stroke"
      >
        {!reducedMotion ? (
          <animate
            attributeName="stroke-dashoffset"
            values={reverse ? "0;28" : "0;-28"}
            dur="1.4s"
            repeatCount="indefinite"
          />
        ) : null}
      </path>
      <circle
        r="2.2"
        fill={color.glow}
        cx={vertical ? 6 : start}
        cy={vertical ? start : 6}
        opacity={reducedMotion ? 0.7 : 0}
        style={{ filter: `drop-shadow(0 0 4px ${color.glow})` }}
      >
        {!reducedMotion ? (
          <>
            <animate
              attributeName={vertical ? "cy" : "cx"}
              values={`${start};${end}`}
              dur="2.2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              dur="2.2s"
              repeatCount="indefinite"
            />
          </>
        ) : null}
      </circle>
    </svg>
  );
}
