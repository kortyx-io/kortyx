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
  const overview = state ?? header ?? root;
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
      find("[data-page-help-state] p"),
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
          : "Search and filters narrow the records shown here. Columns changes the visible fields; Views saves a useful table layout and filter selection. An empty filtered list does not mean the project has no data.",
        find("[data-table-controls]", '[data-tour-surface="workflow-toolbar"]'),
      );
    if (guide.kind === "list")
      add(
        "records",
        "Inspect a record",
        guide.content,
        find("[data-row-key] > td:first-child"),
      );
    const content = find(
      '[data-detail-tab-content][aria-hidden="false"]',
      '[data-tour-surface="eval-case-evidence"]',
      '[data-tour-surface="suite-definition"]',
      "[data-prompt-content-version]",
      '[data-page-help="prompt-content"]',
      '[data-page-help="diagnostic-content"]',
      ...(guide.kind === "detail" ? ["[data-row-key] > td:first-child"] : []),
    );
    const tab =
      content?.dataset.detailTabContent ?? url.searchParams.get("tab") ?? "";
    const tabHelp = DETAIL_TAB_HELP[id];
    const tabCopy =
      tabHelp && Object.hasOwn(tabHelp, tab) ? tabHelp[tab] : guide.content;
    add("content", "Read the selected view", tabCopy ?? guide.content, content);
    if (guide.kind === "workflows") {
      add(
        "navigation",
        "Choose a workflow",
        "The catalog lists workflows and their observed health. Select one to inspect its structure and available evidence. Selection does not execute the workflow.",
        find('[aria-label="Workflow catalog"]'),
      );
      add(
        "content",
        "Follow structure and activity",
        guide.content,
        find('[data-page-help="workflow-map"]'),
      );
    }
    if (guide.kind === "settings") {
      const section =
        root.querySelector<HTMLElement>("[data-settings-section]")?.dataset
          .settingsSection ??
        path.split("/").at(-1) ??
        "";
      add(
        "navigation",
        "Find a setting",
        "The section list groups the settings available to you. This guide stays in the section you selected and does not change any values.",
        find('[aria-label="Settings sections"]'),
      );
      add(
        "content",
        "Review this section",
        Object.hasOwn(SETTINGS_HELP, section)
          ? (SETTINGS_HELP[section] ?? guide.content)
          : guide.content,
        find("[data-settings-card]"),
      );
    }
    if (guide.kind === "setup")
      add(
        "content",
        "Connect and verify",
        guide.content,
        find("ol", "section"),
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
  };
}
