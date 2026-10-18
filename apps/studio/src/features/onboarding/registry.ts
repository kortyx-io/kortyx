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
          "Choose a project here. Each project keeps its runs, sessions, workflows, prompts, and evaluations together.",
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
          "The run list is filtered to failed executions. Use search, filters, or saved views to narrow your own investigations. Next opens this timeout so you can follow the evidence.",
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
          "Trace orders the recorded execution spans. Expand a step to inspect its timing and captured details. A failure does not imply that every earlier operation failed.",
      },
      {
        id: "failure-model-io",
        view: { surface: "run", run: "failure", focus: "model-io" },
        title: "Inspect the model operation",
        content:
          "Model I/O connects a request with its response or failure. This request timed out before a response was returned. Captured content follows your application's privacy settings.",
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
          "This customer asked about an order, then asked a follow-up question. The activity timeline groups the two runs under one session rather than treating them as unrelated requests.",
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
        title: "Compare structure with execution",
        content:
          "Topology shows the workflow structure behind this run. A declared branch may not have executed: use Trace to confirm which path actually ran.",
      },
      {
        id: "workflow-system",
        view: { surface: "workflows" },
        title: "See the wider workflow",
        content:
          "Workflows combines the published structure with observed activity. The coordinator calls order research and resolution review, then receives their results. Select a workflow or call to inspect its role and evidence.",
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
        title: "Read the requested decision",
        content:
          "The support assistant asked a human to approve a $24 credit. The recorded response is shown beside the request. The request is resolved; follow the timeline to see how execution continued.",
      },
      {
        id: "approval-timeline",
        view: { surface: "interrupt", tab: "timeline" },
        title: "Follow the approval lifecycle",
        content:
          "The timeline separates creation from resolution. A response and a resumed execution are different facts; inspect both when diagnosing a real approval.",
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
          "This suite run passed all three conversations. Counts summarize the attempts in this run; open a case to inspect its evidence.",
      },
      {
        id: "case-evidence",
        view: { surface: "eval-case" },
        title: "Inspect the grading evidence",
        content:
          "The case connects the input, recorded answer, criterion, and grading reason. Check the evidence behind a pass instead of relying only on a green status.",
      },
      {
        id: "saved-comparison",
        view: { surface: "eval-comparison" },
        title: "Compare with a baseline",
        content:
          "The earlier answer omitted the delivery status and failed the same criterion. Compare the saved baseline with the passing candidate to understand the improvement.",
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
          "Appearance controls how Studio looks. The tour only points out this setting; you choose whether to change it.",
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
        href: view.failed ? "/runs?status=failed" : "/runs",
        target: `[data-row-key="${view.failed ? sample.runs.failure : sample.runs.success}"] > td:first-child`,
      };
    case "run": {
      const root = runRoot(sample.runs[view.run]);
      const focus = view.focus ?? "header";
      return {
        href: `/runs/${sample.runs[view.run]}${focus === "header" || focus === "error" ? "" : `?tab=${focus}`}`,
        target: `${root} ${focus === "header" ? '[data-responsive-surface="detail-header"]' : focus === "error" ? '[data-responsive-surface="run-error-summary"]' : `[data-detail-tab-content="${focus}"]`}`,
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
          '[data-workflows-ready="true"] [data-tour-surface="workflow-toolbar"]',
      };
    case "interrupt":
      return {
        href: `/interrupts/${sample.interruptId}${view.tab === "timeline" ? "?interruptTab=timeline" : ""}`,
        target: `[data-interrupt-detail-id="${sample.interruptId}"] [data-detail-tab-content="${view.tab}"]`,
      };
    case "prompt":
      return {
        href: `/prompts/${sample.promptId}?v=${view.version}${view.compareWith ? `&compareWith=${view.compareWith}` : ""}`,
        target: view.compareWith
          ? `[data-prompt-comparison="${sample.promptId}:${view.compareWith}:${view.version}"]`
          : `[data-prompt-detail-id="${sample.promptId}"] [data-prompt-content-version="${view.version}"]`,
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
        target: '[data-tour-surface="eval-case-evidence"]',
      };
    case "eval-comparison":
      return {
        href: `/evals/runs/${sample.evalRunId}/compare?baseline=${sample.baselineEvalRunId}`,
        target:
          '[data-tour-surface="eval-comparison"][data-comparison-ready="true"] [data-tour-surface="eval-summary"]',
      };
    case "settings":
      return {
        href: `/settings/${view.section}`,
        target: `[data-settings-section="${view.section}"] [data-settings-card="true"]`,
      };
  }
}
