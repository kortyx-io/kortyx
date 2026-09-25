import type { ReactNode } from "react";
import { OverflowText } from "@/components/ui/overflow-tooltip";
import { cn } from "@/lib/utils";

export function DetailHeader({
  eyebrow,
  title,
  status,
  description,
  metrics,
  alert,
}: {
  eyebrow: string;
  title: string;
  status: ReactNode;
  description: ReactNode;
  metrics?: ReactNode;
  alert?: ReactNode;
}) {
  return (
    <div className="@container shrink-0 border-b">
      <div
        data-responsive-surface="detail-header"
        className="min-w-0 px-4 py-3 @lg:px-6 @lg:py-4"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
          {status}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <h2
            aria-label={title}
            title={title}
            className="min-w-0 max-w-full truncate font-mono text-sm font-semibold @lg:text-base"
          >
            <OverflowText ariaLabel={title}>{title}</OverflowText>
          </h2>
        </div>
        <div className="mt-0.5 min-w-0 line-clamp-2 break-words text-xs leading-4 text-muted-foreground">
          {description}
        </div>
        {metrics && (
          <div className="mt-2 flex min-w-0 gap-0 overflow-x-auto rounded-md border bg-muted/20">
            {metrics}
          </div>
        )}
        {alert && <div className="mt-2">{alert}</div>}
      </div>
    </div>
  );
}

export function Metric({
  label,
  value,
  title,
}: {
  label: string;
  value: ReactNode;
  title?: string;
}) {
  return (
    <div className="min-w-20 shrink-0 border-r px-3 py-1.5 last:border-r-0 @2xl:min-w-24">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div
        className="min-w-0 truncate font-mono text-[11px] font-medium"
        title={title}
      >
        {value}
      </div>
    </div>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "danger" | "warning" | "info" | "neutral";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "success" &&
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        tone === "danger" && "bg-red-500/10 text-red-700 dark:text-red-400",
        tone === "warning" &&
          "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        tone === "info" && "bg-blue-500/10 text-blue-700 dark:text-blue-400",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function KeyValue({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1 py-2 @xl:grid-cols-[minmax(90px,140px)_minmax(0,1fr)] @xl:gap-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-xs">{children}</dd>
    </div>
  );
}
