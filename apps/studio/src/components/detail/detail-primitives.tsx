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
        className="min-w-0 px-4 py-4 @lg:px-6 @lg:py-5"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
          <h2
            aria-label={title}
            className="min-w-0 max-w-full font-mono text-lg font-semibold"
          >
            <OverflowText ariaLabel={title}>{title}</OverflowText>
          </h2>
          {status}
        </div>
        <div className="mt-1 min-w-0 break-words text-sm text-muted-foreground">
          {description}
        </div>
        {metrics && (
          <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 @2xl:flex @2xl:flex-wrap">
            {metrics}
          </div>
        )}
        {alert && <div className="mt-4">{alert}</div>}
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
    <div className="min-w-0 rounded-md border bg-muted/25 px-3 py-2 @2xl:min-w-24">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div
        className="mt-0.5 min-w-0 truncate font-mono text-xs font-medium"
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
