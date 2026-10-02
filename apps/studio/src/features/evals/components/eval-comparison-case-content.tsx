"use client";
import { parseAsInteger } from "nuqs";
import { StatusPill } from "@/components/detail/detail-primitives";
import { DetailTabs } from "@/components/detail/detail-tabs";
import { formatDateTime } from "@/lib/format";
import { useStudioQueryState } from "@/lib/nuqs";
import {
  type CaseRow,
  type ComparisonRow,
  displayName,
} from "../lib/presentation";
import type { EvalDetail } from "../schema";
import { EvalConversationStep } from "./eval-case-inspector";
import { EvalDropdown } from "./eval-dropdown";
import { EvalStatus } from "./eval-status";

function Attempts({
  rows,
  side,
}: {
  rows: CaseRow[];
  side: "baseline" | "candidate";
}) {
  const [attempt, setAttempt] = useStudioQueryState(
    `${side}Attempt`,
    parseAsInteger.withDefault(0).withOptions({ shallow: true }),
  );
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
        <EvalDropdown
          label={`${side === "baseline" ? "Baseline" : "Candidate"} attempt`}
          value={String(attempt)}
          options={rows.map((r, index) => ({
            value: String(index),
            label: `Attempt ${r.repetition}`,
          }))}
          onChange={(value) => {
            void setAttempt(Number(value));
          }}
        />
      </div>
      <div className="min-w-0">
        {row.steps.map((step) => (
          <EvalConversationStep
            key={step.index}
            step={step}
            scope={`${side}-${row.key}`}
          />
        ))}
      </div>
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

export function EvalComparisonCaseContent({
  row,
  baseline,
  candidate,
}: {
  row: ComparisonRow;
  baseline: EvalDetail;
  candidate: EvalDetail;
}) {
  const side = (kind: "baseline" | "candidate") => (
    <section className="min-w-0 space-y-4 py-6 first:pt-0 last:pb-0 @3xl:py-0 @3xl:px-5 @3xl:first:pl-0 @3xl:last:pr-0">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">
          {kind === "baseline" ? "Baseline" : "Candidate"}
        </h3>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(
            (kind === "baseline" ? baseline : candidate).createdAt,
          )}
        </p>
      </div>
      <Attempts
        key={`${kind}:${kind === "baseline" ? baseline.id : candidate.id}:${row.id}`}
        side={kind}
        rows={row[kind]}
      />
    </section>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b px-4 py-3">
        <p
          className="break-all font-mono text-xs text-muted-foreground"
          translate="no"
        >
          {row.id}
        </p>
        <StatusPill
          tone={
            row.change === "improved"
              ? "success"
              : row.change === "regressed"
                ? "danger"
                : "neutral"
          }
        >
          {row.change === "changed"
            ? "Context changed"
            : displayName(row.change)}
        </StatusPill>
        {row.reason ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {row.reason}
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <DetailTabs
          queryKey="comparisonTab"
          tabs={[
            {
              id: "both",
              label: "Both runs",
              content: (
                <div className="@container p-4">
                  <div className="grid min-w-0 divide-y-2 divide-foreground/20 @3xl:grid-cols-2 @3xl:divide-x @3xl:divide-y-0">
                    {side("baseline")}
                    {side("candidate")}
                  </div>
                </div>
              ),
            },
            {
              id: "candidate",
              label: "Candidate",
              content: <div className="p-4">{side("candidate")}</div>,
            },
            {
              id: "baseline",
              label: "Baseline",
              content: <div className="p-4">{side("baseline")}</div>,
            },
          ]}
        />
      </div>
    </div>
  );
}
