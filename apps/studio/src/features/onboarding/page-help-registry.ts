import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";

type PageKind =
  | "list"
  | "detail"
  | "workflows"
  | "settings"
  | "setup"
  | "other";
interface PageGuide {
  title: string;
  overview: string;
  content: string;
  kind: PageKind;
  example?: string;
}

/** Page identities and copy are independent of sample lesson/progress identities. */
export const PAGE_GUIDES = {
  runs: {
    title: "Runs",
    kind: "list",
    overview:
      "Runs is the inbox for workflow executions. Each row has its own outcome, timing, usage, and session. A failed run and a failed evaluation are different outcomes.",
    content:
      "Open a run to inspect its execution, trace, model requests, and recorded events. Session links connect related turns; child executions show delegated work.",
    example: "/runs",
  },
  run: {
    title: "Run details",
    kind: "detail",
    overview:
      "This is the execution you opened. The header identifies its outcome, workflow, environment, duration, usage, and cost. Missing evidence is shown as unavailable rather than inferred.",
    content:
      "Inspect the evidence for this execution in the selected tab. Error diagnostics provide exception details when captured. Session and child-workflow links connect related activity.",
    example: `/runs/${sample.runs.success}`,
  },
  sessions: {
    title: "Sessions",
    kind: "list",
    overview:
      "Sessions group related workflow runs, such as multiple turns in a conversation. Totals describe the session history; each run still has its own outcome.",
    content:
      "Open a session to follow its activity and individual runs. Use a stable session ID in your application to connect related turns.",
    example: "/sessions",
  },
  session: {
    title: "Session details",
    kind: "detail",
    overview:
      "This session groups the recorded activity for related turns. Its totals aggregate multiple runs and do not replace each run's individual result.",
    content:
      "Activity follows the conversation over time. Runs lists individual execution IDs, outcomes, durations, and paths. Open a run for its detailed evidence.",
    example: `/sessions/${sample.sessions.success}`,
  },
  workflows: {
    title: "Workflows",
    kind: "workflows",
    overview:
      "Workflows combines declared workflow structure with observed activity. The catalog lists available workflows; the map shows nodes, transitions, and calls between workflows.",
    content:
      "Select a workflow, node, or connection to inspect it. Health and timing reflect the selected period. A declared branch is not proof it ran; inspect an execution's trace for that evidence.",
    example: "/workflows",
  },
  interrupts: {
    title: "Interrupts",
    kind: "list",
    overview:
      "Interrupts are recorded pauses for decisions or input. Pending, resolved, expired, cancelled, and failed requests describe different stages of that lifecycle.",
    content:
      "Open a request to inspect what was asked, the recorded response, and its timeline. A response and a resumed execution are separate facts.",
    example: "/interrupts",
  },
  interrupt: {
    title: "Interrupt details",
    kind: "detail",
    overview:
      "This request records a pause for input. Check its state, requested decision, response, and associated execution before drawing conclusions about what happened next.",
    content:
      "Decision shows the request and recorded response. Timeline orders lifecycle events. Follow the execution link to confirm whether the workflow resumed and how it ended.",
    example: `/interrupts/${sample.interruptId}`,
  },
  prompts: {
    title: "Prompt library",
    kind: "list",
    overview:
      "The prompt library organizes prompt assets and their saved versions. Categories organize the library; tags point to versions used in an environment.",
    content:
      "Open a prompt to read its saved content, compare versions, and inspect linked evaluations, executions, reviews, and activity. A draft and a promoted version are different states.",
    example: "/prompts",
  },
  prompt: {
    title: "Prompt details",
    kind: "detail",
    overview:
      "This prompt has versioned content and recorded assignments. The selected version and environment matter: today's draft may differ from the version used by an earlier execution.",
    content:
      "Use the version picker and history to inspect saved content. Compare versions to review the actual change. Evaluations and runs provide evidence about versions that were used.",
    example: `/prompts/${sample.promptId}`,
  },
  "prompt-groups": {
    title: "Prompt groups",
    kind: "list",
    overview:
      "Prompt groups collect candidate prompt versions for testing together. A group is a selection of versions, not a production deployment or a passing evaluation.",
    content:
      "Open a group to inspect its prompt-version bindings and evaluation evidence. Check version identities before attributing a change in results to a prompt.",
  },
  "prompt-group": {
    title: "Prompt group details",
    kind: "detail",
    overview:
      "This group binds prompt assets to candidate versions. Review those bindings to understand exactly what would be tested together.",
    content:
      "Inspect the included versions and linked evaluation results. Editing a candidate group does not by itself promote those versions to production.",
  },
  evals: {
    title: "Evaluations",
    kind: "list",
    overview:
      "Evaluation runs execute conversation suites against an application target. Progress counts recorded outcomes; a running evaluation can already contain completed, failed, and ungraded attempts.",
    content:
      "Open an evaluation to inspect suite progress, then a suite and conversation for criteria and evidence. Pass rate summarizes graded outcomes, not proof of production reliability.",
    example: "/evals/runs",
  },
  "eval-suites": {
    title: "Evaluation suites",
    kind: "list",
    overview:
      "Suites define conversations and expectations exposed by an application target. A definition describes what to test; it is not itself a recorded test result.",
    content:
      "Open a suite to inspect inputs, steps, and criteria. Check the target and revision when comparing results from different points in time.",
    example: "/evals/suites",
  },
  "eval-suite": {
    title: "Suite definition",
    kind: "detail",
    overview:
      "This suite defines conversation cases, their steps, and expected observations. The suite revision identifies the exact definition used by an evaluation.",
    content:
      "Read case inputs and expectations before reviewing scores. Saved results retain their suite and grader context so comparisons can distinguish changed tests from changed outcomes.",
    example: `/evals/suites/${sample.targetId}/${sample.suiteId}`,
  },
  evaluation: {
    title: "Evaluation details",
    kind: "detail",
    overview:
      "This evaluation groups suite executions for one target. Finished suites and recorded case outcomes are separate progress counts; unfinished grading has no final verdict yet.",
    content:
      "Open a suite to inspect individual conversations. Check errors, cancellations, pending grading, costs, and recorded context before interpreting the overall outcome.",
    example: `/evals/evaluations/${sample.evaluationId}`,
  },
  "eval-run": {
    title: "Suite run results",
    kind: "detail",
    overview:
      "This is one execution of a conversation suite. Counts summarize attempts; a case's criterion results and recorded observations explain the evidence behind its outcome.",
    content:
      "Open a conversation for its step evidence and workflow links. Configuration and Suite definition show the context that produced these results. Compare uses a saved baseline when one is available.",
    example: `/evals/runs/${sample.evalRunId}`,
  },
  "eval-case": {
    title: "Conversation evaluation",
    kind: "detail",
    overview:
      "This view explains one conversation attempt. Step results connect expected behavior, the observed response, grading criteria, and execution evidence.",
    content:
      "Inspect each step's reason and evidence. Awaiting evaluation means grading is unfinished. Workflow links show what actually ran; conversation details retain the inputs and responses.",
    example: `/evals/cases/${sample.evalRunId}/${sample.caseId}/1`,
  },
  "eval-comparison": {
    title: "Evaluation comparison",
    kind: "detail",
    overview:
      "This view compares a saved suite run with a baseline. Inputs, definitions, reference facts, and grader context determine whether a score change is comparable.",
    content:
      "Inspect improved, regressed, and incomparable cases separately. A score delta does not establish that a prompt change caused the difference. Open case evidence to investigate.",
    example: `/evals/runs/${sample.evalRunId}/compare?baseline=${sample.baselineEvalRunId}`,
  },
  "eval-case-comparison": {
    title: "Conversation comparison",
    kind: "detail",
    overview:
      "This comparison shows the recorded evidence for a conversation in two suite runs. Check the comparison context before treating different scores as an improvement or regression.",
    content:
      "Compare inputs, observations, criteria, and grading reasons. Follow execution links to investigate the behavior behind each result.",
    example: `/evals/runs/${sample.evalRunId}/compare?baseline=${sample.baselineEvalRunId}`,
  },
  diagnostic: {
    title: "Error diagnostic",
    kind: "detail",
    overview:
      "A diagnostic preserves exception evidence and its execution context. Availability and capture completeness are separate: retained evidence can be redacted, truncated, or expired.",
    content:
      "Exception shows the message, stack, causes, and captured provider fields. Capture details explains omissions and redactions. Context links the error to its execution. Download retains the full available capture.",
    example: `/diagnostics/${sample.diagnosticIds.budgetLimit}?env=sample`,
  },
  settings: {
    title: "Settings",
    kind: "settings",
    overview:
      "Settings controls your Studio preferences and the configuration available for your current installation or project. Available actions depend on your permissions.",
    content:
      "Review the selected section's descriptions before changing a value. This guide only explains the controls; it does not save settings, create credentials, or change access.",
  },
  onboarding: {
    title: "Connect your application",
    kind: "setup",
    overview:
      "This page helps connect your own application to Studio. Configure the server connection, integrate telemetry, and run your application to produce inspectable records.",
    content:
      "Follow the setup instructions for your environment. Keep API credentials on the server. Sample examples help explain Studio, while your application's executions verify the real integration.",
  },
  other: {
    title: "This Studio page",
    kind: "other",
    overview:
      "You are viewing the selected Studio workspace. The page heading and descriptions explain this view; the project selector determines which workspace its data belongs to.",
    content:
      "Use the page's descriptions and available controls to explore this view. Explore Studio opens the guide library, and Documentation opens the product reference.",
  },
} as const satisfies Record<string, PageGuide>;
export type PageGuideId = keyof typeof PAGE_GUIDES;

/** Specific detail routes precede their list prefixes; unknown extension pages retain help. */
export function pageGuideId(path: string): PageGuideId {
  if (/^\/runs\/[^/]+$/.test(path)) return "run";
  if (path === "/runs" || path === "/") return "runs";
  if (/^\/sessions\/[^/]+$/.test(path)) return "session";
  if (path === "/sessions") return "sessions";
  if (path === "/workflows") return "workflows";
  if (/^\/interrupts\/[^/]+$/.test(path)) return "interrupt";
  if (path === "/interrupts") return "interrupts";
  if (/^\/prompts\/groups\/[^/]+$/.test(path)) return "prompt-group";
  if (path === "/prompts/groups") return "prompt-groups";
  if (path === "/prompts" || path.startsWith("/prompts/categories/"))
    return "prompts";
  if (path.startsWith("/prompts/")) return "prompt";
  if (/^\/evals\/cases\/[^/]+\/[^/]+\/compare$/.test(path))
    return "eval-case-comparison";
  if (/^\/evals\/cases\/[^/]+\/[^/]+\/[^/]+$/.test(path)) return "eval-case";
  if (/^\/evals\/runs\/[^/]+\/compare$/.test(path)) return "eval-comparison";
  if (/^\/evals\/runs\/[^/]+$/.test(path)) return "eval-run";
  if (/^\/evals\/evaluations\/[^/]+$/.test(path)) return "evaluation";
  if (/^\/evals\/suites\/[^/]+\/[^/]+$/.test(path)) return "eval-suite";
  if (path === "/evals/suites") return "eval-suites";
  if (path.startsWith("/evals")) return "evals";
  if (path.startsWith("/diagnostics/")) return "diagnostic";
  if (
    path.startsWith("/settings") ||
    /^\/organizations\/[^/]+\/settings\//.test(path)
  )
    return "settings";
  if (path === "/onboarding") return "onboarding";
  return "other";
}

export function pageGuide(id: PageGuideId): PageGuide {
  return PAGE_GUIDES[id];
}

export const RUN_TAB_HELP: Record<string, string> = {
  overview:
    "Overview summarizes timing, calls, and activity for this run. Quiet periods mean no telemetry was captured during that interval; they are not automatically model latency.",
  execution:
    "Execution follows workflow calls and returned results. Expand a child call to inspect delegated work and distinguish it from the parent continuation.",
  trace:
    "Trace orders recorded spans and their timings. Expand a step for details. Incomplete spans indicate missing completion evidence, not an inferred success.",
  topology:
    "Topology relates workflow structure to this execution. Declared branches may not have run; confirm the observed path in Trace.",
  "model-io":
    "Model I/O connects captured model inputs to responses or failures. Privacy settings determine what is retained. Missing content is not an empty provider response.",
  summary:
    "Summary collects the recorded execution context and outcome. Use detailed events and traces when you need to verify ordering or diagnose a failure.",
  feedback:
    "Feedback records reviews and scores for this run. These are separate from the runtime outcome and from evaluation-suite results.",
  events:
    "Events is the ordered telemetry record. Filter by category or status, then open an event to inspect its payload, timing, correlation IDs, and diagnostic link when available.",
};

export const SETTINGS_HELP: Record<string, string> = {
  appearance:
    "Choose your theme, display, and appearance preferences. Changes affect how Studio looks rather than your application's execution behavior.",
  "sample-project":
    "Hide or restore the read-only sample project in the selector. Visibility is independent of your saved walkthrough progress.",
  connection:
    "Inspect the server connection used to read your application's telemetry. Credentials belong on the server; an unavailable connection prevents Studio from loading records.",
  "api-keys":
    "Manage the credentials your application uses for this project. Review scopes and expiry, and store secrets in your server environment.",
  evaluations:
    "Configure the application targets that expose conversation suites. Running an evaluation uses the selected target and its registered configuration.",
  providers:
    "Configure the model providers available to this installation. Keep provider secrets on the server and check which actions your permissions allow.",
  privacy:
    "Review telemetry and usage privacy controls. Captured execution content and maintainer product-usage telemetry are separate settings.",
  general:
    "Review the current workspace identity and configuration. Check the selected project or organization before changing a shared setting.",
  members:
    "Review workspace membership and roles. Access changes affect other users, so check the selected workspace and permissions carefully.",
  projects:
    "Review the projects in this organization and their configuration. Project scope determines which executions and resources are visible.",
  about:
    "Inspect the installed Studio version and available update information. Version details help diagnose compatibility and deployment issues.",
  access:
    "Inspect your current access and available workspace capabilities. Permissions determine which configuration actions you can perform.",
};

export const DETAIL_TAB_HELP: Partial<
  Record<PageGuideId, Record<string, string>>
> = {
  run: RUN_TAB_HELP,
  prompt: {
    content:
      "Read the selected version's content and hash. Version history and comparison explain what changed; edits and promotions remain explicit actions outside this guide.",
    activity:
      "Activity records changes to this prompt over time. Review the recorded versions, assignments, and actors to understand its history; today's assignment may differ from an earlier execution's snapshot.",
    runs: "Runs links recorded executions to this prompt version. Open an execution for its trace and model evidence. Missing links mean no matching usage was captured, not proof that a version was never used.",
    evals:
      "Evaluations links saved tests to this prompt version. Inspect the test context and criteria before interpreting a score; versions alone do not establish what caused a difference.",
    reviews:
      "Reviews records human feedback about the selected prompt version. Check the review context and evidence before promoting a version. Review feedback is separate from runtime and evaluation outcomes.",
  },
  session: {
    activity:
      "Activity orders the recorded conversation turns and execution events in this session. Follow a turn's execution link to inspect its individual trace and result.",
    runs: "Each row is one execution in this session, with its own ID, outcome, path, and duration. Session totals aggregate these runs; open a row for its individual evidence.",
  },
  interrupt: {
    decision:
      "Inspect the requested input and any recorded response. Pending requests have no decision yet. Studio displays the evidence; your application owns the approval and resume behavior.",
    timeline:
      "Timeline separates request creation, responses, and resolution. Follow the execution link to verify what continued afterwards; resolution alone does not prove successful completion.",
  },
  "eval-run": {
    cases:
      "Each conversation attempt has step outcomes, criteria, and evidence. Awaiting grading is unfinished work. Open a case to inspect why it passed, failed, or could not be evaluated.",
    context:
      "Configuration records the target, grading setup, selected cases, and execution settings used for this suite run. These facts matter when reproducing or comparing results.",
    definition:
      "The saved suite definition records conversation inputs and expectations used by this run. Check the revision before comparing it with results from another definition.",
  },
  diagnostic: {
    exception:
      "Inspect the original message, stack trace, nested causes, and captured provider fields. Pretty previews long values; JSON and download retain the full available capture.",
    capture:
      "Capture details explains what was retained, redacted, or omitted and why. A complete capture can still contain deliberate redactions. Expiry and unavailable content are separate retention states.",
    context:
      "Context correlates the diagnostic with its run, session, workflow, and trace when recorded. Follow those links to inspect execution order and the surrounding evidence.",
  },
};
