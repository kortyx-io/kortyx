"use client";
import { ChevronDown } from "lucide-react";
import { parseAsBoolean } from "nuqs";
import type { ReactNode } from "react";
import { useStudioQueryState } from "@/lib/nuqs";
export function EvalDisclosure({
  scope,
  label,
  children,
  defaultOpen = false,
}: {
  scope: string;
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useStudioQueryState(
    `expand.${scope}`,
    parseAsBoolean.withDefault(defaultOpen).withOptions({ shallow: true }),
  );
  return (
    <div className="min-w-0 space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          void setOpen(!open);
        }}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
        {label}
      </button>
      {open ? <div className="min-w-0">{children}</div> : null}
    </div>
  );
}
