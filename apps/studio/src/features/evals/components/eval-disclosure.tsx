"use client";
import { ChevronDown } from "lucide-react";
import { parseAsBoolean } from "nuqs";
import type { ReactNode } from "react";
import { useStudioQueryState } from "@/lib/nuqs";
import { cn } from "@/lib/utils";
export function EvalDisclosure({
  scope,
  label,
  children,
  defaultOpen = false,
  variant = "plain",
}: {
  scope: string;
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  variant?: "plain" | "attached";
}) {
  const [open, setOpen] = useStudioQueryState(
    `expand.${scope}`,
    parseAsBoolean.withDefault(defaultOpen).withOptions({ shallow: true }),
  );
  return (
    <div
      className={cn(
        "min-w-0",
        variant === "attached" ? "border-t bg-muted/40" : "space-y-2",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          void setOpen(!open);
        }}
        className={cn(
          "flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground",
          variant === "attached" &&
            "w-full justify-center py-1.5 hover:bg-muted/60",
        )}
      >
        <ChevronDown
          className={cn(
            "size-3 transition-transform",
            open && "rotate-180",
            variant === "attached" && "order-last",
          )}
        />
        {label}
      </button>
      {open ? (
        <div
          className={cn(
            "min-w-0",
            variant === "attached" && "border-t bg-background px-4",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
