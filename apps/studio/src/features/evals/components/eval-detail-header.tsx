import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { OverflowText } from "@/components/ui/overflow-tooltip";

/** Compact identity and actions shared by eval detail pages. */
export function EvalDetailHeader({
  title,
  description,
  backLabel,
  onBack,
  actions,
  children,
}: {
  title: string;
  description: ReactNode;
  backLabel: string;
  onBack: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="@container shrink-0 border-b px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={backLabel}
          title={backLabel}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1 basis-40">
          <h2
            aria-label={title}
            className="truncate font-mono text-sm font-semibold"
          >
            <OverflowText ariaLabel={title}>{title}</OverflowText>
          </h2>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {description}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      {children ? <div className="mt-2 min-w-0">{children}</div> : null}
    </header>
  );
}

export function EvalSummaryMetric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap text-xs">
      <span className="font-mono font-medium">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
