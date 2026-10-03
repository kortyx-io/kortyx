"use client";
import type { EvalStepResult } from "@kortyx/agent/evals";
import { ArrowUpRight, MessageSquare, Reply } from "lucide-react";
import { DetailLink } from "@/components/detail/detail-link";
import { Button } from "@/components/ui/button";
import type { CaseRow } from "../lib/presentation";
import { EvalCostBreakdown } from "./eval-cost";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalOutputRequirements } from "./eval-output-requirements";
import { EvalPayloadViewer } from "./eval-payload-viewer";
import { EvalStatus } from "./eval-status";

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
function StepEvaluation({
  step,
  scope,
}: {
  step: EvalStepResult;
  scope: string;
}) {
  return (
    <section className="min-w-0 space-y-4 border-t border-foreground/15 pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-3 py-2">
        <h4 className="text-sm font-semibold">
          Step {step.index + 1} evaluation
        </h4>
        <EvalStatus status={step.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        Expected {step.expectation.type} · Observed {step.observation.type}
      </p>
      <EvalOutputRequirements outputs={step.expectation.outputs} />
      {step.reason ? (
        <p className="break-words text-xs text-red-700 dark:text-red-400">
          {step.reason}
        </p>
      ) : null}
      {step.criteria.map((criterion, index) => (
        <div
          key={criterion.id}
          className="min-w-0 space-y-3 border-t border-foreground/10 pt-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Pass criterion{step.criteria.length > 1 ? ` ${index + 1}` : ""}
            </p>
            <EvalStatus status={criterion.passed ? "passed" : "failed"} />
          </div>
          <p className="break-words text-sm leading-relaxed text-foreground/80">
            {criterion.text}
          </p>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Assessment
            </p>
            <p className="break-words text-sm leading-relaxed">
              {criterion.reason}
            </p>
          </div>
          {criterion.evidence.length ? (
            <EvalDisclosure
              scope={`${scope}-evidence-${criterion.id}`}
              label={`Supporting evidence (${criterion.evidence.length})`}
            >
              {criterion.evidence.map((text, index) => (
                <blockquote
                  key={`${index}:${text}`}
                  className="mt-2 break-words border-l pl-3 text-xs leading-relaxed text-muted-foreground"
                >
                  {text}
                </blockquote>
              ))}
            </EvalDisclosure>
          ) : null}
        </div>
      ))}
      {step.observation.runId ? (
        <Button variant="outline" size="xs" asChild>
          <DetailLink
            href={`/runs/${encodeURIComponent(step.observation.runId)}`}
          >
            Inspect workflow
            <ArrowUpRight aria-hidden="true" />
          </DetailLink>
        </Button>
      ) : null}
    </section>
  );
}
function StepDebug({ step, scope }: { step: EvalStepResult; scope: string }) {
  const interrupt = step.observation.interrupt;
  return (
    <section className="min-w-0 space-y-4 border-t border-foreground/15 pt-5 first:border-t-0 first:pt-0">
      <p className="text-xs font-medium text-muted-foreground">
        Step {step.index + 1} conversation
      </p>
      <div className="rounded-lg border bg-muted/20 p-3">
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
          <p className="whitespace-pre-wrap break-words text-sm">
            {step.input.message}
          </p>
        ) : (
          <EvalPayloadViewer
            scope={`${scope}-resume`}
            value={step.input.resume}
          />
        )}
      </div>
      <div className="min-w-0 space-y-3 rounded-lg border p-3">
        <p className="text-xs font-medium text-muted-foreground">
          {interrupt ? "Agent requested input" : "Agent answer"}
        </p>
        {step.observation.text ? (
          <EvalPayloadViewer
            scope={`${scope}-answer`}
            value={step.observation.text}
            defaultMode="markdown"
          />
        ) : null}
        {interrupt ? (
          <>
            <p className="break-words text-sm font-medium">
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
                    <p className="break-words text-sm">{option.label}</p>
                    {option.description ? (
                      <p className="break-words text-xs text-muted-foreground">
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
}: {
  step: EvalStepResult;
  scope: string;
}) {
  const key = `${scope}-${step.index}`;
  return (
    <div className="min-w-0 space-y-4 border-t border-foreground/15 py-5 first:border-t-0 first:pt-0 last:pb-0">
      <StepEvaluation step={step} scope={key} />
      <EvalDisclosure scope={`${key}-debug`} label="Conversation and debugging">
        <StepDebug step={step} scope={key} />
      </EvalDisclosure>
    </div>
  );
}
export function EvalCaseContent({ row }: { row: CaseRow }) {
  return (
    <div className="data-table-body-scroll h-full min-h-0 space-y-5 overflow-y-auto p-4">
      <p
        className="break-all font-mono text-xs text-muted-foreground"
        translate="no"
      >
        {row.caseId}
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Attempt {row.repetition}
        </p>
        <EvalStatus status={row.status} />
      </div>
      <EvalCostBreakdown costs={row.costs} />
      {row.steps.map((step) => (
        <StepEvaluation
          key={step.index}
          step={step}
          scope={`${row.key}-${step.index}`}
        />
      ))}
      {row.errors.map((issue, index) => (
        <p
          role="alert"
          key={`${index}:${issue.code}`}
          className="break-words rounded-md border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400"
        >
          {issue.phase}: {issue.message}
        </p>
      ))}
      {row.steps.length ? (
        <EvalDisclosure
          scope={`${row.key}-debug`}
          label="Conversation and debugging"
        >
          {row.steps.map((step) => (
            <StepDebug
              key={step.index}
              step={step}
              scope={`${row.key}-${step.index}`}
            />
          ))}
        </EvalDisclosure>
      ) : (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {row.status === "queued"
            ? "This attempt has not started."
            : row.status === "running"
              ? "Waiting for the first recorded step."
              : "No conversation steps were recorded."}
        </p>
      )}
    </div>
  );
}
