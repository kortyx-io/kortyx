import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Radix positions and rotates this downward-pointing arrow for every side. */
export function OverlayArrow({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      {...props}
      width="16"
      height="8"
      viewBox="0 0 16 8"
      aria-hidden="true"
      className={cn("pointer-events-none overflow-visible", className)}
    >
      {/* Extend into the panel by 1.5px to cover its border at the join. */}
      <path
        d="M0 -1.5H16V0L8.707 7.293Q8 8 7.293 7.293L0 0Z"
        className="fill-popover"
      />
      <path
        d="M0 0L7.293 7.293Q8 8 8.707 7.293L16 0"
        className="stroke-border"
        fill="none"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
