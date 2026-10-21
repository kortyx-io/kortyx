"use client";
import { createEvalIssue, type EvalStepResult } from "@kortyx/agent/evals";
import { ArrowUpRight, MessageSquare, Reply } from "lucide-react";
import { parseAsInteger } from "nuqs";
import type { ReactNode } from "react";
import { DetailLink } from "@/components/detail/detail-link";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { useStudioQueryState } from "@/lib/nuqs";
import { studioHelp } from "@/lib/studio-help";
import { sumCaseCosts } from "../lib/cost";
import type { CaseRow } from "../lib/presentation";
import { EvalConversationStats } from "./eval-conversation-stats";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalFailure } from "./eval-failure";
import { EvalMessage } from "./eval-message";
import { EvalPayloadViewer } from "./eval-payload-viewer";
import { EvalStatus } from "./eval-status";
import { EvalStepAssessment } from "./eval-step-assessment";
import { EvalStepNavigation } from "./eval-step-navigation";

function PayloadSection({
  label,
  value,
  scope,
}: {
  label: string;
  value: unknown;
  scope: string;
}) {
  return (
    <EvalDisclosure scope={scope} label={label}>
      <EvalPayloadViewer scope={scope} value={value} />
    </EvalDisclosure>
  );
}
export function EvalStepTranscript({
  step,
  scope,
  environment,
  actions,
}: {
  step: EvalStepResult;
  scope: string;
  environment?: string;
  actions?: ReactNode;
}) {
  const interrupt = step.observation.interrupt;
  return (
    <section
      data-guide-focus="eval-conversation"
      className="flex min-w-0 flex-col gap-4"
    >
      <p className="text-xs font-medium text-muted-foreground">
        Step {step.index + 1} conversation
      </p>
      {step.observation.failure || step.observation.diagnosticId ? (
        <EvalFailure
          issue={{
            code: step.observation.failure?.code ?? "EXECUTION_FAILED",
            message:
              step.observation.failure?.message ??
              step.reason ??
              "Agent execution failed.",
            ...(step.observation.failure
              ? { failure: step.observation.failure }
              : {}),
            ...(step.observation.diagnosticId
              ? { diagnosticId: step.observation.diagnosticId }
              : {}),
          }}
          environment={environment}
          scope={`${scope}-execution-error`}
        />
      ) : null}
      {step.observation.events?.map((event, index) => {
        if (
          !event ||
          typeof event !== "object" ||
          Array.isArray(event) ||
          !("type" in event) ||
          event.type !== "tool-call-error"
        )
          return null;
        const issue = createEvalIssue(
          "execute",
          "failure" in event ? event.failure : undefined,
          {
            ...("diagnosticId" in event &&
            typeof event.diagnosticId === "string"
              ? { diagnosticId: event.diagnosticId }
              : {}),
          },
        );
        return (
          <EvalFailure
            key={index}
            issue={issue}
            environment={environment}
            scope={`${scope}-tool-error-${index}`}
          />
        );
      })}
      <div className="rounded-lg border-l-2 border-info/30 bg-info/5 p-3">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {"message" in step.input ? (
            <>
              <MessageSquare className="size-3.5" aria-hidden="true" />
              User message
            </>
          ) : (
            <>
              <Reply className="size-3.5" aria-hidden="true" />
              Test responder
            </>
          )}
        </p>
        {"message" in step.input ? (
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
            {step.input.message}
          </p>
        ) : (
          <EvalPayloadViewer
            scope={`${scope}-resume`}
            value={step.input.resume}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-muted/20 p-3">
        <p className="text-xs font-medium text-muted-foreground">
          {interrupt ? "Agent requested input" : "Agent answer"}
        </p>
        {step.observation.text ? (
          <>
            <EvalMessage text={step.observation.text} />
            <PayloadSection
              scope={`${scope}-answer`}
              label="Response data"
              value={step.observation.text}
            />
          </>
        ) : null}
        {interrupt ? (
          <>
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm font-medium">
              {interrupt.question ?? "Structured input requested"}
            </p>
            <p className="break-words font-mono text-[11px] text-muted-foreground">
              {interrupt.schemaId ?? interrupt.kind}
            </p>
            {interrupt.options.length ? (
              <ul className="space-y-2">
                {interrupt.options.map((option) => (
                  <li
                    key={option.id}
                    className="rounded-md border bg-muted/10 px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
                      {option.label}
                    </p>
                    {option.description ? (
                      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {interrupt.request !== undefined ? (
              <EvalPayloadViewer
                scope={`${scope}-request`}
                value={interrupt.request}
              />
            ) : null}
            <PayloadSection
              scope={`${scope}-interrupt`}
              label="Interrupt details"
              value={interrupt}
            />
          </>
        ) : null}
        {!step.observation.text && !interrupt ? (
          <p className="text-xs text-muted-foreground">
            {step.observation.type === "answer"
              ? "No text answer was recorded."
              : `Execution ${step.observation.type}.`}
          </p>
        ) : null}
        {step.observation.structured.length ? (
          <PayloadSection
            scope={`${scope}-structured`}
            label="Structured output"
            value={step.observation.structured}
          />
        ) : null}
      </div>
      <div
        className="flex flex-wrap items-center gap-2"
        data-eval-inspection-actions
      >
        {step.observation.runId ? (
          <Button variant="outline" size="sm" asChild>
            <DetailLink
              href={`/runs/${encodeURIComponent(step.observation.runId)}`}
            >
              Inspect workflow
              <ArrowUpRight aria-hidden="true" />
            </DetailLink>
          </Button>
        ) : null}
        {actions}
      </div>
      {step.reference !== undefined ? (
        <PayloadSection
          scope={`${scope}-reference`}
          label="Reference facts"
          value={step.reference}
        />
      ) : null}
    </section>
  );
}
export function EvalConversationStep({
  step,
  scope,
  environment,
  verification,
  actions,
}: {
  step: EvalStepResult;
  scope: string;
  environment?: string;
  verification?: CaseRow["verification"];
  actions?: ReactNode;
}) {
  const key = `${scope}-${step.index}`;
  return (
    <div className="min-w-0 space-y-4 border-t border-foreground/15 py-5 first:border-t-0 first:pt-0 last:pb-0">
      <EvalStepAssessment step={step} scope={key} />
      <EvalVerification verification={verification} />
      <EvalStepTranscript
        step={step}
        scope={key}
        environment={environment}
        actions={actions}
      />
    </div>
  );
}
export function EvalVerification({
  verification,
}: {
  verification?: CaseRow["verification"];
}) {
  return verification ? (
    <section
      aria-label="Postcondition verification"
      className="mt-6 space-y-2 rounded-lg border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <h4 className="text-xs font-semibold">Postcondition verification</h4>
          <HelpCircle help={studioHelp.evalPostconditions} />
        </div>
        <EvalStatus status={verification.passed ? "passed" : "failed"} />
      </div>
      <p className="text-xs leading-5 [overflow-wrap:anywhere]">
        {verification.reason}
      </p>
      {verification.evidence.map((text, index) => (
        <blockquote
          key={`${index}:${text}`}
          className="border-l pl-3 text-xs text-muted-foreground [overflow-wrap:anywhere]"
        >
          {text}
        </blockquote>
      ))}
    </section>
  ) : null;
}
export function EvalCaseContent({
  row,
  repetitions = [row],
  judgeInstructions,
}: {
  row: CaseRow;
  repetitions?: CaseRow[];
  judgeInstructions?: ReactNode;
}) {
  const [selection, setSelection] = useStudioQueryState(
    "caseStep",
    parseAsInteger.withOptions({ shallow: true }),
  );
  const focused =
    row.steps.find((step) => step.index === selection) ??
    row.steps.find((step) => ["failed", "error"].includes(step.status)) ??
    row.steps[0];
  const summary = {
    runId: row.key,
    passed: repetitions.filter((item) => item.status === "passed").length,
    total: repetitions.length,
    repetitions: repetitions.map((item) => ({
      repetition: item.repetition,
      status: item.status,
    })),
    costs: sumCaseCosts(repetitions.map((item) => item.costs)),
    durationMs: repetitions.every((item) => item.durationMs !== undefined)
      ? repetitions.reduce((sum, item) => sum + (item.durationMs ?? 0), 0)
      : undefined,
  };
  return (
    <div className="data-table-body-scroll flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-4">
      <EvalConversationStats
        summary={summary}
        row={row}
        loading={false}
        scope={`case-${row.caseId}`}
      />

      <EvalStepNavigation
        steps={row.steps}
        selected={focused?.index ?? 0}
        onSelect={(index) => void setSelection(index)}
      />
      {row.errors.map((issue, index) => (
        <EvalFailure
          key={`${index}:${issue.code}`}
          issue={issue}
          environment={row.environment}
          scope={`${row.key}-issue-${index}`}
        />
      ))}
      {focused ? (
        <EvalConversationStep
          key={focused.index}
          step={focused}
          scope={`${row.key}-${focused.index}`}
          environment={row.environment}
          verification={row.verification}
          actions={judgeInstructions}
        />
      ) : (
        <p className="py-4 text-sm text-muted-foreground">
          {row.status === "retrying"
            ? `${row.httpStatus === 429 || row.httpStatus === 503 ? "Consumer busy." : "Consumer connection interrupted."} Retrying${row.retryAt ? ` at ${new Date(row.retryAt).toISOString().slice(11, 19)} UTC` : " shortly"}.`
            : row.status === "reconnecting"
              ? "Reconnecting to the accepted execution. Captured evidence is retained."
              : row.status === "unknown"
                ? "Execution status is unknown. Inspect the consumer before running this repetition again."
                : row.status === "queued"
                  ? "This repetition has not started."
                  : row.status === "running"
                    ? "Waiting for the first recorded step."
                    : "No conversation steps were recorded."}
        </p>
      )}
      {!focused ? (
        <>
          <EvalVerification verification={row.verification} />
          {judgeInstructions}
        </>
      ) : null}
    </div>
  );
}
