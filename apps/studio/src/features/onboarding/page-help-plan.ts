import { isSamplePath } from "@/features/sample-project/routing";
import {
  DETAIL_TAB_IDS,
  type DetailTabFamily,
} from "@/lib/detail-tab-contract";
import { studioPathname } from "@/lib/studio-routing";
import {
  DETAIL_TAB_HELP,
  type PageGuideId,
  pageGuide,
  pageGuideId,
  SETTINGS_HELP,
} from "./page-help-registry";
import { isLessonTargetAvailable } from "./targets";

export type PageHelpStepId =
  | "overview"
  | "controls"
  | "records"
  | "tabs"
  | "content"
  | "navigation"
  | "state";
export interface PageHelpStep {
  id: PageHelpStepId;
  title: string;
  content: string;
  target: HTMLElement;
}
export interface PageHelpPlan {
  id: PageGuideId;
  title: string;
  url: string;
  steps: PageHelpStep[];
  example?: string;
  empty: boolean;
  documentationUrl?: string;
}

/** Capture only element references and authored copy. Never read customer content. */
export function createPageHelpPlan(url: URL): PageHelpPlan {
  const path = studioPathname(url.pathname);
  const id = pageGuideId(path);
  const guide = pageGuide(id);
  const drawer = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-detail-drawer][data-state="open"]',
    ),
  ]
    .reverse()
    .find(
      (element) => studioPathname(element.dataset.detailDrawer ?? "") === path,
    );
  const root =
    drawer ??
    document.querySelector<HTMLElement>('[data-studio-page="true"]') ??
    document.body;
  const find = (...selectors: string[]) => {
    for (const selector of selectors) {
      const target = [...root.querySelectorAll<HTMLElement>(selector)].find(
        isLessonTargetAvailable,
      );
      if (target) return target;
    }
    return undefined;
  };
  // Edition contributions supply authored help, never text read from customer data.
  const topic =
    guide.kind === "settings" || guide.kind === "setup"
      ? find("[data-page-help-topic]")
      : undefined;
  let documentationUrl: string | undefined;
  try {
    const candidate = new URL(topic?.dataset.pageHelpDocumentation ?? "");
    if (
      candidate.origin === "https://kortyx.io" &&
      candidate.pathname.startsWith("/docs/") &&
      !candidate.username &&
      !candidate.password
    )
      documentationUrl = candidate.href;
  } catch {
    /* Missing or malformed authored destinations retain shared help. */
  }
  const steps: PageHelpStep[] = [];
  function add(
    id: PageHelpStepId,
    title: string,
    content: string,
    target?: HTMLElement,
  ) {
    if (
      target &&
      isLessonTargetAvailable(target) &&
      !steps.some((step) => step.target === target)
    )
      steps.push({ id, title, content, target });
  }
  const state = find("[data-page-help-state]");
  const header = find(
    '[data-responsive-surface="detail-header"]',
    '[data-tour-surface="eval-summary"]',
    "[data-prompt-header]",
    '[data-page-help="header"]',
    "[data-settings-card] > div:first-child",
    "h1:not(.sr-only)",
  );
  const record = () =>
    find(
      ...[
        ...(id === "interrupts" ? ["request"] : []),
        "name",
        "workflow",
        "session",
        "request",
        "case",
        "suite",
        "target",
      ].map((column) => `[data-row-key] > [data-column="${column}"]`),
      '[data-row-key] > td:not([data-column="selection"]):not([data-column="actions"])',
    );
  // Prefer an authored evidence region over an entire scrolling pane.
  const compact = (element?: HTMLElement) => {
    if (!element) return undefined;
    const specific = [
      ...element.querySelectorAll<HTMLElement>("[data-guide-focus]"),
      ...element.querySelectorAll<HTMLElement>(
        '[data-interrupt-event="interrupt.resolved"], [data-interrupt-event="interrupt.created"]',
      ),
      ...element.querySelectorAll<HTMLElement>(
        '[data-row-key] > [data-column]:not([data-column="selection"]), section, [role=alert], .ProseMirror p',
      ),
    ].find(isLessonTargetAvailable);
    return (
      specific ??
      (element.firstElementChild as HTMLElement | undefined) ??
      element
    );
  };
  const overview = header ?? root;
  if (!state && guide.kind !== "settings")
    add("overview", guide.title, guide.overview, overview);
  if (state) {
    add(
      "state",
      state.dataset.pageHelpState === "error"
        ? "This view could not load"
        : "Waiting for records",
      state.dataset.pageHelpState === "error"
        ? "This view has no loaded evidence to explain yet. Check the connection, permissions, and error shown on the page. Opening a sample example does not repair the connection."
        : "This page is waiting for observations from your application. Follow the setup instructions and refresh after sending telemetry. You can also inspect a read-only sample example.",
      state,
    );
  } else {
    if (guide.kind === "list" || guide.kind === "workflows")
      add(
        "controls",
        guide.kind === "workflows"
          ? "Choose the view and period"
          : "Narrow the view",
        guide.kind === "workflows"
          ? "Choose the time range, version, map, or health view to focus your investigation. Refresh loads the latest available metrics. This guide leaves those choices unchanged."
          : "Search narrows the list. Filters opens scope and field conditions; Match all/any combines them. Numeric and date fields accept minimum and maximum bounds. Columns controls order, visibility, and pins. Views saves filters, search, sorting, and layout. An empty filtered list does not mean the project has no data. " +
              (isSamplePath(url.pathname)
                ? "Sample table choices stay in this browser, separately from real projects."
                : "Authenticated projects refresh saved preferences in the background. Cloud views belong to you in this project; self-hosted views are shared by the project. If Preferences not saved appears, open Views to retry or reload the saved preferences."),
        find("[data-table-controls]", '[data-tour-surface="workflow-toolbar"]'),
      );
    if (guide.kind === "list")
      add("records", "Inspect a record", guide.content, record());
    const content = find(
      '[data-detail-tab-content][aria-hidden="false"]',
      '[data-tour-surface="eval-case-evidence"]',
      '[data-tour-surface="suite-definition"]',
      "[data-prompt-content-version]",
      '[data-page-help="prompt-content"]',
      '[data-page-help="diagnostic-content"]',
      ...(guide.kind === "detail"
        ? ['[data-row-key] > td:not([data-column="selection"])']
        : []),
    );
    const tab =
      content?.dataset.detailTabContent ?? url.searchParams.get("tab") ?? "";
    const tabHelp: Record<string, string> | undefined = Object.hasOwn(
      DETAIL_TAB_IDS,
      id,
    )
      ? DETAIL_TAB_HELP[id as DetailTabFamily]
      : undefined;
    const tabCopy =
      tabHelp && Object.hasOwn(tabHelp, tab) ? tabHelp[tab] : guide.content;
    const titles: Record<string, string> = {
      calls: "Execution",
      overview: "Execution activity",
      trace: "Trace",
      topology: "Run topology",
      "model-io": "Model I/O",
      summary: "Execution summary",
      feedback: "Feedback",
      events: "Recorded events",
      activity: "Activity",
      runs: "Related executions",
      state: "Session state",
      metadata: "Session metadata",
      decision: "Recorded decision",
      timeline: "Lifecycle events",
      payload: "Captured payload",
      cases: "Conversation attempts",
      context: id === "diagnostic" ? "Execution context" : "Configuration",
      definition: "Saved suite definition",
      content: "Saved prompt content",
      evals: "Linked evaluations",
      reviews: "Version reviews",
      exception: "Exception evidence",
      capture: "Capture completeness",
      both: "Baseline and candidate",
      candidate: "Candidate evidence",
      baseline: "Baseline evidence",
    };
    const promptEmpty =
      id === "prompt" &&
      tab !== "content" &&
      (content?.matches('[data-guide-empty="true"]') ||
        content?.querySelector(
          '[data-page-help-records="0"], [data-guide-empty="true"]',
        ));
    if (id === "eval-case-comparison" && tab === "both") {
      add(
        "content",
        "Read the baseline assessment",
        "This is the saved reference run's criterion and assessment. Next shows the candidate's assessment of the same conversation. After the guide, expand Conversation and debugging to inspect each recorded answer.",
        content?.querySelector<HTMLElement>(
          '[data-eval-side="baseline"] [data-guide-focus="eval-criterion"]',
        ) ?? compact(content),
      );
      add(
        "records",
        "Read the candidate assessment",
        "Compare this criterion and assessment with the baseline. Check that expectations and test context match before attributing the difference to an application change.",
        content?.querySelector<HTMLElement>(
          '[data-eval-side="candidate"] [data-guide-focus="eval-criterion"]',
        ) ?? undefined,
      );
    } else
      add(
        "content",
        titles[tab] ?? guide.title,
        promptEmpty
          ? "There are no recorded entries for this version in the selected view. Change the version or filters after closing this guide. Missing records do not establish that the version was never used."
          : (tabCopy ?? guide.content),
        compact(content),
      );
    if (guide.kind === "workflows") {
      add(
        "navigation",
        "Choose a workflow",
        "The catalog lists workflows and their observed health. After the guide, select one to inspect its structure and available evidence. Selection does not execute the workflow.",
        find(
          '[aria-label="Workflow catalog"] [data-guide-focus="workflow-catalog-entry"]',
          '[aria-label="Workflow catalog"] > div:first-child',
        ),
      );
      add(
        "content",
        "Read connection types",
        "The legend distinguishes child calls, which return to their caller, from handoffs, which transfer control. After this guide, select a workflow or connection on the map to inspect its details; zoom in to follow individual nodes.",
        find('[aria-label="Workflow connection legend"]'),
      );
    }
    if (guide.kind === "settings") {
      const section =
        root.querySelector<HTMLElement>("[data-settings-section]")?.dataset
          .settingsSection ??
        path.split("/").at(-1) ??
        "";
      add(
        "content",
        topic?.dataset.pageHelpTitle ??
          {
            "sample-project": "Sample project visibility",
            "api-keys": "Application credentials",
            privacy: "Telemetry & privacy",
            appearance: "Appearance",
            evaluations: "Evaluation defaults",
            about: "Installed version",
            general: "Workspace scope",
            connection: "Server connection",
            access: "Studio access",
          }[section] ??
          "Selected settings",
        topic?.dataset.pageHelpDescription ??
          (Object.hasOwn(SETTINGS_HELP, section)
            ? (SETTINGS_HELP[section] ?? guide.content)
            : guide.content),
        topic
          ? (topic.querySelector<HTMLElement>(":scope > div:first-child") ??
              topic)
          : find(
              '[data-settings-card] [data-guide-focus="appearance-option"]',
              "[data-settings-card]",
            ),
      );
    }
    if (guide.kind === "setup")
      add(
        "content",
        topic?.dataset.pageHelpTitle ?? "Connect and verify",
        topic?.dataset.pageHelpDescription ?? guide.content,
        topic ?? find("ol", "section"),
      );
  }
  const detail = find(
    "[data-run-detail-id]",
    "[data-session-detail-id]",
    "[data-interrupt-detail-id]",
    "[data-prompt-detail-id]",
    "[data-eval-run-id]",
    '[data-tour-surface="suite-definition"]',
    '[data-tour-surface="eval-case-evidence"]',
    '[data-page-help="diagnostic"]',
    '[data-page-help="prompt-group"]',
  );
  const hasRows = [
    ...root.querySelectorAll<HTMLElement>("[data-page-help-records]"),
  ].some((element) => Number(element.dataset.pageHelpRecords) > 0);
  const hasContent =
    !state &&
    (hasRows ||
      Boolean(detail) ||
      (guide.kind === "detail" && Boolean(header)));
  return {
    id,
    title: guide.title,
    url: url.href,
    steps,
    example: guide.example,
    empty: Boolean(guide.example) && !hasContent,
    ...(documentationUrl ? { documentationUrl } : {}),
  };
}
