"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpCircle, InfoTooltip } from "@/components/ui/info-tooltip";
import { Separator } from "@/components/ui/separator";
import { useLearning } from "@/features/onboarding/provider";
import { formatDateTime } from "@/lib/format";
import { usePathname, useSearchParams } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { evalRequest } from "../api/client";
import { useComparisonQuery } from "../hooks/use-comparison-query";
import { useModalComparison } from "../hooks/use-modal-comparison";
import { closeComparisonQuery } from "../lib/comparison-query";
import {
  type ChangeSide,
  type ConversationChange,
  changeKinds,
  type EvaluationChanges,
  type RunReference,
} from "../lib/evaluation-changes";
import {
  type ComparisonRow,
  caseRows,
  compareRuns,
  displayName,
} from "../lib/presentation";
import { type EvalDetail, EvalDetailSchema } from "../schema";
import { EvalStepTranscript, EvalVerification } from "./eval-case-inspector";
import { EvalConversationStats } from "./eval-conversation-stats";
import { EvalDropdown } from "./eval-dropdown";
import {
  EvalAssessmentSkeleton,
  EvalComparisonEvidenceSkeleton,
  EvalStepSelectorSkeleton,
  EvalTranscriptSkeleton,
} from "./eval-evidence-skeleton";
import { EvalFailure } from "./eval-failure";
import { EvalJudgeInstructionsLink } from "./eval-judge-instructions-link";
import { EvalPayloadViewer } from "./eval-payload-viewer";
import { EvalStepAssessment } from "./eval-step-assessment";
import { EvalStepNavigation } from "./eval-step-navigation";

function useSelectedCase(
  runId: string | undefined,
  caseId: string,
  repetition: number,
) {
  const [value, setValue] = useState<{
    scope?: string;
    run?: EvalDetail;
    error?: string;
  }>({});
  const [retry, setRetry] = useState(0);
  const scope = JSON.stringify([runId, caseId, repetition, retry]);
  useEffect(() => {
    setValue({ scope });
    if (!runId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const { run } = EvalDetailSchema.parse(
          await evalRequest(
            `runs/${encodeURIComponent(runId)}/case?${new URLSearchParams({ caseId, repetition: String(repetition) })}`,
            undefined,
            controller.signal,
          ),
        );
        if (run.id !== runId) throw new Error("Unexpected result");
        if (!controller.signal.aborted) setValue({ scope, run });
      } catch {
        if (!controller.signal.aborted)
          setValue({
            scope,
            error:
              "Could not load this repetition. Retry to inspect its evidence.",
          });
      }
    })();
    return () => controller.abort();
  }, [runId, caseId, repetition, scope]);
  const run = value.scope === scope ? value.run : undefined;
  const row = run
    ? caseRows(run).find(
        (item) => item.caseId === caseId && item.repetition === repetition,
      )
    : undefined;
  return {
    run,
    error: value.scope === scope ? value.error : undefined,
    row,
    retry: () => setRetry((value) => value + 1),
  };
}

function EvidenceSide({
  title,
  reference,
  summary,
  repetition,
  onRepetition,
  evidence,
  focusStep,
  loading,
  change,
  selectedComparison,
  statsScope,
}: {
  title: string;
  reference: RunReference;
  summary: ChangeSide;
  repetition: number;
  onRepetition: (value: number) => void;
  evidence: ReturnType<typeof useSelectedCase>;
  focusStep: number;
  loading: boolean;
  change?: ConversationChange;
  selectedComparison?: ComparisonRow;
  statsScope: string;
}) {
  const { row } = evidence;
  const pathname = usePathname();
  const judge = evidence.run?.result?.judge ?? evidence.run?.request?.judge;
  const focused = row?.steps.find((step) => step.index === focusStep);
  if (!summary.runId || !summary.total)
    return (
      <section
        className="flex min-w-0 flex-col gap-2 md:row-span-5"
        aria-label={`${title} evidence`}
        data-comparison-side={title}
      >
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">
          No result was recorded on this side.
        </p>
      </section>
    );
  return (
    <section
      className="flex min-w-0 flex-col gap-4 md:row-span-5 md:grid md:grid-rows-subgrid"
      aria-label={`${title} evidence`}
      data-comparison-side={title}
    >
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs">{reference.name}</p>
        {summary.repetitions.length ? (
          <EvalDropdown
            disabled={loading}
            label={`${title} repetition`}
            value={String(repetition)}
            options={summary.repetitions.map((item) => ({
              value: String(item.repetition),
              label: `Repetition ${item.repetition} · ${displayName(item.status)}`,
            }))}
            onChange={(value) => onRepetition(Number(value))}
          />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {formatDateTime(reference.createdAt)}
        </p>
      </div>
      <EvalConversationStats
        summary={summary}
        change={change}
        row={row}
        selectedComparison={selectedComparison}
        loading={Boolean(summary.total && !evidence.run && !evidence.error)}
        scope={statsScope}
      />
      <div data-comparison-section="assessment" className="min-w-0">
        {evidence.error ? (
          <div role="alert" className="flex flex-col gap-2 text-sm">
            <p>{evidence.error}</p>
            <Button variant="secondary" size="sm" onClick={evidence.retry}>
              Retry evidence
            </Button>
          </div>
        ) : !evidence.run ? (
          <EvalAssessmentSkeleton />
        ) : !row ? (
          <p role="alert" className="text-xs text-muted-foreground">
            This repetition has no recorded case evidence.
          </p>
        ) : focused ? (
          <EvalStepAssessment
            step={focused}
            scope={`change-${title}-${row?.key}-${focusStep}`}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Step {focusStep + 1} was not recorded in this repetition.
          </p>
        )}
        <EvalVerification verification={row?.verification} />
      </div>
      <div data-comparison-section="conversation" className="min-w-0">
        {focused ? (
          <EvalStepTranscript
            step={focused}
            scope={`change-${title}-${row?.key}-${focusStep}`}
            environment={row?.environment}
            actions={
              evidence.run && row ? (
                <EvalJudgeInstructionsLink
                  source="run"
                  id={evidence.run.id}
                  context={{
                    caseId: row.caseId,
                    repetition: String(row.repetition),
                    judgeReturn: pathname,
                  }}
                />
              ) : null
            }
          />
        ) : !evidence.run && !evidence.error ? (
          <EvalTranscriptSkeleton />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {row?.errors.map((issue, index) => (
          <EvalFailure
            key={`${index}:${issue.code}`}
            issue={issue}
            environment={row.environment}
            scope={`change-${title}-${row.key}-${index}`}
          />
        ))}
        {row && evidence.run ? (
          <details className="min-w-0 border-t pt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Saved context
            </summary>
            <div className="flex min-w-0 flex-col gap-4 pt-4">
              <EvalPayloadViewer
                scope={`change-context-${title}-${row.key}`}
                value={{
                  judge: judge
                    ? {
                        id: judge.id,
                        version: judge.version,
                        location: judge.location,
                      }
                    : undefined,
                  settings: evidence.run.resolvedSettings,
                  prompts: evidence.run.request?.promptSnapshot,
                }}
              />
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function ComparisonEvidence({
  row,
  comparison,
}: {
  row: ConversationChange;
  comparison: EvaluationChanges;
}) {
  const [query, setQuery] = useComparisonQuery();
  const earlier =
    row.earlier.repetitions.find(
      (item) => item.repetition === query.earlierRepetition,
    )?.repetition ??
    row.earlier.repetitions.find(
      (item) =>
        item.status ===
        (row.kind === "improved" || row.kind === "still-failing"
          ? "failed"
          : "passed"),
    )?.repetition ??
    row.earlier.repetitions[0]?.repetition ??
    1;
  const current =
    row.current.repetitions.find(
      (item) => item.repetition === query.currentRepetition,
    )?.repetition ??
    row.current.repetitions.find((item) =>
      row.kind === "improved"
        ? item.status === "passed"
        : ["failed", "error"].includes(item.status),
    )?.repetition ??
    row.current.repetitions[0]?.repetition ??
    1;
  useEffect(() => {
    const invalidEarlier =
      query.earlierRepetition !== null &&
      !row.earlier.repetitions.some(
        (item) => item.repetition === query.earlierRepetition,
      );
    const invalidCurrent =
      query.currentRepetition !== null &&
      !row.current.repetitions.some(
        (item) => item.repetition === query.currentRepetition,
      );
    if (invalidEarlier || invalidCurrent)
      void setQuery(
        {
          ...(invalidEarlier ? { earlierRepetition: null } : {}),
          ...(invalidCurrent ? { currentRepetition: null } : {}),
        },
        { history: "replace" },
      );
  }, [row, query.earlierRepetition, query.currentRepetition, setQuery]);
  const a = useSelectedCase(
    row.earlier.total ? row.earlier.runId : undefined,
    row.caseId,
    earlier,
  );
  const b = useSelectedCase(
    row.current.total ? row.current.runId : undefined,
    row.caseId,
    current,
  );
  const selectedComparison =
    a.run && b.run && a.row && b.row
      ? compareRuns(a.run, b.run, {
          baseline: [a.row],
          candidate: [b.row],
        }).find((item) => item.id === row.caseId)
      : undefined;
  const failure = b.row?.steps.find((step) =>
    ["failed", "error"].includes(step.status),
  );
  const steps = [
    ...new Set(
      [...(a.row?.steps ?? []), ...(b.row?.steps ?? [])].map(
        (step) => step.index,
      ),
    ),
  ].sort((a, b) => a - b);
  const focus = steps.includes(query.changeStep ?? -1)
    ? (query.changeStep ?? 0)
    : (failure?.index ??
      a.row?.steps.find((step) => ["failed", "error"].includes(step.status))
        ?.index ??
      b.row?.steps[0]?.index ??
      a.row?.steps[0]?.index ??
      0);
  const loading = Boolean(
    (row.earlier.total && !a.run && !a.error) ||
      (row.current.total && !b.run && !b.error),
  );
  return (
    <div className="flex min-w-0 flex-col gap-5 p-5">
      {loading && !steps.length ? (
        <EvalStepSelectorSkeleton />
      ) : (
        <EvalStepNavigation
          steps={steps.map((index) => ({ index }))}
          selected={focus}
          onSelect={(index) => void setQuery({ changeStep: index })}
        />
      )}
      <div
        className={`grid min-w-0 grid-cols-1 gap-6 ${comparison.earlier ? "md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]" : ""}`}
      >
        {comparison.earlier ? (
          <EvidenceSide
            loading={loading}
            title="Earlier"
            statsScope="change"
            reference={comparison.earlier}
            summary={row.earlier}
            repetition={earlier}
            onRepetition={(value) =>
              void setQuery({ earlierRepetition: value })
            }
            evidence={a}
            focusStep={focus}
          />
        ) : null}
        {comparison.earlier ? (
          <>
            <Separator
              orientation="vertical"
              className="hidden self-stretch md:row-span-5 md:block"
            />
            <Separator className="md:hidden" />
          </>
        ) : null}
        <EvidenceSide
          loading={loading}
          title="This run"
          statsScope="change"
          reference={comparison.candidate}
          summary={row.current}
          change={row}
          selectedComparison={selectedComparison}
          repetition={current}
          onRepetition={(value) => void setQuery({ currentRepetition: value })}
          evidence={b}
          focusStep={focus}
        />
      </div>
    </div>
  );
}

export function EvalChangeModal({
  comparisons,
  defaultRunId,
  caseKeys,
}: {
  comparisons: Record<string, EvaluationChanges>;
  defaultRunId?: string;
  caseKeys?: string[];
}) {
  const [query, setQuery] = useComparisonQuery();
  const pathname = usePathname();
  const readingInstructions = pathname.startsWith("/evals/judges/");
  const candidateId = query.changeCase
    ? (query.changeRun ?? defaultRunId)
    : undefined;
  const seed = candidateId ? comparisons[candidateId] : undefined;
  const { comparison, error, retry } = useModalComparison(
    candidateId,
    query.changeBaseline,
    seed,
  );
  const source = comparison ?? seed;
  const allRows = comparison?.rows ?? [];
  const ordered = caseKeys
    ? [
        ...new Set(
          [...caseKeys, query.changeCase].filter(
            (key): key is string => key !== null,
          ),
        ),
      ].flatMap((key) => allRows.filter((row) => row.key === key))
    : changeKinds.flatMap(({ kind }) =>
        allRows.filter((row) => row.kind === kind),
      );
  const rows =
    query.changeGroup && query.changeGroup !== "all"
      ? ordered.filter((row) => row.kind === query.changeGroup)
      : ordered;
  const index = rows.findIndex((row) => row.key === query.changeCase);
  const row = rows[index];
  const switching = Boolean(candidateId && !comparison && !error);
  const message =
    error ??
    (comparison && comparison.state !== "ready"
      ? (comparison.message ??
        "This evaluation has no completed comparison available.")
      : undefined);
  const search = useSearchParams();
  const close = () => {
    void setQuery(closeComparisonQuery(search));
  };
  const navigate = (offset: number) => {
    if (index < 0) return;
    const next = rows[index + offset];
    if (!switching && !message && next)
      void setQuery({
        changeCase: next.key,
        earlierRepetition: null,
        currentRepetition: null,
        changeStep: null,
      });
  };
  const explanation =
    row?.reason?.replaceAll("attempt", "repetition") ??
    (row && row.earlier.total !== row.current.total
      ? "Repetition counts differ. Compare pass rate and per-repetition means; total/count indicators are hidden."
      : undefined);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const learning = useLearning();
  return (
    <Dialog
      modal={!learning?.active}
      open={Boolean(candidateId && query.changeCase && !readingInstructions)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        onInteractOutside={(event) => {
          if (learning?.active) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (learning?.active) event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.repeat ||
            learning?.active
          )
            return;
          if (
            (event.target as HTMLElement).closest(
              'input,textarea,select,[contenteditable="true"],[role="menu"],[role="combobox"],[role="tablist"],[role="slider"],[data-slot="dropdown-menu-trigger"],[data-slot="popover-trigger"],[data-slot="popover-content"]',
            )
          )
            return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            navigate(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
        showCloseButton={false}
        data-eval-comparison-modal="true"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        className="flex h-[min(90dvh,900px)] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        onClickCapture={(event) => {
          // Execution links open their existing platform surface after closing this modal.
          const link = (event.target as HTMLElement).closest("a[href]");
          if (link && !link.hasAttribute("data-eval-judge-link")) close();
        }}
      >
        <header
          data-page-help="comparison-context"
          className="flex shrink-0 flex-col gap-3 border-b px-5 py-4"
        >
          <div className="flex min-w-0 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {row?.suiteName}
              </span>
              <HelpCircle help={studioHelp.evalComparison} />
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Close dialog">
                <X />
              </Button>
            </DialogClose>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="flex min-w-0 flex-col gap-2">
              <DialogTitle
                ref={titleRef}
                tabIndex={-1}
                className="flex min-h-8 items-center text-base font-semibold outline-none"
              >
                {row?.name ?? "Conversation comparison"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {row && !switching ? (
                  <>
                    {explanation ? (
                      <InfoTooltip
                        label="Comparison context"
                        trigger={
                          <button
                            type="button"
                            className="underline decoration-dotted underline-offset-4"
                          >
                            {row.label}
                          </button>
                        }
                        documentationUrl={
                          studioHelp.evalComparison.documentationUrl
                        }
                      >
                        <p>{explanation}</p>
                      </InfoTooltip>
                    ) : (
                      row.label
                    )}
                    {` · ${row.earlier.total ? `${row.earlier.passed}/${row.earlier.total} passed` : "No earlier result"} → ${row.current.total ? `${row.current.passed}/${row.current.total} passed` : "Not run this time"}`}
                  </>
                ) : (
                  "Saved conversation evidence"
                )}
              </DialogDescription>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-2 md:items-end md:text-right">
              <EvalDropdown
                label="Comparison baseline"
                triggerLabel="Comparison baseline"
                contentClassName="w-[28rem]"
                value={query.changeBaseline ?? source?.earlier?.id ?? ""}
                options={(source?.choices ?? []).map((run) => ({
                  value: run.id,
                  label: run.name,
                  description: formatDateTime(run.createdAt),
                }))}
                disabled={!source?.choices.length}
                onChange={(id) => {
                  void setQuery({
                    changeBaseline: id,
                    changeGroup: null,
                    changeStep: null,
                    earlierRepetition: null,
                  });
                }}
              />
              <span className="min-w-0 text-xs text-muted-foreground">
                {query.changeBaseline
                  ? (source?.choices.find(
                      (run) => run.id === query.changeBaseline,
                    )?.name ?? source?.earlier?.name)
                  : source?.earlier?.name}
              </span>
            </div>
          </div>
        </header>
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          data-tour-surface="eval-change-modal"
        >
          {message ? (
            <Alert className="m-5 w-auto" variant="destructive">
              <AlertDescription>
                <p>{message}</p>
                <Button size="sm" variant="secondary" onClick={retry}>
                  Retry comparison
                </Button>
              </AlertDescription>
            </Alert>
          ) : switching ? (
            <EvalComparisonEvidenceSkeleton />
          ) : row && comparison ? (
            <ComparisonEvidence
              key={`${comparison?.candidate.id}:${comparison?.earlier?.id}:${row.key}`}
              row={row}
              comparison={comparison}
            />
          ) : comparison ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 p-5 text-sm"
            >
              <p>
                This conversation is not available in the selected comparison.
              </p>
              {rows[0] ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void setQuery({
                      changeCase: rows[0].key,
                      changeStep: null,
                      earlierRepetition: null,
                      currentRepetition: null,
                    })
                  }
                >
                  First conversation
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <footer
          data-page-help="comparison-navigation"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-3"
        >
          <Button
            variant="secondary"
            size="sm"
            disabled={switching || Boolean(message) || index <= 0}
            aria-keyshortcuts="ArrowLeft"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {row ? `${index + 1} of ${rows.length}` : ""}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={
              switching ||
              Boolean(message) ||
              index < 0 ||
              index >= rows.length - 1
            }
            aria-keyshortcuts="ArrowRight"
            onClick={() => navigate(1)}
          >
            Next
            <ChevronRight />
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
