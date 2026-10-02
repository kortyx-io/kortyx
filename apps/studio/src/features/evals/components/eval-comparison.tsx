"use client";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  DataTable,
  type DataTableColumn,
  DataTableColumnsMenu,
  DataTableProvider,
} from "@/components/data-table";
import { DetailHeader, Metric } from "@/components/detail/detail-primitives";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import {
  type CaseRow,
  type ComparisonRow,
  compareRuns,
  displayName,
  passLabel,
} from "../lib/presentation";
import type { EvalDetail, EvalHistory } from "../schema";
import { EvalConversationStep } from "./eval-case-inspector";
import { EvalStatus } from "./eval-status";

function Attempts({ rows }: { rows: CaseRow[] }) {
  const [attempt, setAttempt] = useState(0);
  const row = rows[attempt] ?? rows[0];
  if (!row)
    return (
      <p className="p-5 text-sm text-muted-foreground">
        This case was not run.
      </p>
    );
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EvalStatus status={row.status} />
        <Select
          value={String(attempt)}
          onValueChange={(value) => setAttempt(Number(value))}
        >
          <SelectTrigger aria-label="Comparison attempt" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rows.map((r, index) => (
              <SelectItem key={r.key} value={String(index)}>
                Attempt {r.repetition}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {row.steps.map((step) => (
        <EvalConversationStep key={step.index} step={step} />
      ))}
      {row.errors.map((error, index) => (
        <p
          key={`${index}:${error.code}`}
          className="break-words text-xs text-red-700 dark:text-red-400"
        >
          {error.phase}: {error.message}
        </p>
      ))}
    </div>
  );
}
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
  baselineId: string;
  onBaselineChange: (id: string) => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const rows = baseline ? compareRuns(baseline, candidate) : [];
  const selectedRow = rows.find((r) => r.id === selected);
  const choices = history.runs.filter((r) => r.id !== candidate.id);
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
          onClick={() => setSelected(r.id)}
        >
          <span className="truncate">{r.name}</span>
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
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            if (selected) setSelected(null);
            else onBack();
          }}
        >
          <ArrowLeft />
          {selected ? "Comparison results" : "Candidate run"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Saved run comparison
        </span>
      </div>
      <DetailHeader
        eyebrow="Compare eval runs"
        title={candidate.suite.name ?? displayName(candidate.suiteId)}
        status={<EvalStatus status={candidate.status} />}
        description={`Candidate: ${candidate.targetName} · ${formatDateTime(candidate.createdAt)}`}
        metrics={
          baseline ? (
            <>
              <Metric
                label="Improved"
                value={rows.filter((r) => r.change === "improved").length}
              />
              <Metric
                label="Regressed"
                value={rows.filter((r) => r.change === "regressed").length}
              />
              <Metric
                label="Unchanged"
                value={rows.filter((r) => r.change === "unchanged").length}
              />
              <Metric
                label="Not comparable"
                value={
                  rows.filter((r) =>
                    ["changed", "incomplete"].includes(r.change),
                  ).length
                }
              />
            </>
          ) : undefined
        }
      />
      <div className="shrink-0 space-y-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="eval-baseline" className="text-xs font-medium">
            Baseline
          </label>
          <Select
            value={baselineId}
            onValueChange={(id) => {
              setSelected(null);
              onBaselineChange(id);
            }}
          >
            <SelectTrigger id="eval-baseline" className="h-8 w-full max-w-md">
              <SelectValue placeholder="Choose a saved run" />
            </SelectTrigger>
            <SelectContent>
              {choices.map((run) => (
                <SelectItem key={run.id} value={run.id}>
                  {run.suiteName ?? displayName(run.suiteId)} ·{" "}
                  {formatDateTime(run.createdAt)} · {run.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Exploratory comparison: actor, data snapshot, and prompt versions were
          not recorded.
        </p>
        <details className="text-xs text-muted-foreground">
          <summary className="flex items-center gap-1">
            <ChevronDown className="size-3" />
            Comparison context
          </summary>
          <p className="mt-2 leading-relaxed">
            Changes reflect recorded pass rates. Actor identity, a fixed data
            snapshot, and application prompt versions were not recorded for
            these runs, so this comparison cannot attribute a difference to a
            prompt change. Cases with different inputs, reference facts,
            definitions, or graders show no score delta.
          </p>
          {baseline ? (
            <p className="mt-2 break-words">
              Suite revisions: {baseline.suiteRevision.slice(0, 12)} →{" "}
              {candidate.suiteRevision.slice(0, 12)}. Graders:{" "}
              {baseline.result?.judge?.version ?? "Not recorded"} →{" "}
              {candidate.result?.judge?.version ?? "Not recorded"}.
            </p>
          ) : null}
        </details>
      </div>
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
      ) : selectedRow ? (
        <div className="@container min-h-0 flex-1 overflow-auto p-4">
          <h3 className="mb-2 text-sm font-semibold">{selectedRow.name}</h3>
          {selectedRow.reason ? (
            <p className="mb-4 text-xs text-muted-foreground">
              {selectedRow.reason}
            </p>
          ) : null}
          <div className="grid min-w-0 gap-6 @3xl:grid-cols-2">
            <section className="min-w-0">
              <h4 className="mb-3 text-xs font-semibold">
                Baseline · {baseline ? formatDateTime(baseline.createdAt) : ""}
              </h4>
              <Attempts
                key={`a:${baselineId}:${selectedRow.id}`}
                rows={selectedRow.baseline}
              />
            </section>
            <section className="min-w-0">
              <h4 className="mb-3 text-xs font-semibold">
                Candidate · {formatDateTime(candidate.createdAt)}
              </h4>
              <Attempts
                key={`b:${candidate.id}:${selectedRow.id}`}
                rows={selectedRow.candidate}
              />
            </section>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <DataTableProvider columns={columns}>
            <DataTable
              className="rounded-none border-0 shadow-none"
              data={rows.filter((r) => filter === "all" || r.change === filter)}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setSelected(r.id)}
              header={
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                  <div className="flex flex-wrap gap-1">
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
