"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDurationMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type ConversationStat,
  conversationStatTrend,
  outcomeCount,
  pricedConversationCost,
  type StatTrend,
} from "../lib/conversation-stat-trends";
import type { ChangeSide, ConversationChange } from "../lib/evaluation-changes";
import type { CaseRow, ComparisonRow } from "../lib/presentation";
import { repetitionStatTrend } from "../lib/repetition-stat-trends";
import { EvalCost } from "./eval-cost";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalStatsSkeleton } from "./eval-evidence-skeleton";
import { EvalStatus } from "./eval-status";

function StatChange({ trend, label }: { trend: StatTrend; label: string }) {
  if (trend.delta === 0 || trend.improvement === null) return null;
  const Icon = trend.delta > 0 ? ArrowUp : ArrowDown;
  const amount = Math.abs(trend.delta);
  const difference =
    trend.unit === "duration"
      ? amount > 0 && amount < 1
        ? "<1ms"
        : formatDurationMs(amount)
      : trend.unit === "cost"
        ? `${amount > 0 && amount < 0.000001 ? "<" : ""}${formatCurrency(amount > 0 && amount < 0.000001 ? 0.000001 : amount, { currency: trend.currency })}`
        : `${amount > 0 && amount < 0.1 ? "<0.1" : Number(amount.toFixed(1))}${trend.unit === "percent" ? "%" : ""}`;
  const description = `${difference} ${trend.delta > 0 ? "higher" : "lower"}${trend.improvement ? " · improved" : " · worse"}`;
  return (
    <span
      data-stat-trend={trend.improvement ? "better" : "worse"}
      role="img"
      aria-label={`${label}: ${description}`}
      title={description}
      className={cn(
        "inline-flex items-center gap-1 font-sans text-[11px]",
        trend.improvement
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-red-700 dark:text-red-400",
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {difference}
    </span>
  );
}

export function EvalComparisonStats({
  summary,
  change,
  row,
  selectedComparison,
  loading,
  section = "both",
  scope = "comparison",
  footer,
}: {
  summary: ChangeSide;
  change?: ConversationChange;
  row?: CaseRow;
  selectedComparison?: ComparisonRow;
  loading: boolean;
  section?: "selected" | "all" | "both";
  scope?: string;
  footer?: ReactNode;
}) {
  const selectedStats: {
    label: string;
    content: ReactNode;
    trend?: StatTrend;
  }[] = row
    ? [
        { label: "Outcome", content: <EvalStatus status={row.status} /> },
        {
          label: "Execution time",
          content: formatDurationMs(row.durationMs),
          trend: repetitionStatTrend(selectedComparison, "duration"),
        },
        {
          label: "Total cost",
          content: <EvalCost costs={row.costs} />,
          trend: repetitionStatTrend(selectedComparison, "total"),
        },
      ]
    : [];
  return (
    <section
      aria-label="Conversation stats"
      data-comparison-stats
      className="flex min-w-0 flex-col gap-2"
    >
      {section !== "all" ? (
        <div className="flex flex-col gap-2">
          {loading ? (
            <EvalStatsSkeleton />
          ) : row ? (
            <div className="overflow-hidden rounded-lg border bg-muted/20">
              <dl
                data-repetition-stats
                className="grid grid-cols-3 gap-0 text-xs"
              >
                {selectedStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex min-w-0 flex-col gap-2 border-r px-3 py-3 last:border-r-0"
                  >
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {stat.label}
                    </dt>
                    <dd className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
                      <span>{stat.content}</span>
                      {stat.trend ? (
                        <StatChange trend={stat.trend} label={stat.label} />
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
              {footer}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Repetition stats unavailable
            </p>
          )}
        </div>
      ) : null}
      {section !== "selected" ? (
        <div data-all-repetitions-stats className="flex flex-col gap-3">
          <Separator />
          <EvalDisclosure
            scope={`${scope}-all-repetitions`}
            label={`All repetitions · ${summary.total}`}
          >
            <div className="pt-3">
              <EvalAllRepetitionStats summary={summary} change={change} />
            </div>
          </EvalDisclosure>
        </div>
      ) : null}
    </section>
  );
}

export function EvalAllRepetitionStats({
  summary,
  change,
}: {
  summary: ChangeSide;
  change?: ConversationChange;
}) {
  const price = pricedConversationCost(summary);
  const count = (status: string) => outcomeCount(summary, status);
  const stats: {
    id: ConversationStat;
    label: string;
    content: ReactNode;
  }[] = [
    {
      id: "passRate",
      label: "Pass rate",
      content: summary.total
        ? `${Math.round((summary.passed / summary.total) * 100)}% · ${summary.passed}/${summary.total}`
        : "—",
    },
    { id: "passed", label: "Passed", content: summary.passed },
    { id: "failed", label: "Failed", content: count("failed") },
    { id: "error", label: "Errors", content: count("error") },
    { id: "cancelled", label: "Cancelled", content: count("cancelled") },
    {
      id: "unassessed",
      label: "Unassessed",
      content:
        summary.total -
        count("passed") -
        count("failed") -
        count("error") -
        count("cancelled"),
    },
    {
      id: "duration",
      label: "Total execution time",
      content: formatDurationMs(summary.durationMs),
    },
    {
      id: "meanDuration",
      label: "Mean time / repetition",
      content: formatDurationMs(
        summary.durationMs === undefined || !summary.total
          ? undefined
          : summary.durationMs / summary.total,
      ),
    },
    {
      id: "cost",
      label: "Total cost",
      content: <EvalCost costs={summary.costs} />,
    },
    {
      id: "meanCost",
      label: "Mean cost / repetition",
      content:
        price && summary.total
          ? formatCurrency(price.amount / summary.total, {
              currency: price.currency,
            })
          : "—",
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {!summary.total ? (
        <p className="text-xs text-muted-foreground">No recorded result</p>
      ) : (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 text-xs [&>dt]:text-muted-foreground [&>dd]:text-right [&>dd]:font-mono">
          {stats.map((stat) => {
            const trend = change && conversationStatTrend(change, stat.id);
            return (
              <Fragment key={stat.id}>
                <dt>{stat.label}</dt>
                <dd className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
                  <span>{stat.content}</span>
                  {trend ? (
                    <StatChange trend={trend} label={stat.label} />
                  ) : null}
                </dd>
              </Fragment>
            );
          })}
        </dl>
      )}
    </div>
  );
}
