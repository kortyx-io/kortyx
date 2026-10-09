"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import { ChevronDown, MessageSquare, Reply, Workflow } from "lucide-react";
import { parseAsBoolean } from "nuqs";
import { StatusPill } from "@/components/detail/detail-primitives";
import { Button } from "@/components/ui/button";
import { useStudioQueryStates } from "@/lib/nuqs";
import { displayName } from "../lib/presentation";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalOutputRequirements } from "./eval-output-requirements";
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
        <p className="break-words text-sm">
          Use responder{" "}
          <code
            translate="no"
            className="rounded bg-muted px-1.5 py-0.5 text-xs"
          >
            {response.using}
          </code>
        </p>
        <p className="text-xs text-muted-foreground">
          The application prepares the response when this step runs.
        </p>
      </div>
    );
  switch (response.type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed">
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
    <li className="min-w-0 space-y-4 border-t border-foreground/10 py-5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-muted/30 px-3 py-2">
        <h5 className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="font-mono text-xs text-muted-foreground">
            Step {index + 1}
          </span>
          <Icon
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          {message ? "User message" : "Respond to human input"}
        </h5>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Expects</span>
          <StatusPill
            tone={step.expect.type === "interrupt" ? "warning" : "neutral"}
          >
            {step.expect.type === "interrupt"
              ? "Human input requested"
              : "Agent answer"}
          </StatusPill>
        </div>
      </div>
      {message ? (
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed">
          {step.message || "Empty user message"}
        </p>
      ) : (
        <ResponseDefinition response={step.resume} scope={scope} />
      )}
      {step.expect.schemaId ? (
        <p className="break-words text-xs text-muted-foreground">
          Choice / input component{" "}
          <code translate="no" className="font-mono text-foreground">
            {step.expect.schemaId}
            {step.expect.schemaVersion
              ? ` · v${step.expect.schemaVersion}`
              : ""}
          </code>
        </p>
      ) : null}
      <EvalOutputRequirements outputs={step.expect.outputs} />
      {step.expect.criteria?.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Pass criteria
          </p>
          <ul className="list-disc space-y-2 pl-4 marker:text-muted-foreground">
            {step.expect.criteria.map((criterion, i) => (
              <li
                key={typeof criterion === "string" ? i : criterion.id}
                className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-foreground/80"
              >
                {typeof criterion === "string" ? criterion : criterion.text}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {step.expect.outputs?.length
            ? "Checks the response type and required structured outputs. No LLM grading criteria."
            : "Checks the expected response type. No additional grading criteria."}
        </p>
      )}
    </li>
  );
}

type DefinitionDetail = {
  id: string;
  label: string;
  value: unknown;
};
function conversationDetails(
  c: EvalSuite["cases"][number],
  scope: string,
): DefinitionDetail[] {
  const details: DefinitionDetail[] = [];
  if (c.params !== undefined)
    details.push({
      id: `${scope}-${c.id}-data`,
      label: "Test data and setup parameters",
      value: c.params,
    });
  for (const [i, step] of c.steps.entries()) {
    if (step.expect.reference !== undefined)
      details.push({
        id: `${scope}-${c.id}-${i}-reference`,
        label: `Step ${i + 1} reference facts`,
        value: step.expect.reference,
      });
    if (
      "resume" in step &&
      step.resume &&
      "using" in step.resume &&
      step.resume.params !== undefined
    )
      details.push({
        id: `${scope}-${c.id}-${i}-responder`,
        label: `Step ${i + 1} responder parameters`,
        value: step.resume.params,
      });
  }
  return details;
}
function ConversationDefinition({
  conversation: c,
  index,
  scope,
}: {
  conversation: EvalSuite["cases"][number];
  index: number;
  scope: string;
}) {
  const details = conversationDetails(c, scope);
  const groupId = `${scope}-${c.id}-details`;
  const groupKey = `expand.${groupId}`;
  const legacyKeys = details.map((detail) => `expand.${detail.id}`);
  const [state, setState] = useStudioQueryStates(
    Object.fromEntries(
      [groupKey, ...legacyKeys].map((key) => [
        key,
        parseAsBoolean.withDefault(false),
      ]),
    ),
    { shallow: true },
  );
  // Existing links to individual reference facts open the grouped disclosure.
  const open = state[groupKey] || legacyKeys.some((key) => state[key]);
  const name = c.name ?? displayName(c.id);
  return (
    <section
      aria-label={name}
      className="min-w-0 space-y-5 border-t-2 border-foreground/20 pt-5"
    >
      <div className="space-y-2">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h4 className="flex min-w-0 flex-1 items-start gap-2.5 text-base font-semibold leading-snug">
            <span className="shrink-0 pt-0.5 font-mono text-xs font-normal text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 break-words text-pretty">{name}</span>
          </h4>
          {details.length ? (
            <Button
              variant="ghost"
              size="xs"
              aria-label={`Details for ${name}`}
              aria-expanded={open}
              aria-controls={groupId}
              className="shrink-0 text-muted-foreground"
              onClick={() => {
                void setState({
                  ...Object.fromEntries(legacyKeys.map((key) => [key, null])),
                  [groupKey]: !open,
                });
              }}
            >
              Details
              <ChevronDown
                aria-hidden="true"
                className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
              />
            </Button>
          ) : null}
        </div>
        <p
          className="break-all font-mono text-xs text-muted-foreground"
          translate="no"
        >
          {c.id}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {c.steps.length} {c.steps.length === 1 ? "step" : "steps"}
          </span>
          {c.workflowId ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Workflow className="size-3 shrink-0" aria-hidden="true" />
              <code translate="no" className="break-all">
                {c.workflowId}
              </code>
            </span>
          ) : null}
        </div>
      </div>
      <ol className="min-w-0">
        {c.steps.map((step, i) => (
          <StepDefinition
            key={`${c.id}:${i}`}
            step={step}
            index={i}
            scope={`${scope}-${c.id}-${i}`}
          />
        ))}
      </ol>
      {open ? (
        <div
          id={groupId}
          className="min-w-0 space-y-5 border-t border-foreground/10 pt-5"
        >
          {details.map((detail) => (
            <div key={detail.id} className="min-w-0 space-y-2">
              <h5 className="text-xs font-medium text-muted-foreground">
                {detail.label}
              </h5>
              <EvalPayloadViewer scope={detail.id} value={detail.value} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
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
    <div className="min-w-0 space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">Conversation plan</h3>
        <p className="text-xs text-muted-foreground">
          {suite.cases.length}{" "}
          {suite.cases.length === 1 ? "conversation" : "conversations"}
          {" · "}
          {stepCount} {stepCount === 1 ? "step" : "steps"}
          {interruptCount
            ? ` · ${interruptCount} ${interruptCount === 1 ? "human interrupt" : "human interrupts"}`
            : ""}
        </p>
      </div>
      {suite.cases.map((c, index) => (
        <ConversationDefinition
          key={c.id}
          conversation={c}
          index={index}
          scope={scope}
        />
      ))}
      <div className="border-t pt-4">
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
