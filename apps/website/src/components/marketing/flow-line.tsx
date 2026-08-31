"use client";

import { motion, useReducedMotion } from "framer-motion";
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
      <motion.path
        d={path}
        fill="none"
        stroke={color.line}
        strokeWidth="1.5"
        strokeDasharray="5 9"
        vectorEffect="non-scaling-stroke"
        initial={false}
        animate={
          reducedMotion
            ? { strokeDashoffset: 0 }
            : { strokeDashoffset: reverse ? [0, 28] : [0, -28] }
        }
        transition={
          reducedMotion
            ? { duration: 0 }
            : { duration: 1.4, ease: "linear", repeat: Infinity }
        }
      />
      <motion.circle
        r="2.2"
        fill={color.glow}
        initial={false}
        cx={vertical ? 6 : start}
        cy={vertical ? start : 6}
        animate={
          reducedMotion
            ? { opacity: 0.7 }
            : vertical
              ? { cy: [start, end], opacity: [0, 1, 1, 0] }
              : { cx: [start, end], opacity: [0, 1, 1, 0] }
        }
        transition={
          reducedMotion
            ? { duration: 0 }
            : { duration: 2.2, ease: "linear", repeat: Infinity }
        }
        style={{ filter: `drop-shadow(0 0 4px ${color.glow})` }}
      />
    </svg>
  );
}
