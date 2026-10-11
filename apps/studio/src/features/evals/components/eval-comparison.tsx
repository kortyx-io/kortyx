"use client";
import { Info } from "lucide-react";
import { parseAsBoolean, parseAsString } from "nuqs";
import {
  DataTable,
  type DataTableColumn,
  DataTableColumnsMenu,
  DataTableProvider,
} from "@/components/data-table";
import { DetailLink } from "@/components/detail/detail-link";
import { usePrepareDetailNavigation } from "@/components/detail/detail-stack";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateTime } from "@/lib/format";
import { detailNavigationHref, useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { evalComparisonCaseHref } from "../lib/navigation";
import {
  type ComparisonRow,
  compareRuns,
  displayName,
  passLabel,
} from "../lib/presentation";
import type { EvalDetail, EvalHistory } from "../schema";
import { EvalDetailHeader, EvalSummaryMetric } from "./eval-detail-header";
import { EvalDropdown } from "./eval-dropdown";
import { EvalStatus } from "./eval-status";

export function EvalComparison({
  candidate,
  baseline,
  history,
  baselineId,
  onBaselineChange,
  onBack,
  loading,
  error,
}: {
  candidate: EvalDetail;
  baseline: EvalDetail | null;
  history: EvalHistory;
  baselineId: string | null;
  onBaselineChange: (id: string) => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const prepareNavigation = usePrepareDetailNavigation();
  const [query, setQuery] = useStudioQueryStates(
    {
      change: parseAsString.withDefault("all"),
      "expand.comparison-context": parseAsBoolean.withDefault(false),
    },
    { shallow: true },
  );
  const filter = query.change;
  const setFilter = (value: string) => {
    void setQuery({ change: value });
  };
  const rows = baseline ? compareRuns(baseline, candidate) : [];
  const caseHref = (id: string) =>
    evalComparisonCaseHref(candidate.id, id, baselineId ?? "");
  const choices = history.runs.filter(
    (r) => r.id !== candidate.id && !["queued", "running"].includes(r.status),
  );
  const columns: DataTableColumn<ComparisonRow>[] = [
    {
      key: "case",
      label: "Conversation",
      defaultWidth: 320,
      render: (r) => (
        <Button
          variant="ghost"
          size="xs"
          className="max-w-full px-0 hover:bg-transparent"
          asChild
        >
          <DetailLink href={caseHref(r.id)}>
            <span className="truncate">{r.name}</span>
          </DetailLink>
        </Button>
      ),
    },
    {
      key: "baseline",
      label: "Baseline",
      defaultWidth: 130,
      render: (r) => (
        <span className="font-mono text-xs">{passLabel(r.baseline)}</span>
      ),
    },
    {
      key: "candidate",
      label: "Candidate",
      defaultWidth: 130,
      render: (r) => (
        <span className="font-mono text-xs">{passLabel(r.candidate)}</span>
      ),
    },
    {
      key: "change",
      label: "Change",
      defaultWidth: 170,
      render: (r) => (
        <span
          title={r.reason}
          className={`text-xs ${r.change === "improved" ? "text-emerald-700 dark:text-emerald-400" : r.change === "regressed" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}
        >
          {r.change === "changed" ? "Context changed" : displayName(r.change)}
        </span>
      ),
    },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <EvalDetailHeader
        title={candidate.suite.name ?? displayName(candidate.suiteId)}
        description={`Comparison · ${candidate.targetName} · ${formatDateTime(candidate.createdAt)}`}
        backLabel="Candidate run"
        onBack={onBack}
        actions={<EvalStatus status={candidate.status} />}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/20 px-3 py-2">
          <div className="flex max-w-full shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
            {baseline ? (
              <>
                <EvalSummaryMetric
                  label="Improved"
                  value={rows.filter((r) => r.change === "improved").length}
                />
                <EvalSummaryMetric
                  label="Regressed"
                  value={rows.filter((r) => r.change === "regressed").length}
                />
                <EvalSummaryMetric
                  label="Unchanged"
                  value={rows.filter((r) => r.change === "unchanged").length}
                />
                <EvalSummaryMetric
                  label="Not comparable"
                  value={
                    rows.filter((r) =>
                      ["changed", "incomplete"].includes(r.change),
                    ).length
                  }
                />
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                Choose a baseline
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 basis-56 items-center justify-end gap-2">
            <EvalDropdown
              label="Baseline"
              value={baselineId ?? ""}
              className="h-7 min-w-0 w-full max-w-64 shrink"
              triggerLabel={
                baseline
                  ? `Baseline · ${formatDateTime(baseline.createdAt)} · ${baseline.status}`
                  : "Choose baseline"
              }
              options={choices.map((run) => ({
                value: run.id,
                label: `${run.suiteName ?? displayName(run.suiteId)} · ${formatDateTime(run.createdAt)} · ${run.status}`,
              }))}
              onChange={onBaselineChange}
            />
            <Popover
              open={query["expand.comparison-context"]}
              onOpenChange={(open) => {
                void setQuery({ "expand.comparison-context": open });
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Comparison context"
                  title="Exploratory comparison: identities, data snapshots and prompt versions were not recorded."
                >
                  <Info />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 max-w-[calc(100vw-2rem)] space-y-2 text-xs leading-relaxed"
              >
                <h3 className="font-semibold">Exploratory comparison</h3>
                <p className="text-muted-foreground">
                  Actor identities, data snapshots and prompt versions were not
                  recorded. Changes reflect recorded pass rates and cannot be
                  attributed to a prompt change.
                </p>
                <p className="text-muted-foreground">
                  Cases with different inputs, reference facts, definitions or
                  graders show no score delta.
                </p>
                {baseline ? (
                  <p className="break-words text-muted-foreground">
                    Suite revisions: {baseline.suiteRevision.slice(0, 12)} →{" "}
                    {candidate.suiteRevision.slice(0, 12)}. Graders:{" "}
                    {baseline.result?.judge?.version ?? "Not recorded"} →{" "}
                    {candidate.result?.judge?.version ?? "Not recorded"}.
                  </p>
                ) : null}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </EvalDetailHeader>
      {error ? (
        <p
          role="alert"
          className="px-4 py-3 text-xs text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}
      {loading ? (
        <output className="p-12 text-center text-sm text-muted-foreground">
          Loading baseline…
        </output>
      ) : (
        <div className="min-h-0 flex-1">
          <DataTableProvider columns={columns}>
            <DataTable
              className="rounded-none border-0 shadow-none"
              data={rows.filter((r) => filter === "all" || r.change === filter)}
              getRowKey={(r) => r.id}
              onRowClick={(r) => {
                const href = detailNavigationHref(caseHref(r.id), search);
                prepareNavigation?.(href);
                router.push(href, { scroll: false });
              }}
              header={
                <div className="flex min-w-0 items-center justify-between gap-2 border-b px-4 py-2">
                  <div className="flex min-w-0 gap-1 overflow-x-auto">
                    {[
                      "all",
                      "regressed",
                      "improved",
                      "changed",
                      "incomplete",
                    ].map((value) => (
                      <Button
                        key={value}
                        variant={filter === value ? "secondary" : "ghost"}
                        size="xs"
                        onClick={() => setFilter(value)}
                      >
                        {value === "all"
                          ? "All cases"
                          : value === "changed"
                            ? "Context changed"
                            : displayName(value)}
                      </Button>
                    ))}
                  </div>
                  <DataTableColumnsMenu />
                </div>
              }
              emptyState={
                <p className="p-12 text-center text-sm text-muted-foreground">
                  {baseline
                    ? "No cases match this filter."
                    : "Choose a baseline to compare saved results."}
                </p>
              }
            />
          </DataTableProvider>
        </div>
      )}
    </div>
  );
}
