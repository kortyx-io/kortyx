"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import { CircleDashed, MessageSquare, Reply, Workflow } from "lucide-react";
import { StatusPill } from "@/components/detail/detail-primitives";
import { displayName } from "../lib/presentation";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalPayloadViewer } from "./eval-payload-viewer";

type SuiteStep = EvalSuite["cases"][number]["steps"][number];
function ResponseDefinition({
  response,
  scope,
}: {
  response: Extract<SuiteStep, { resume: unknown }>["resume"];
  scope: string;
}) {
  if ("using" in response)
    return (
      <div className="space-y-2">
        <p className="text-sm">
          Use responder{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {response.using}
          </code>
        </p>
        <p className="text-xs text-muted-foreground">
          The application prepares the response when this step runs.
        </p>
        {response.params !== undefined ? (
          <EvalDisclosure
            scope={`${scope}-responder`}
            label="Responder parameters"
          >
            <EvalPayloadViewer
              scope={`${scope}-responder`}
              value={response.params}
            />
          </EvalDisclosure>
        ) : null}
      </div>
    );
  switch (response.type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {response.text || "Empty text response"}
        </p>
      );
    case "select":
      return (
        <div className="space-y-2">
          <p className="text-sm">
            Select {response.ids.length === 1 ? "option" : "options"}
          </p>
          {response.ids.length ? (
            <ul className="flex flex-wrap gap-2">
              {response.ids.map((id, index) => (
                <li
                  key={`${index}:${id}`}
                  className="max-w-full rounded-md border bg-background px-2 py-1 font-mono text-xs break-all"
                >
                  {id}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No options selected.
            </p>
          )}
        </div>
      );
    case "cancel":
      return <p className="text-sm">Cancel the pending interrupt.</p>;
    case "value":
      return (
        <div className="space-y-2">
          <p className="text-sm">Submit a structured response</p>
          <EvalPayloadViewer
            scope={`${scope}-response`}
            value={response.value}
          />
        </div>
      );
  }
}
function StepDefinition({
  step,
  index,
  scope,
}: {
  step: SuiteStep;
  index: number;
  scope: string;
}) {
  const message = "message" in step;
  const Icon = message ? MessageSquare : Reply;
  return (
    <li className="relative min-w-0 pb-5 last:pb-0">
      <span className="absolute -left-3.5 top-0 flex size-7 items-center justify-center rounded-full border bg-background font-mono text-[11px] text-muted-foreground">
        {index + 1}
      </span>
      <div className="min-w-0 space-y-3 pl-7">
        <div className="flex min-h-7 items-center gap-2 text-xs font-medium">
          <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {message ? "User message" : "Respond to human input"}
        </div>
        <div className="grid min-w-0 overflow-hidden rounded-lg border @xl:grid-cols-2">
          <div className="min-w-0 space-y-3 bg-muted/15 p-4">
            {message ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {step.message}
              </p>
            ) : (
              <ResponseDefinition response={step.resume} scope={scope} />
            )}
          </div>
          <div className="min-w-0 space-y-3 border-t p-4 @xl:border-l @xl:border-t-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Expect
              </span>
              <StatusPill
                tone={step.expect.type === "interrupt" ? "warning" : "neutral"}
              >
                {step.expect.type === "interrupt"
                  ? "Human input requested"
                  : "Agent answer"}
              </StatusPill>
            </div>
            {step.expect.schemaId ? (
              <p className="break-words text-xs text-muted-foreground">
                Choice / input component{" "}
                <code className="font-mono text-foreground">
                  {step.expect.schemaId}
                  {step.expect.schemaVersion
                    ? ` · v${step.expect.schemaVersion}`
                    : ""}
                </code>
              </p>
            ) : null}
            {step.expect.criteria?.length ? (
              <div className="space-y-2">
                <p className="text-xs font-medium">Pass criteria</p>
                <ul className="space-y-3">
                  {step.expect.criteria.map((criterion, i) => (
                    <li
                      key={typeof criterion === "string" ? i : criterion.id}
                      className="flex items-start gap-2"
                    >
                      <CircleDashed
                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="min-w-0 whitespace-pre-wrap break-words text-xs leading-relaxed">
                        {typeof criterion === "string"
                          ? criterion
                          : criterion.text}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Checks the expected response type. No additional grading
                criteria.
              </p>
            )}
            {step.expect.reference !== undefined ? (
              <EvalDisclosure
                scope={`${scope}-reference`}
                label="Reference facts"
              >
                <EvalPayloadViewer
                  scope={`${scope}-reference`}
                  value={step.expect.reference}
                />
              </EvalDisclosure>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
export function EvalSuiteDefinition({
  suite,
  scope,
}: {
  suite: EvalSuite;
  scope: string;
}) {
  const stepCount = suite.cases.reduce((total, c) => total + c.steps.length, 0);
  const interruptCount = suite.cases.reduce(
    (total, c) =>
      total + c.steps.filter((step) => step.expect.type === "interrupt").length,
    0,
  );
  return (
    <div className="@container min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Conversation plan</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Inputs, expected behavior, and grading criteria for each
            conversation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill>
            {suite.cases.length}{" "}
            {suite.cases.length === 1 ? "conversation" : "conversations"}
          </StatusPill>
          <StatusPill>
            {stepCount} {stepCount === 1 ? "step" : "steps"}
          </StatusPill>
          {interruptCount ? (
            <StatusPill tone="warning">
              {interruptCount}{" "}
              {interruptCount === 1 ? "human interrupt" : "human interrupts"}
            </StatusPill>
          ) : null}
        </div>
      </div>
      {suite.cases.map((c, index) => (
        <section
          key={c.id}
          aria-label={c.name ?? displayName(c.id)}
          className="min-w-0 overflow-hidden rounded-xl border bg-background"
        >
          <div className="space-y-3 border-b bg-muted/10 px-4 py-4 @lg:px-5">
            <div className="flex items-start gap-3">
              <span className="pt-0.5 font-mono text-[11px] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="break-words text-sm font-semibold">
                  {c.name ?? displayName(c.id)}
                </h4>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    {c.steps.length} {c.steps.length === 1 ? "step" : "steps"}
                  </span>
                  {c.workflowId ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Workflow
                        className="size-3 shrink-0"
                        aria-hidden="true"
                      />
                      <code className="break-all">{c.workflowId}</code>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            {c.params !== undefined ? (
              <EvalDisclosure
                scope={`${scope}-${c.id}-data`}
                label="Test data and setup parameters"
              >
                <EvalPayloadViewer
                  scope={`${scope}-${c.id}-data`}
                  value={c.params}
                />
              </EvalDisclosure>
            ) : null}
          </div>
          <ol className="my-4 mr-4 ml-7 border-l border-border/70 @lg:my-5 @lg:mr-5 @lg:ml-8">
            {c.steps.map((step, i) => (
              <StepDefinition
                key={`${c.id}:${i}`}
                step={step}
                index={i}
                scope={`${scope}-${c.id}-${i}`}
              />
            ))}
          </ol>
        </section>
      ))}
      <div className="border-t pt-5">
        <EvalDisclosure scope={`${scope}-raw`} label="Raw suite definition">
          <EvalPayloadViewer
            scope={`${scope}-raw`}
            value={suite}
            defaultMode="json"
          />
        </EvalDisclosure>
      </div>
    </div>
  );
}
