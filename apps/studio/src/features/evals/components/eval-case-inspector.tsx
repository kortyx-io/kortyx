"use client";
import type { EvalStepResult } from "@kortyx/agent/evals";
import { ArrowUpRight, ChevronDown, MessageSquare, Reply } from "lucide-react";
import Link from "next/link";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { PayloadViewer } from "@/components/detail/payload-viewer";
import { Button } from "@/components/ui/button";
import type { CaseRow } from "../lib/presentation";
import { EvalStatus } from "./eval-status";

function PayloadSection({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="group mt-3 min-w-0">
      <summary className="flex items-center gap-2 text-xs text-muted-foreground">
        <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
        {label}
      </summary>
      <div className="mt-2">
        <PayloadViewer value={value} defaultClean={false} />
      </div>
    </details>
  );
}
export function EvalConversationStep({ step }: { step: EvalStepResult }) {
  const interrupt = step.observation.interrupt;
  return (
    <section className="min-w-0 space-y-3 border-b pb-5 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Step {step.index + 1}
        </span>
        <EvalStatus status={step.status} />
      </div>
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {"message" in step.input ? (
            <>
              <MessageSquare className="size-3.5" />
              User message
            </>
          ) : (
            <>
              <Reply className="size-3.5" />
              Test responder
            </>
          )}
        </p>
        {"message" in step.input ? (
          <p className="whitespace-pre-wrap break-words text-sm">
            {step.input.message}
          </p>
        ) : (
          <PayloadViewer value={step.input.resume} defaultClean={false} />
        )}
      </div>
      <div className="min-w-0 rounded-lg border p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {interrupt ? "Agent requested input" : "Agent answer"}
        </p>
        {step.observation.text ? (
          <PayloadViewer value={step.observation.text} defaultMode="markdown" />
        ) : null}
        {interrupt ? (
          <div className="min-w-0 space-y-3">
            <p className="break-words text-sm font-medium">
              {interrupt.question ?? "Structured input requested"}
            </p>
            <p className="break-words font-mono text-[11px] text-muted-foreground">
              {interrupt.schemaId
                ? `${interrupt.schemaId}${interrupt.schemaVersion ? ` v${interrupt.schemaVersion}` : ""}`
                : interrupt.kind}
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
              <PayloadViewer value={interrupt.request} defaultClean={false} />
            ) : null}
            <PayloadSection label="Interrupt details" value={interrupt} />
          </div>
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
            label="Structured output"
            value={step.observation.structured}
          />
        ) : null}
      </div>
      <div className="min-w-0 space-y-3">
        <p className="text-xs font-medium">Evaluation</p>
        <p className="text-xs text-muted-foreground">
          Expected {step.expectation.type} · Observed {step.observation.type}
        </p>
        {step.reason ? (
          <p className="break-words text-xs text-red-700 dark:text-red-400">
            {step.reason}
          </p>
        ) : null}
        {step.criteria.map((criterion) => (
          <div key={criterion.id} className="min-w-0 border-l-2 pl-3">
            <div className="flex flex-wrap items-start gap-2">
              <EvalStatus status={criterion.passed ? "passed" : "failed"} />
              <p className="min-w-0 flex-1 break-words text-xs font-medium">
                {criterion.text}
              </p>
            </div>
            <p className="mt-2 break-words text-xs leading-relaxed">
              {criterion.reason}
            </p>
            {criterion.evidence.length ? (
              <details className="group mt-3">
                <summary className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                  Supporting evidence ({criterion.evidence.length})
                </summary>
                {criterion.evidence.map((text, index) => (
                  <blockquote
                    key={`${index}:${text}`}
                    className="mt-2 break-words border-l pl-3 text-xs text-muted-foreground"
                  >
                    {text}
                  </blockquote>
                ))}
              </details>
            ) : null}
          </div>
        ))}
        {step.reference !== undefined ? (
          <PayloadSection label="Reference facts" value={step.reference} />
        ) : null}
      </div>
      {step.observation.runId ? (
        <Button variant="outline" size="xs" asChild>
          <Link href={`/runs/${encodeURIComponent(step.observation.runId)}`}>
            Inspect workflow
            <ArrowUpRight />
          </Link>
        </Button>
      ) : null}
    </section>
  );
}
export function EvalCaseInspector({
  row,
  onClose,
}: {
  row: CaseRow | null;
  onClose: () => void;
}) {
  return (
    <DetailInspectorDrawer
      open={Boolean(row)}
      onClose={onClose}
      title={row?.name ?? "Conversation"}
      description={`Attempt ${row?.repetition ?? 1} · Conversation and grading evidence`}
      badges={row ? <EvalStatus status={row.status} /> : null}
      closeLabel="Close case inspector"
      bodyClassName="p-4 space-y-5"
    >
      {row?.steps.map((step) => (
        <EvalConversationStep key={step.index} step={step} />
      ))}
      {row && !row.steps.length ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {row.status === "queued"
            ? "This attempt has not started."
            : row.status === "running"
              ? "Waiting for the first recorded step."
              : "No conversation steps were recorded."}
        </p>
      ) : null}
      {row?.errors.map((issue, index) => (
        <p
          role="alert"
          key={`${index}:${issue.code}`}
          className="break-words rounded-md border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400"
        >
          {issue.phase}: {issue.message}
        </p>
      ))}
    </DetailInspectorDrawer>
  );
}
