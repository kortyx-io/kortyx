"use client";

import { type ReactNode, useMemo } from "react";

import { DataTable, type DataTableColumn } from "@/components/data-table";
import { columnFilter } from "@/components/data-table/filter-fields";
import { DetailLink } from "@/components/detail/detail-link";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { formatDurationMs } from "@/lib/format";
import { detailNavigationHref } from "@/lib/nuqs";
import { useSearchParams } from "@/lib/scoped-navigation";
import { studioHelp, withStudioColumnHelp } from "@/lib/studio-help";
import { studioFeature } from "@/usage/client";
import type {
  ConversationChange,
  EvaluationChanges,
} from "../lib/evaluation-changes";
import { evalCaseHref } from "../lib/navigation";
import {
  type CaseGroup,
  type CaseRow,
  groupCaseRows,
} from "../lib/presentation";
import { EvalChangeCell } from "./eval-change-cell";
import { EvalCost, evalFilterCost } from "./eval-cost";
import { EvalStatus } from "./eval-status";

export type ConversationTableRow = CaseGroup & {
  runId: string;
  suiteId?: string;
  suiteName?: string;
};

export function EvalCaseTable({
  runId,
  rows,
  onCaseChange,
  active = false,
  mixedCases,
  toolbar,
}: {
  runId: string;
  rows: CaseRow[];
  onCaseChange: (key: string) => void;
  active?: boolean;
  mixedCases?: ReadonlySet<string>;
  toolbar?: ReactNode;
}) {
  return (
    <EvalConversationTable
      scope="suite"
      rows={groupCaseRows(rows, { active, mixedCases }).map((row) => ({
        ...row,
        runId,
      }))}
      toolbar={toolbar}
      onCaseChange={(row) =>
        onCaseChange(`${row.caseId}:${row.defaultRepetition}`)
      }
    />
  );
}

export function EvalConversationTable({
  rows,
  onCaseChange,
  toolbar,
  scope,
  emptyMessage,
  loading = false,
  comparison,
  onInspectChange,
  onFilteredRowsChange,
}: {
  rows: ConversationTableRow[];
  onCaseChange: (row: ConversationTableRow) => void;
  toolbar?: ReactNode;
  scope: "suite" | "evaluation";
  emptyMessage?: string;
  loading?: boolean;
  comparison?: EvaluationChanges;
  onInspectChange?: (change: ConversationChange) => void;
  onFilteredRowsChange?: (rows: ConversationTableRow[]) => void;
}) {
  const search = useSearchParams();
  const changes = useMemo(
    () =>
      new Map(
        comparison?.rows.map((change) => [
          JSON.stringify([change.suiteId, change.caseId]),
          change,
        ]),
      ),
    [comparison],
  );
  const inspected = () =>
    studioFeature("studio.inspect", {
      surface: "evals",
      action: "inspect",
      tab: "results",
    });
  const columns: DataTableColumn<ConversationTableRow>[] = [
    ...(scope === "evaluation"
      ? [
          {
            key: "suite",
            label: "Suite",
            defaultWidth: 180,
            cellTitle: (row: ConversationTableRow) => row.suiteName,
            filter: columnFilter(
              "suite",
              "Suite",
              "text",
              (row: ConversationTableRow) => row.suiteName,
            ),
            render: (row: ConversationTableRow) => (
              <span className="text-xs">{row.suiteName}</span>
            ),
          },
        ]
      : []),
    {
      key: "case",
      label: "Conversation",
      defaultWidth: 300,
      cellClassName: "[&>.table-cell-content]:line-clamp-none",
      filter: [
        columnFilter("case", "Conversation", "text", (row) => row.name),
        columnFilter("caseId", "Case ID", "text", (row) => row.caseId),
      ],
      render: (row) => (
        <div className="space-y-1">
          <Button
            variant="link"
            size="inline"
            className="max-w-full justify-start whitespace-normal text-left"
            asChild
          >
            <DetailLink
              onNavigate={inspected}
              href={detailNavigationHref(
                evalCaseHref(row.runId, row.caseId, row.defaultRepetition),
                search,
              )}
              title={row.name}
            >
              <span className="line-clamp-2 whitespace-normal break-words">
                {row.name}
              </span>
            </DetailLink>
          </Button>
          <p
            className="line-clamp-1 break-all font-mono text-[11px] text-muted-foreground"
            title={row.caseId}
          >
            {row.caseId}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Outcome",
      defaultWidth: 170,
      sortValue: (row) => row.status,
      filter: columnFilter("status", "Repetition outcome", "enum", (row) => [
        ...new Set([row.status, ...row.repetitions.map((item) => item.status)]),
      ]),
      render: (row) => (
        <div className="flex flex-col gap-1">
          <div
            className="flex min-h-6 items-center gap-1 pointer-coarse:min-h-11"
            data-guide-focus={
              row.status === "mixed" ? "eval-mixed-results" : undefined
            }
          >
            <EvalStatus status={row.status} />
            {row.status === "mixed" ? (
              <HelpCircle help={studioHelp.evalMixedResults} />
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">
            {row.counts.passed} of {row.counts.total} passed
            {row.counts.failed ? ` · ${row.counts.failed} failed` : ""}
            {row.counts.error ? ` · ${row.counts.error} errors` : ""}
            {row.counts.cancelled ? ` · ${row.counts.cancelled} cancelled` : ""}
            {row.counts.completed < row.counts.total
              ? ` · ${row.counts.total - row.counts.completed} unfinished`
              : ""}
          </span>
        </div>
      ),
    },
    ...(scope === "evaluation"
      ? [
          {
            key: "change",
            label: "Change",
            defaultWidth: 200,
            help: studioHelp.evalComparison,
            filter: columnFilter(
              "change",
              "Change since earlier run",
              "enum",
              (row: ConversationTableRow) =>
                changes.get(JSON.stringify([row.suiteId, row.caseId]))?.label ??
                "No earlier result",
            ),
            render: (row: ConversationTableRow) => {
              const change = changes.get(
                JSON.stringify([row.suiteId, row.caseId]),
              );
              return comparison?.state === "ready" ? (
                <EvalChangeCell
                  change={change}
                  onInspect={() => {
                    if (change) onInspectChange?.(change);
                  }}
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {comparison?.state === "active"
                    ? "Still grading"
                    : comparison?.state === "error"
                      ? "Changes unavailable"
                      : comparison?.state === "none"
                        ? "No earlier completed run"
                        : "Updating changes…"}
                </span>
              );
            },
          },
        ]
      : []),
    {
      key: "repetitions",
      label: "Repetitions",
      defaultWidth: 110,
      help: studioHelp.evalRepetitions,
      filter: [
        columnFilter(
          "repetitions",
          "Repetitions",
          "number",
          (row) => row.repetitions.length,
        ),
        columnFilter("attempt", "Repetition number", "number", (row) =>
          row.repetitions.map((item) => item.repetition),
        ),
      ],
      render: (row) => (
        <span className="font-mono text-xs">{row.repetitions.length}</span>
      ),
    },
    {
      key: "cost",
      label: "Total cost",
      defaultWidth: 120,
      help: {
        ...studioHelp.evalCost,
        description:
          "Recorded workflow and judge cost across all repetitions of this conversation. Missing or partial prices remain incomplete.",
      },
      filter: columnFilter("cost", "Total cost", "number", (row) =>
        evalFilterCost(row.costs),
      ),
      render: (row) => <EvalCost costs={row.costs} />,
    },
    {
      key: "duration",
      label: "Total execution time",
      defaultWidth: 155,
      filter: columnFilter(
        "duration",
        "Total repetition duration (ms)",
        "number",
        (row) => row.durationMs,
      ),
      help: {
        ...studioHelp.evalTiming,
        description:
          "Sum of the recorded durations of this conversation’s repetitions. Concurrent repetitions can overlap; this is not wall-clock evaluation duration.",
      },
      render: (row) => (
        <span className="font-mono text-xs">
          {formatDurationMs(row.durationMs)}
        </span>
      ),
    },
    {
      key: "failure",
      label: "Failure summary",
      defaultWidth: 300,
      filter: columnFilter("failure", "Failure summary", "text", (row) =>
        row.repetitions.flatMap((item) => [
          ...(item.failures ?? []),
          ...item.errors.map((error) => error.message),
          ...item.steps
            .filter(
              (step) => step.status === "failed" || step.status === "error",
            )
            .map((step) => step.reason ?? ""),
        ]),
      ),
      render: (row) => (
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {row.repetitions
            .flatMap((item) => [
              ...(item.failures ?? []),
              ...item.errors.map((error) => error.message),
              ...item.steps
                .filter(
                  (step) => step.status === "failed" || step.status === "error",
                )
                .map((step) => step.reason),
            ])
            .find(Boolean) ?? "—"}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      loading={loading}
      loadingRowHeight={73}
      help={{ filters: studioHelp.filters, views: studioHelp.views }}
      compatibility={{ aliases: { outcome: "status" } }}
      columns={withStudioColumnHelp(columns, "evals")}
      tableId={
        scope === "evaluation" ? "evaluation-conversations" : "eval-cases"
      }
      toolbarStart={toolbar}
      search={{
        label: "Search conversations",
        placeholder: "Search conversations…",
      }}
      data={rows}
      onFilteredRowsChange={onFilteredRowsChange}
      getRowKey={(row) =>
        scope === "evaluation" ? `${row.runId}:${row.caseId}` : row.caseId
      }
      onRowClick={(row) => {
        inspected();
        onCaseChange(row);
      }}
      rowTone={(row) =>
        row.counts.failed || row.counts.error ? "danger" : undefined
      }
      variant="inline"
      emptyState={({ hasFilters, clearFilters }) => (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? "No conversations match these filters."
              : (emptyMessage ?? "No conversations were selected.")}
          </p>
          {hasFilters ? (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      )}
    />
  );
}
