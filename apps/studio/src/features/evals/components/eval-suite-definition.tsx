"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import { ChevronDown, MessageSquare, Reply, Workflow } from "lucide-react";
import { parseAsBoolean, parseAsInteger } from "nuqs";
import type { ReactNode } from "react";
import { StatusPill } from "@/components/detail/detail-primitives";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useStudioQueryState, useStudioQueryStates } from "@/lib/nuqs";
import { displayName } from "../lib/presentation";
import { EvalAutomaticChecks } from "./eval-automatic-checks";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalOutputRequirements } from "./eval-output-requirements";
import { EvalPayloadViewer } from "./eval-payload-viewer";
import { EvalStepNavigation } from "./eval-step-navigation";

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
  index?: number;
  scope: string;
}) {
  const message = "message" in step;
  const Icon = message ? MessageSquare : Reply;
  return (
    <li
      aria-label={index === undefined ? undefined : `Step ${index + 1}`}
      className="flex min-w-0 flex-col gap-4 py-5 first:pt-0 last:pb-0"
    >
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border-l-2 border-info/30 bg-info/5 p-3">
        <h5 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          {index === undefined ? null : `Step ${index + 1} · `}
          {message ? "User message" : "Response to human input"}
        </h5>
        {message ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
            {step.message || "Empty user message"}
          </p>
        ) : (
          <ResponseDefinition response={step.resume} scope={scope} />
        )}
      </section>
      <section
        aria-label="Expected behavior"
        className="flex min-w-0 flex-col gap-4 rounded-lg border bg-muted/10 p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-sm font-medium">Expected behavior</h5>
          <StatusPill tone="neutral">
            {step.expect.type === "interrupt"
              ? "Human input requested"
              : "Agent answer"}
          </StatusPill>
        </div>
        {step.expect.criteria?.length ? (
          <section
            aria-label="Criteria"
            className="flex min-w-0 flex-col gap-3"
          >
            <h6 className="text-xs font-medium text-muted-foreground">
              {step.expect.criteria.length === 1 ? "Criterion" : "Criteria"}
            </h6>
            <ul className="flex min-w-0 flex-col gap-3">
              {step.expect.criteria.map((criterion, i) => (
                <li
                  key={typeof criterion === "string" ? i : criterion.id}
                  className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]"
                >
                  {typeof criterion === "string" ? criterion : criterion.text}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-xs text-muted-foreground">
            No judge criteria configured.
          </p>
        )}
        {step.expect.checks?.length ||
        step.expect.outputs?.length ||
        step.expect.schemaId ? (
          <>
            <Separator />
            <section
              aria-label="Automatic checks"
              className="flex min-w-0 flex-col gap-3"
            >
              <h6 className="text-xs font-medium text-muted-foreground">
                Automatic checks
              </h6>
              <EvalOutputRequirements outputs={step.expect.outputs} />
              <EvalAutomaticChecks
                checks={step.expect.checks}
                mode="definition"
              />
              {step.expect.schemaId ? (
                <p className="break-words text-xs text-muted-foreground">
                  Human input component{" "}
                  <code className="font-mono text-foreground" translate="no">
                    {step.expect.schemaId}
                    {step.expect.schemaVersion
                      ? ` · v${step.expect.schemaVersion}`
                      : ""}
                  </code>
                </p>
              ) : null}
            </section>
          </>
        ) : null}
      </section>
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
export function ConversationDefinition({
  conversation: c,
  index,
  scope,
  compact = false,
  actions,
}: {
  compact?: boolean;
  actions?: ReactNode;
  conversation: EvalSuite["cases"][number];
  index: number;
  scope: string;
}) {
  const [stepIndex, setStepIndex] = useStudioQueryState(
    "definitionStep",
    parseAsInteger.withOptions({ shallow: true }),
  );
  const selectedStep =
    stepIndex !== null && stepIndex >= 0 && stepIndex < c.steps.length
      ? stepIndex
      : 0;
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
      data-tour-surface="conversation-definition"
      className="flex min-w-0 flex-col gap-5"
    >
      {!compact ? (
        <header className="flex min-w-0 flex-col gap-1">
          <h4 className="text-base font-semibold">
            {String(index + 1).padStart(2, "0")} · {name}
          </h4>
          <p
            className="break-all font-mono text-xs text-muted-foreground"
            translate="no"
          >
            {c.id}
          </p>
        </header>
      ) : null}
      {compact ? (
        <EvalStepNavigation
          steps={c.steps.map((_, index) => ({ index }))}
          selected={selectedStep}
          onSelect={(index) => void setStepIndex(index)}
        />
      ) : null}
      <ol className="min-w-0">
        {c.steps.map((step, i) =>
          !compact || selectedStep === i ? (
            <StepDefinition
              key={`${c.id}:${i}`}
              step={step}
              index={compact ? undefined : i}
              scope={`${scope}-${c.id}-${i}`}
            />
          ) : null,
        )}
      </ol>
      {actions || c.workflowId ? (
        <div className="flex flex-wrap items-center gap-2">
          {c.workflowId ? (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/workflows?workflow=${encodeURIComponent(c.workflowId)}`}
                prefetch={false}
                title={c.workflowId}
              >
                <Workflow />
                View workflow
              </Link>
            </Button>
          ) : null}
          {actions}
        </div>
      ) : null}
      {details.length ? (
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Details for ${name}`}
          aria-expanded={open}
          aria-controls={groupId}
          className="shrink-0"
          onClick={() => {
            void setState({
              ...Object.fromEntries(legacyKeys.map((key) => [key, null])),
              [groupKey]: !open,
            });
          }}
        >
          Test data and reference facts
          <ChevronDown
            aria-hidden="true"
            className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </Button>
      ) : null}
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
