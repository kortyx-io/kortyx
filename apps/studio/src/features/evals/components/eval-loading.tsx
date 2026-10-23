"use client";

import type { ReactNode } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { TablePageHeader } from "@/components/data-table/table-page-header";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";
import { DetailPage } from "@/components/detail/detail-page";
import { DetailHeader, Metric } from "@/components/detail/detail-primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { cn } from "@/lib/utils";
import { judgeInstructionsDescription } from "../lib/judge-instructions";
import { EvalConversationTable } from "./eval-case-table";
import { EvalCostBreakdown } from "./eval-cost";
import { EvalDetailHeader } from "./eval-detail-header";
import { EvalDropdown } from "./eval-dropdown";
import {
  EvalAssessmentSkeleton,
  EvalCaseEvidenceSkeleton,
  EvalTranscriptSkeleton,
} from "./eval-evidence-skeleton";
import { EvalSuiteNavigation } from "./eval-suite-navigation";
import { createEvaluationColumns } from "./evaluation-table-columns";

const noop = () => {};
const line = <Skeleton className="h-4 w-24 max-w-full" />;

/** Real table chrome owns column sizing, saved layout, toolbar and pinned footer. */
export function EvalTableSkeleton({
  tableId,
  columns,
  header,
  embedded = false,
  toolbar,
  rowHeight = 61,
  searchPlaceholder = "Search conversations…",
}: {
  tableId: string;
  columns: {
    key: string;
    label: string;
    defaultWidth?: number;
    defaultHidden?: boolean;
  }[];
  header?: ReactNode;
  embedded?: boolean;
  toolbar?: ReactNode;
  rowHeight?: number;
  searchPlaceholder?: string;
}) {
  return (
    <section
      className="h-full min-h-0"
      aria-busy="true"
      aria-label="Loading evaluation table"
    >
      <DataTable
        loading
        loadingRowHeight={rowHeight}
        tableId={tableId}
        columns={columns.map(
          (column): DataTableColumn<never> => ({
            ...column,
            defaultWidth: column.defaultWidth ?? 160,
            filter: false,
            render: () => null,
          }),
        )}
        data={[]}
        getRowKey={() => ""}
        header={header}
        toolbarStart={toolbar}
        search={{ placeholder: searchPlaceholder }}
        variant={embedded ? "inline" : "standalone"}
      />
    </section>
  );
}

export function EvalListSkeleton({ view }: { view: "runs" | "suites" }) {
  const runs = createEvaluationColumns(noop, 0);
  const columns =
    view === "runs"
      ? [
          ...runs.slice(0, 4),
          { key: "changes", label: "Changes", defaultWidth: 290 },
          ...runs.slice(4),
        ]
      : [
          { key: "suite", label: "Suite", defaultWidth: 310 },
          { key: "application", label: "Application", defaultWidth: 240 },
          { key: "cases", label: "Conversations", defaultWidth: 130 },
          { key: "latest", label: "Latest run", defaultWidth: 150 },
          { key: "latestCost", label: "Latest cost", defaultWidth: 160 },
          { key: "latestAt", label: "Latest run date", defaultWidth: 160 },
          {
            key: "latestPassRate",
            label: "Latest pass rate (%)",
            defaultWidth: 160,
          },
          {
            key: "latestDuration",
            label: "Latest duration (ms)",
            defaultWidth: 160,
          },
          { key: "run", label: "Execute", defaultWidth: 110 },
        ];
  return (
    <EvalTableSkeleton
      rowHeight={view === "runs" ? 71 : 69}
      searchPlaceholder={
        view === "runs"
          ? "Search runs, commits or environments…"
          : "Search suites…"
      }
      tableId={view === "runs" ? "evaluations" : "eval-suites"}
      columns={columns}
      header={
        <TablePageHeader
          help={studioHelp.evals}
          title={view === "runs" ? "Evaluation runs" : "Evaluation suites"}
          description={
            view === "runs"
              ? "Results, costs and changes across saved evaluation runs"
              : "Browse suites and their conversation definitions"
          }
          actions={
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-12" />
              <Skeleton className="size-8" />
              <Skeleton className="h-8 w-36" />
            </div>
          }
        />
      }
    />
  );
}

function Header({ children }: { children?: ReactNode }) {
  return (
    <EvalDetailHeader
      loading
      title="Loading evaluation"
      description=""
      backLabel="Loading"
      onBack={noop}
      help={null}
      actions={<Skeleton className="h-8 w-28" />}
    >
      {children}
    </EvalDetailHeader>
  );
}

export function EvalSuitePageSkeleton() {
  return (
    <EvalTableSkeleton
      tableId="eval-suite-conversations"
      rowHeight={61}
      header={<Header />}
      columns={[
        { key: "name", label: "Conversation", defaultWidth: 320 },
        { key: "input", label: "Opening message", defaultWidth: 380 },
        { key: "steps", label: "Steps", defaultWidth: 100 },
        { key: "expectations", label: "What is checked", defaultWidth: 420 },
        { key: "workflow", label: "Workflow", defaultWidth: 180 },
      ]}
    />
  );
}

function SuiteRailSkeleton({ comparison = false }: { comparison?: boolean }) {
  return (
    <EvalSuiteNavigation
      loading
      overviewLabel={comparison ? "All suites" : "All conversations"}
      suites={["suite-a", "suite-b", "suite-c"].map((id) => ({
        id,
        name: "Loading suite",
        description: comparison ? undefined : "Loading results",
      }))}
      selected={null}
      onSelect={noop}
    />
  );
}
export function EvalEvaluationBodySkeleton() {
  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-busy="true"
      aria-label="Loading evaluation run"
    >
      <Header>
        <div className="mt-2 flex h-[58px] min-w-0 overflow-x-auto rounded-md border bg-muted/20">
          {[
            "Suites finished",
            "Recorded outcomes",
            "Passed",
            "Failed",
            "Errors",
            "Cancelled",
            "Total cost",
          ].map((label) => (
            <Metric
              key={label}
              label={label}
              help={studioHelp.evalResults}
              value={<Skeleton className="my-0.5 h-3 w-10" />}
            />
          ))}
          <Metric
            label="Execution settings"
            value={<Skeleton className="my-0.5 h-3 w-32" />}
          />
        </div>
      </Header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <SuiteRailSkeleton />
        <div className="min-h-0 min-w-0 flex-1">
          <EvalConversationTable
            scope="evaluation"
            rows={[]}
            loading
            onCaseChange={noop}
            toolbar={
              <EvalDropdown
                disabled
                label="Comparison baseline"
                triggerLabel="Comparison baseline"
                value=""
                options={[]}
                onChange={noop}
              />
            }
          />
        </div>
      </div>
    </section>
  );
}
export function EvalEvaluationPageSkeleton() {
  return (
    <DetailPage title="Evaluation run" description="Loading">
      <EvalEvaluationBodySkeleton />
    </DetailPage>
  );
}

function TabsSkeleton() {
  return (
    <div
      className="flex h-[39px] shrink-0 items-center gap-5 border-b px-5"
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-4 w-16" />
      ))}
    </div>
  );
}
export function EvalRunBodySkeleton() {
  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-busy="true"
      aria-label="Loading suite run"
    >
      <Header>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-6 w-20" />
          ))}
        </div>
      </Header>
      <TabsSkeleton />
      <div className="min-h-0 flex-1">
        <EvalConversationTable
          scope="suite"
          rows={[]}
          loading
          onCaseChange={noop}
        />
      </div>
    </section>
  );
}
export function EvalRunPageSkeleton() {
  return (
    <DetailPage title="Suite run" description="Loading">
      <EvalRunBodySkeleton />
    </DetailPage>
  );
}

function CaseBodySkeleton({ fullPage = false }: { fullPage?: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {fullPage ? (
        <>
          <div className="shrink-0 border-b p-3">
            <Skeleton className="h-6 w-32" />
          </div>
          <DetailHeader
            eyebrow="Case evaluation"
            status={line}
            title="Loading conversation"
            description={line}
          />
        </>
      ) : null}
      <div className="shrink-0 border-b p-4">
        <Skeleton className="h-8 w-full" />
      </div>
      <div className="min-h-0 flex-1">
        <EvalCaseEvidenceSkeleton />
      </div>
    </div>
  );
}
export function EvalCasePageSkeleton() {
  return (
    <DetailPage title="Conversation result" description="Loading">
      <CaseBodySkeleton fullPage />
    </DetailPage>
  );
}
export function EvalCaseDrawerSkeleton() {
  return (
    <DetailDrawerLoading
      basePath="/evals/cases"
      title="Conversation result"
      description="Loading conversation"
    >
      <CaseBodySkeleton />
    </DetailDrawerLoading>
  );
}

function JudgeBodySkeleton({ fullPage = false }: { fullPage?: boolean }) {
  const params = useParams<{ source?: string }>();
  const detail = useDetailDrawer();
  const showHeader = fullPage || detail.navigation?.expanded;
  return (
    <section
      aria-busy="true"
      aria-label="Loading judge instructions"
      className="flex h-full min-h-0 flex-col"
    >
      <div className="flex shrink-0 flex-col gap-3 border-b p-4">
        {showHeader ? (
          <>
            <div className="flex h-8 items-center gap-2">
              <Skeleton className="size-8" />
              <Skeleton className="h-4 w-36" />
            </div>
            {line}
          </>
        ) : null}
        <div className="flex h-[22px] gap-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-5 w-24" />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {judgeInstructionsDescription(params?.source !== "target")}
        </p>
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {Array.from({ length: 16 }, (_, i) => (
            <Skeleton
              key={`line-${i}`}
              className={cn("h-4", i % 4 === 3 ? "mb-4 w-3/5" : "w-full")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
export function EvalJudgePageSkeleton() {
  return (
    <DetailPage title="Judge instructions" description="Loading">
      <JudgeBodySkeleton fullPage />
    </DetailPage>
  );
}
export function EvalJudgeDrawerSkeleton() {
  return (
    <DetailDrawerLoading
      basePath="/evals/judges"
      title="Judge instructions"
      description="Loading instructions"
    >
      <JudgeBodySkeleton />
    </DetailDrawerLoading>
  );
}

export function EvalComparisonTableSkeleton({
  evaluation = true,
}: {
  evaluation?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {evaluation ? <SuiteRailSkeleton comparison /> : null}
      <div className="min-h-0 min-w-0 flex-1">
        <EvalTableSkeleton
          embedded
          rowHeight={65}
          tableId={evaluation ? "evaluation-comparison" : "eval-comparison"}
          toolbar={
            <EvalDropdown
              disabled
              label="Show changes"
              triggerLabel="All changes"
              value="all"
              options={[]}
              onChange={noop}
            />
          }
          searchPlaceholder={
            evaluation
              ? "Search suites or conversations…"
              : "Search all columns…"
          }
          columns={[
            ...(evaluation
              ? [{ key: "suite", label: "Suite", defaultWidth: 180 }]
              : []),
            {
              key: "case",
              label: "Conversation",
              defaultWidth: evaluation ? 260 : 320,
            },
            {
              key: "baseline",
              label: "Baseline",
              defaultWidth: evaluation ? 145 : 130,
            },
            {
              key: "candidate",
              label: "Candidate",
              defaultWidth: evaluation ? 145 : 130,
            },
            {
              key: "change",
              label: "Change",
              defaultWidth: evaluation ? 180 : 170,
            },
            ...(!evaluation
              ? [
                  {
                    key: "passRateDelta",
                    label: "Pass-rate change (%)",
                    defaultWidth: 160,
                  },
                  {
                    key: "durationDelta",
                    label: "Mean duration change (ms)",
                    defaultWidth: 190,
                  },
                ]
              : []),
            { key: "baselineCost", label: "Baseline cost", defaultWidth: 125 },
            {
              key: "candidateCost",
              label: "Candidate cost",
              defaultWidth: 125,
            },
            { key: "costDelta", label: "Mean cost change", defaultWidth: 150 },
            ...(!evaluation
              ? [
                  {
                    key: "baselineAttempts",
                    label: "Baseline repetitions",
                    defaultWidth: 160,
                  },
                  {
                    key: "candidateAttempts",
                    label: "Candidate repetitions",
                    defaultWidth: 160,
                  },
                ]
              : []),
          ]}
        />
      </div>
    </div>
  );
}
export function EvalComparisonPageSkeleton() {
  return (
    <DetailPage title="Compare evaluations" description="Loading">
      <div className="flex h-full min-h-0 flex-col">
        <Header>
          <div className="grid min-w-0 grid-cols-1 items-start gap-3 pt-2 @2xl:grid-cols-[1fr_auto_1fr]">
            {[
              "Baseline · Compare against",
              "Candidate · Change under review",
            ].map((label, index) => (
              <div className="contents" key={label}>
                {index === 1 ? <Skeleton className="size-8" /> : null}
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <Skeleton className="h-8 w-full" />
                  <EvalCostBreakdown loading />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-24" />
            ))}
          </div>
        </Header>
        <div className="min-h-0 flex-1">
          <EvalComparisonTableSkeleton />
        </div>
      </div>
    </DetailPage>
  );
}
function LegacyComparisonBodySkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Repetitions are independent executions. Select a result on each side;
          their repetition numbers do not imply a matched pair.
        </p>
        {line}
        <Skeleton className="h-5 w-24" />
      </div>
      <TabsSkeleton />
      <div className="@container min-h-0 flex-1 overflow-hidden p-4">
        <div className="grid min-w-0 grid-cols-1 divide-y-2 divide-foreground/20 @3xl:grid-cols-2 @3xl:divide-x @3xl:divide-y-0">
          {["Baseline", "Candidate"].map((label) => (
            <div
              key={label}
              className="flex min-w-0 flex-col gap-4 py-6 first:pt-0 last:pb-0 @3xl:py-0 @3xl:px-5 @3xl:first:pl-0 @3xl:last:pr-0"
            >
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold">{label}</h3>
                {line}
              </div>
              <div className="flex h-8 items-center justify-between gap-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-8 w-40" />
              </div>
              {line}
              {line}
              <div className="flex flex-col gap-2">
                {line}
                <EvalCostBreakdown loading />
              </div>
              <div className="flex flex-col gap-4 border-t pt-5">
                <EvalAssessmentSkeleton />
                <EvalTranscriptSkeleton />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export function EvalComparisonCasePageSkeleton() {
  return (
    <DetailPage title="Conversation comparison" description="Loading">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-[57px] shrink-0 items-center border-b px-4">
          {line}
        </div>
        <div className="min-h-0 flex-1">
          <LegacyComparisonBodySkeleton />
        </div>
      </div>
    </DetailPage>
  );
}
export function EvalComparisonCaseDrawerSkeleton() {
  return (
    <DetailDrawerLoading
      basePath="/evals/cases"
      title="Conversation comparison"
      description="Saved run comparison"
    >
      <LegacyComparisonBodySkeleton />
    </DetailDrawerLoading>
  );
}

export function EvalLegacyComparisonPageSkeleton() {
  return (
    <DetailPage title="Compare suite runs" description="Loading">
      <div className="flex h-full min-h-0 flex-col">
        <Header>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex max-w-full shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-6 w-24" />
              ))}
            </div>
            <div className="flex min-w-0 flex-1 basis-56 items-center justify-end gap-2">
              <Skeleton className="h-7 w-full max-w-64" />
              <Skeleton className="size-6" />
            </div>
          </div>
        </Header>
        <div className="min-h-0 flex-1">
          <EvalComparisonTableSkeleton evaluation={false} />
        </div>
      </div>
    </DetailPage>
  );
}
