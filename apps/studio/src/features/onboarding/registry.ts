import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";

/** A lesson can only navigate to supported read-only views of known fixtures. */
export type LessonView =
  | { surface: "selector" | "workflows" }
  | { surface: "runs"; failed?: boolean }
  | {
      surface: "run";
      run: keyof typeof sample.runs;
      focus?: "header" | "error" | "trace" | "model-io" | "topology";
    }
  | {
      surface: "session";
      session: keyof typeof sample.sessions;
      tab?: "activity" | "runs";
    }
  | { surface: "interrupt"; tab: "decision" | "timeline" }
  | { surface: "prompt"; version: 1 | 2; compareWith?: 1 | 2 }
  | { surface: "suite" | "evaluation" | "eval-case" | "eval-comparison" }
  | { surface: "diagnostic"; tab: "exception" | "capture" | "context" }
  | {
      surface: "evaluation-progress" | "grading-progress" | "pending-eval-case";
    }
  | { surface: "settings"; section: "appearance" | "sample-project" };

export interface LessonStep {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly view: LessonView;
}
interface Chapter {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly outcome: string;
  readonly duration: string;
  readonly fullTour: boolean;
  readonly steps: readonly [LessonStep, ...LessonStep[]];
}

/** IDs are persistence contracts. Copy changes do not require a version bump. */
export const CHAPTERS = [
  {
    id: "sample-execution",
    version: 1,
    title: "Quick orientation",
    duration: "About 1 minute",
    fullTour: true,
    description: "Find your way from a project to an execution.",
    outcome:
      "You can find a run and read its outcome, duration, tokens, and cost.",
    steps: [
      {
        id: "project-selector",
        view: { surface: "selector" },
        title: "Explore a sample project",
        content:
          "After this guide, choose a project here. Each project keeps its runs, sessions, workflows, prompts, and evaluations together.",
      },
      {
        id: "sample-run",
        view: { surface: "runs" },
        title: "Find an execution",
        content:
          "Each row is one workflow run. This support assistant completed an order lookup. Next opens it so you can see what happened.",
      },
      {
        id: "execution-details",
        view: { surface: "run", run: "success" },
        title: "Understand the execution",
        content:
          "See the outcome, duration, tokens, and cost here. After the tour, explore Trace for workflow steps and Model I/O for recorded requests and responses.",
      },
    ],
  },
  {
    id: "debug-execution",
    version: 1,
    title: "Debug a failed run",
    duration: "About 1 minute",
    fullTour: true,
    description: "Follow a failure from its summary to the model request.",
    outcome:
      "You can locate the failed step and distinguish a provider failure from a completed response.",
    steps: [
      {
        id: "find-failed-run",
        view: { surface: "runs", failed: true },
        title: "Narrow the investigation",
        content:
          "The run list is filtered to failed executions. After this guide, use search, filters, or saved views to narrow your own investigations. Next opens this timeout so you can follow the evidence.",
      },
      {
        id: "failure-summary",
        view: { surface: "run", run: "failure", focus: "error" },
        title: "Start with the failure",
        content:
          "This run failed because a provider request timed out. The latest error explains the outcome; the failed run is retained for investigation.",
      },
      {
        id: "failure-trace",
        view: { surface: "run", run: "failure", focus: "trace" },
        title: "Find the failed step",
        content:
          "Trace opens the failed operation's details. Its error explains what went wrong; the timing and captured input help you investigate. A failure does not imply that every earlier operation failed.",
      },
      {
        id: "failure-model-io",
        view: { surface: "run", run: "failure", focus: "model-io" },
        title: "Inspect the model operation",
        content:
          "Model I/O connects a request with its response or failure. This operation is marked Failed, and no response content was captured. Captured content follows your application's privacy settings.",
      },
    ],
  },
  {
    id: "conversation",
    version: 1,
    title: "Follow a conversation",
    duration: "About 1 minute",
    fullTour: true,
    description: "Connect a session, its runs, and its workflow.",
    outcome:
      "You can follow multiple turns in a session and inspect the workflow behind a run.",
    steps: [
      {
        id: "session-history",
        view: { surface: "session", session: "success", tab: "activity" },
        title: "A session spans several turns",
        content:
          "Two executions belong to this session. The activity timeline groups their outcomes and timing so you can follow related turns together. Next shows the individual runs.",
      },
      {
        id: "session-runs",
        view: { surface: "session", session: "success", tab: "runs" },
        title: "Inspect each run separately",
        content:
          "Each turn has its own execution ID, outcome, path, and duration. Session totals aggregate that history; open a run when you need its individual evidence.",
      },
      {
        id: "workflow-topology",
        view: { surface: "run", run: "success", focus: "topology" },
        title: "Follow the observed calls",
        content:
          "Run topology shows the workflows, nodes, and calls observed in this execution. Trace adds their timing and order. Next shows how workflow calls are represented in the system map.",
      },
      {
        id: "workflow-system",
        view: { surface: "workflows" },
        title: "Read workflow connections",
        content:
          "The map distinguishes child calls from handoffs. A child call returns control to its caller; a handoff transfers control. After the guide, select a workflow or connection to inspect its evidence.",
      },
    ],
  },
  {
    id: "approvals",
    version: 1,
    title: "Understand approvals",
    duration: "About 1 minute",
    fullTour: true,
    description: "Read a human decision and the execution that continued.",
    outcome:
      "You can find an approval request, its recorded response, and the resulting run.",
    steps: [
      {
        id: "approval-decision",
        view: { surface: "interrupt", tab: "decision" },
        title: "Read the recorded decision",
        content:
          "This recorded response approved a $24 credit. The resolver and resolution time identify the decision. Next shows the resolution event; the following step checks the related run.",
      },
      {
        id: "approval-timeline",
        view: { surface: "interrupt", tab: "timeline" },
        title: "Follow the approval lifecycle",
        content:
          "The interrupt.resolved event records the response and its timing. Resolution and successful execution are different facts. Next opens the related run to check its outcome.",
      },
      {
        id: "approval-result",
        view: { surface: "run", run: "approval" },
        title: "Check what happened afterwards",
        content:
          "The related run completed after the recorded approval. In your own app, decisions go through your application's approval interface and resume API. Studio displays the evidence.",
      },
    ],
  },
  {
    id: "prompt-versions",
    version: 1,
    title: "Inspect prompt versions",
    duration: "About 1 minute",
    fullTour: true,
    description: "Read immutable versions and see exactly what changed.",
    outcome:
      "You can inspect a saved prompt and compare two versions without editing or promoting either.",
    steps: [
      {
        id: "prompt-original",
        view: { surface: "prompt", version: 1 },
        title: "Read a saved version",
        content:
          "Version 1 tells the assistant to help with orders. Saved versions keep their content and hash, so investigations can refer to a precise prompt rather than today's draft.",
      },
      {
        id: "prompt-updated",
        view: { surface: "prompt", version: 2 },
        title: "Inspect the updated instruction",
        content:
          "Version 2 adds human approval for credits and qualified delivery estimates. Version 3 is now live. A tag assignment and the prompt's saved content are separate facts.",
      },
      {
        id: "prompt-diff",
        view: { surface: "prompt", version: 2, compareWith: 1 },
        title: "Review the actual change",
        content:
          "The comparison highlights the added approval instruction. Compare saved versions to understand how instructions changed over time.",
      },
    ],
  },
  {
    id: "evaluation-results",
    version: 1,
    title: "Read evaluation results",
    duration: "About 2 minutes",
    fullTour: true,
    description: "Connect a suite, its grading evidence, and a saved baseline.",
    outcome:
      "You can inspect a case's criteria and compare saved results without launching an evaluation.",
    steps: [
      {
        id: "suite-definition",
        view: { surface: "suite" },
        title: "Start with the expectation",
        content:
          "This suite defines three conversations about shipment status, delivery estimates, and delivery notes. A suite describes the test; it is not itself proof that a run passed.",
      },
      {
        id: "evaluation-summary",
        view: { surface: "evaluation" },
        title: "Read the saved result",
        content:
          "This suite run passed all three conversations. Counts summarize the attempts in this run; open a case to inspect its evidence. Finished cases with both assessed passes and failures show Mixed results; errors stay separate. Failed cases in writable projects can be selected for a fresh launch.",
      },
      {
        id: "case-evidence",
        view: { surface: "eval-case" },
        title: "Inspect the grading evidence",
        content:
          "This criterion states the expected delivery information. Its assessment explains why the recorded answer passed. After the guide, expand Conversation and debugging to inspect the input and answer. Deterministic checks, when present, have separate verdicts before model criteria.",
      },
      {
        id: "saved-comparison",
        view: { surface: "eval-comparison" },
        title: "Compare with a baseline",
        content:
          "The baseline answer omitted the delivery status and failed the criterion. The candidate passed the same criterion. After the guide, choose Both runs to compare their saved evidence side by side.",
      },
    ],
  },
  {
    id: "error-diagnostics",
    version: 1,
    title: "Investigate an error diagnostic",
    duration: "About 1 minute",
    fullTour: false,
    description:
      "Trace an exception to its cause and check capture completeness.",
    outcome:
      "You can distinguish an execution failure from incomplete diagnostic delivery and locate its execution context.",
    steps: [
      {
        id: "diagnostic-exception",
        view: { surface: "diagnostic", tab: "exception" },
        title: "Follow the cause",
        content:
          "The captured cause is ToolBudgetExceeded: a tool call exceeded its allowance. The outer exception is ExecutionLimitReached. After this guide, inspect the stack and captured fields to follow the failure chain.",
      },
      {
        id: "diagnostic-capture",
        view: { surface: "diagnostic", tab: "capture" },
        title: "Check the evidence is complete",
        content:
          "Available means all parts were delivered; Complete describes capture integrity. Neither means the execution succeeded. After the guide, review Omitted data and Credential redactions before interpreting missing evidence.",
      },
      {
        id: "diagnostic-context",
        view: { surface: "diagnostic", tab: "context" },
        title: "Connect the error to its execution",
        content:
          "This Run identifier links the diagnostic to the execution that failed. After the guide, follow it to inspect the events around the limit. Other captured identifiers in this view correlate workflow and trace context.",
      },
    ],
  },
  {
    id: "evaluation-progress",
    version: 1,
    title: "Understand an evaluation in progress",
    duration: "About 1 minute",
    fullTour: false,
    description:
      "Tell finished execution from pending grading and a final verdict.",
    outcome:
      "You can identify an ungraded case without treating a pending result as a pass or failure.",
    steps: [
      {
        id: "evaluation-progress-summary",
        view: { surface: "evaluation-progress" },
        title: "Separate progress from outcome",
        content:
          "One suite has finished and another is still grading. Five of six case attempts have outcomes. These are partial counts; a running evaluation has no final verdict. This sample preserves that moment rather than running a background job.",
      },
      {
        id: "evaluation-grading",
        view: { surface: "grading-progress" },
        title: "Find the case still grading",
        content:
          "Two conversations have passed; Locate a delivery note is still grading. Completed execution and completed grading are separate milestones. Its missing verdict does not count as a failed or passing case.",
      },
      {
        id: "evaluation-pending-evidence",
        view: { surface: "pending-eval-case" },
        title: "Inspect what is known so far",
        content:
          "The user message and recorded answer are available while grading is pending. A completed answer does not establish a pass. The criterion verdict and reasons remain undecided.",
      },
    ],
  },
  {
    id: "personalize",
    version: 1,
    title: "Personalize Studio",
    duration: "About 1 minute",
    fullTour: false,
    description: "Find appearance and sample-project preferences.",
    outcome:
      "You know where to change appearance and hide or restore the sample project.",
    steps: [
      {
        id: "appearance",
        view: { surface: "settings", section: "appearance" },
        title: "Choose your appearance",
        content:
          "This is your selected appearance. After the guide, choose Light, Dark, or System preference. Appearance changes how Studio looks; it does not change execution behavior.",
      },
      {
        id: "sample-visibility",
        view: { surface: "settings", section: "sample-project" },
        title: "Keep or hide the sample",
        content:
          "Hide the sample project whenever you no longer need it. Restore it from Settings later. Visibility is independent of your saved tour progress; finish or exit the tour before changing it.",
      },
    ],
  },
] as const satisfies readonly Chapter[];

export type ChapterId = (typeof CHAPTERS)[number]["id"];
export type TourMode = "chapter" | "full";
export const FULL_TOUR: readonly ChapterId[] = CHAPTERS.filter(
  (chapter) => chapter.fullTour,
).map((chapter) => chapter.id);
export function chapterById(id: ChapterId) {
  return CHAPTERS.find((chapter) => chapter.id === id) ?? CHAPTERS[0];
}
export function isChapterId(value: unknown): value is ChapterId {
  return CHAPTERS.some((chapter) => chapter.id === value);
}

/** Destination and target stay paired, so changing a tab cannot select a stale panel. */
export function resolveView(view: LessonView): {
  href: string;
  target: string;
} {
  const runRoot = (id: string) => `[data-run-detail-id="${id}"]`;
  switch (view.surface) {
    case "selector":
      return {
        href: "/runs",
        target: `[data-tour-id="${sample.anchors.selector}"]`,
      };
    case "runs":
      return {
        href: view.failed
          ? "/runs?status=failed"
          : `/runs?q=${encodeURIComponent(sample.runs.success)}`,
        target: view.failed
          ? "[data-table-controls]"
          : `[data-row-key="${sample.runs.success}"] [data-column="workflow"]`,
      };
    case "run": {
      const root = runRoot(sample.runs[view.run]);
      const focus = view.focus ?? "header";
      if (focus === "trace" && view.run === "failure")
        return {
          href: `/runs/${sample.runs.failure}?tab=trace&trace=${sample.traceItemIds.failure}`,
          target: `[data-detail-inspector][data-state="open"] [data-trace-item-id="${sample.traceItemIds.failure}"][data-trace-run-id="${sample.runs.failure}"] [data-guide-focus="trace-error"]`,
        };
      return {
        href: `/runs/${sample.runs[view.run]}${focus === "header" || focus === "error" ? "" : `?tab=${focus}`}`,
        target: `${root} ${focus === "header" ? '[data-responsive-surface="detail-header"]' : focus === "error" ? '[data-responsive-surface="run-error-summary"]' : focus === "model-io" ? '[data-guide-focus="model-failure"]' : `[data-detail-tab-content="${focus}"]`}`,
      };
    }
    case "session":
      return {
        href: `/sessions/${sample.sessions[view.session]}${view.tab === "runs" ? "?sessionTab=runs" : ""}`,
        target: `[data-session-detail-id="${sample.sessions[view.session]}"] [data-detail-tab-content="${view.tab ?? "activity"}"]`,
      };
    case "workflows":
      return {
        href: "/workflows",
        target:
          '[data-workflows-ready="true"] [aria-label="Workflow connection legend"]',
      };
    case "interrupt":
      return {
        href: `/interrupts/${sample.interruptId}${view.tab === "timeline" ? "?interruptTab=timeline" : ""}`,
        target: `[data-interrupt-detail-id="${sample.interruptId}"] ${view.tab === "decision" ? '[data-guide-focus="interrupt-response"]' : '[data-interrupt-event="interrupt.resolved"]'}`,
      };
    case "prompt":
      return {
        href: `/prompts/${sample.promptId}?detailView=expanded&v=${view.version}${view.compareWith ? `&compareWith=${view.compareWith}` : ""}`,
        target: view.compareWith
          ? `[data-prompt-comparison="${sample.promptId}:${view.compareWith}:${view.version}"] [data-guide-focus="prompt-diff"]`
          : `[data-prompt-detail-id="${sample.promptId}"] [data-prompt-content-version="${view.version}"] [data-guide-focus="prompt-message"]`,
      };
    case "suite":
      return {
        href: `/evals/suites/${sample.targetId}/${sample.suiteId}`,
        target: `[data-eval-suite-id="${sample.suiteId}"] [data-tour-surface="suite-definition"]`,
      };
    case "evaluation":
      return {
        href: `/evals/runs/${sample.evalRunId}`,
        target: `[data-eval-run-id="${sample.evalRunId}"] [data-tour-surface="eval-summary"]`,
      };
    case "eval-case":
      return {
        href: `/evals/cases/${sample.evalRunId}/${sample.caseId}/1`,
        target:
          '[data-tour-surface="eval-case-evidence"] [data-guide-focus="eval-criterion"]',
      };
    case "eval-comparison":
      return {
        href: `/evals/cases/${sample.evalRunId}/${sample.caseId}/compare?baseline=${sample.baselineEvalRunId}&comparisonTab=baseline&expand.baseline-${sample.caseId}:1-0-debug=true`,
        target:
          '[data-detail-tab-content="baseline"] [data-guide-focus="eval-conversation"]',
      };
    case "diagnostic":
      return {
        href: `/diagnostics/${sample.diagnosticIds.budgetLimit}?env=sample&tab=${view.tab}`,
        target: `[data-diagnostic-id="${sample.diagnosticIds.budgetLimit}"] [data-detail-tab-content="${view.tab}"] [data-guide-focus="${view.tab === "exception" ? "diagnostic-cause" : view.tab === "capture" ? "diagnostic-capture" : "diagnostic-run"}"]`,
      };
    case "evaluation-progress":
      return {
        href: `/evals/evaluations/${sample.evaluationIds.candidate}`,
        target: `[data-evaluation-id="${sample.evaluationIds.candidate}"] [data-tour-surface="eval-summary"]`,
      };
    case "grading-progress":
      return {
        href: `/evals/runs/${sample.candidateEvalRunId}`,
        target: `[data-eval-run-id="${sample.candidateEvalRunId}"] [data-row-key="${sample.gradingCaseId}:1"] [data-column="status"]`,
      };
    case "pending-eval-case":
      return {
        href: `/evals/cases/${sample.candidateEvalRunId}/${sample.gradingCaseId}/1?expand.${sample.gradingCaseId}:1-debug=true`,
        target:
          '[data-tour-surface="eval-case-evidence"] [data-guide-focus="eval-conversation"]',
      };
    case "settings":
      return {
        href: `/settings/${view.section}`,
        target: `[data-settings-section="${view.section}"] ${view.section === "appearance" ? '[data-guide-focus="appearance-option"]' : '[data-settings-card="true"]'}`,
      };
  }
}
