import type { HelpDefinition } from "../components/ui/help-types";

// Keep the major docs line explicit: installed Studio must not follow a future major.
export const STUDIO_DOCS_ROOT = "https://kortyx.io/docs/studio/v0";
const help = (
  label: string,
  description: string,
  path: string,
): HelpDefinition => ({
  label,
  description,
  documentationUrl: `${STUDIO_DOCS_ROOT}/${path}`,
});

/** Public customer concepts only. Cloud implementation details stay in its adapter. */
export const studioHelp = {
  sampleProject: help(
    "Sample project",
    "Fictional runs, prompts, and evaluations you can explore without connecting an app. The sample is read-only; it is separate from your real projects.",
    "sample-project#read-only-sample-data",
  ),
  learning: help(
    "Help and tours",
    "Explain the page you are viewing, try a sample walkthrough, or resume a chapter. Learning progress stays in this browser and does not verify your app connection.",
    "sample-project#guided-tours-and-page-help",
  ),
  runs: help(
    "Runs",
    "A run records one execution of a workflow in your app. Open it to see each step, waiting time, and any errors.",
    "runs",
  ),
  sessions: help(
    "Sessions",
    "A session groups related runs, such as messages in one conversation. Your app chooses which runs belong together.",
    "sessions",
  ),
  interrupts: help(
    "Interrupts",
    "A pause that asks a person for input. Open it to see the question, whether anyone answered, and what happened next.",
    "interrupts",
  ),
  workflows: help(
    "Workflows",
    "A workflow is a series of steps your app follows to complete a task. This map shows those steps and the paths seen in recorded runs.",
    "workflows",
  ),
  prompts: help(
    "Prompts",
    "Saved instructions for an AI model. Create and test a version, then mark it live when you want apps using the live version to receive it.",
    "prompts",
  ),
  evals: help(
    "Evaluations",
    "Test your app with example conversations. Results show whether each conversation ran and whether its answers passed the checks.",
    "evals",
  ),
  filters: help(
    "Search and filters",
    "Show only the records you need. Click a table status to filter by it; click the selected status again to clear it. All means every condition must match; Any means at least one must match.",
    "exploring-data#search-and-filters",
  ),
  live: help(
    "Live updates",
    "Keep this view up to date as new activity arrives. Updates pause when your browser tab is hidden or offline.",
    "exploring-data#live-updates",
  ),
  views: help(
    "Table views",
    "Save filters and layout for later. Cloud views belong to you in this project; self-hosted views are shared by the project. A browser cache loads first, then authenticated projects sync in the background. Sample and development choices stay in this browser.",
    "exploring-data#table-views",
  ),
  metrics: help(
    "Run metrics",
    "Numbers from the activity your app sent to Studio. A missing value means Studio does not have enough information; it does not mean zero.",
    "metrics",
  ),
  timing: help(
    "Model timing",
    "How long the model took to start and finish sending its answer. Streaming calls can show time to the first text, time spent sending text, and time spent finishing.",
    "metrics#model-timing",
  ),
  tokens: help(
    "Tokens",
    "Tokens are the pieces used to count an AI model's input and output. Providers report this usage; a missing count does not mean zero.",
    "metrics#tokens",
  ),
  cost: help(
    "Model cost",
    "The recorded cost of AI model calls. A partial amount includes only calls with known prices; missing prices do not mean the calls were free.",
    "metrics#cost-and-pricing",
  ),
  children: help(
    "Child workflows",
    "A child workflow is a workflow called by another workflow. Include children to see those calls alongside the main runs.",
    "runs#child-workflows",
  ),
  status: help(
    "Run status",
    "Shows whether the run is working, waiting for input, finished, or failed. Sending an answer does not always mean all background work has finished.",
    "runs#status-and-completion",
  ),
  trace: help(
    "Trace",
    "A step-by-step view of the run, including AI requests, tools, and pauses. Steps can run at the same time, so adding their times can overstate the total.",
    "runs#trace-and-events",
  ),
  events: help(
    "Events",
    "A record of something that happened during a run. Occurred is when your app reported it happened; Received is when Studio received it.",
    "runs#trace-and-events",
  ),
  payloads: help(
    "Captured inputs and outputs",
    "The text or data sent into and returned from a step. Your app must enable content capture before Studio can show it.",
    "runs#captured-content",
  ),
  feedback: help(
    "Feedback",
    "Ratings sent by your app's users. A good or bad rating describes their experience; it does not tell you whether the run had an error.",
    "runs#feedback",
  ),
  identity: help(
    "Application identity",
    "The user or customer ID sent by your app. These IDs describe the app's activity, not the person signed in to Studio.",
    "sessions#application-identity",
  ),
  checkpoints: help(
    "Checkpoints and branches",
    "A checkpoint saves a run's state so it can continue later. Branches show different continuations, such as a fork or a return to an earlier checkpoint.",
    "sessions#checkpoints-and-branches",
  ),
  observedCalls: help(
    "Observed calls",
    "Show the calls between workflows that Studio saw in recorded runs. Turn this off to show only connections found in your app's code.",
    "workflows#declared-and-observed-connections",
  ),
  workflowHealth: help(
    "Workflow health",
    "A quick view of recent workflow activity. Unknown means there are no runs in the selected time range; idle means the last activity was more than seven days ago.",
    "workflows#workflow-health",
  ),
  workflowNodes: help(
    "Node states",
    "These symbols summarize what happened at each step in the selected time range. Open a run to see the exact sequence of pauses, retries, and errors.",
    "workflows#node-states",
  ),
  promotion: help(
    "Promotion readiness",
    "The checks a prompt version must pass before it can go live. Saving a version keeps it for review; promoting it makes it available as the live version.",
    "prompts#promotion-policies",
  ),
  evalResults: help(
    "Evaluation results",
    "Each conversation row groups all repetitions, including passed, failed, and unfinished outcomes. Open a row and choose a Repetition for its evidence and cost. A successful execution can still fail a quality check.",
    "evals#read-results-and-compare",
  ),
  evalRerun: help(
    "Rerun failed cases",
    "Preselects recorded failed and errored cases in a new launch. Repetitions are deduplicated into case selections. Review the current suite definition, judge, and execution settings; launching executes tools again and keeps the original results.",
    "evaluation-results#rerun-failed-cases",
  ),
  evalMixedResults: help(
    "Mixed results",
    "A finished case has at least one assessed pass and one assessed failure. Assessed counts include passed and failed repetitions; errors and unassessed repetitions are separate. Differences can come from the application, data, or judge.",
    "evaluation-results#mixed-results-across-repetitions",
  ),
  evalChecks: help(
    "Deterministic checks",
    "Built-in assertions inspect the current captured answer, tool calls, or completed structured outputs before model judging. All checks must pass. Missing tool evidence cannot satisfy a tool assertion.",
    "judging#deterministic-checks",
  ),
  evalRepetitions: help(
    "Repetitions",
    "Each selected conversation runs this many times, even if it passes. One table row groups its repetitions; open it to select an individual result. Repetitions measure consistency, not retries after a failed check.",
    "evaluation-results#repetitions",
  ),
  evalComparison: help(
    "Evaluation comparison",
    "Changes load in the background after a run finishes or you refresh. Completed comparisons are reused when their results and baseline match. They use the latest earlier completed evaluation of the same application and environment in recent history. Comparison baseline chooses another earlier run in the table or modal. Dropdowns select each side’s repetition stats and evidence. All repetitions totals/averages appear separately below a separator. Green arrows mean improvement: higher pass rate, fewer failures, lower time/cost. Unequal repetition totals have no trend indicator; compare per-repetition means. Changed context or incomplete grading has no score delta.",
    "evaluation-results#compare-saved-runs",
  ),
  evalTiming: help(
    "Evaluation timing",
    "Time spent waiting, running conversations, checking answers, and cleaning up. A running test can keep adding time until it finishes.",
    "evals#timing-and-cost",
  ),
  evalCost: help(
    "Evaluation cost",
    "The cost of running test conversations and using an AI model to check their answers. A partial amount includes only calls with known prices.",
    "evals#timing-and-cost",
  ),
  evalSettings: help(
    "Evaluation settings",
    "Choose how many times to run each conversation, how many attempts can run at once, and when to stop waiting. Each field shows where its current value came from.",
    "evals#evaluation-settings-and-timeout-reporting",
  ),
  evalPostconditions: help(
    "Postcondition verification",
    "Your application checks the state left after the conversation, such as whether an approved change was saved. This is separate from the judge’s assessment of the answer. A pass means the application’s configured checks passed; it does not mean the answer met every criterion.",
    "evals#postcondition-verification",
  ),
  evalCriterion: help(
    "Criterion",
    "A requirement for this step. The judge prompt supplies reusable instructions for applying it to the current answer and evidence. Older suites may include those instructions inside the criterion itself.",
    "evals#criteria-and-judge-prompts",
  ),
  evalJudge: help(
    "Evaluation judge",
    "The judge checks whether a test answer meets your requirements. Studio judge uses a model set up in Studio; App judge uses a check provided by your app.",
    "evals#studio-judge-configuration",
  ),
  promptConfiguration: help(
    "Prompt configuration",
    "Extra settings and input rules saved with a prompt. Saving changes creates a version but does not make it live.",
    "prompts",
  ),
  promptDraft: help(
    "Saving a draft",
    "Draft saved means Studio accepted your latest edits. Unsaved or invalid edits can be lost if this page reloads. After a save failure, Export local draft downloads a copy. Use local draft on latest keeps your edits and tries saving against the latest revision; it does not merge another person's changes.",
    "prompts#review-and-save",
  ),
  connect: help(
    "Connect your application",
    "Send your app's workflow activity to Studio using the endpoint and API key shown here. Keep the key on your app's server, then run a workflow to check the connection.",
    "connect-project",
  ),
  operatorKeys: help(
    "Self-hosted API keys",
    "Your app uses a write key to send activity to Studio. Studio uses a separate read key to display it; ask your installation administrator to set up these keys.",
    "credentials-secrets",
  ),
  operatorEvals: help(
    "Self-hosted evaluation configuration",
    "Ask your installation administrator to add your app's test endpoint and the model used to check answers. Your app runs the test conversations.",
    "first-eval",
  ),
  privacy: help(
    "Telemetry and privacy",
    "Your app controls whether prompts and responses are saved, and capture is off by default. Product analytics measures how Studio is used and has a separate setting.",
    "connect-project#choose-what-content-studio-may-store",
  ),
  configuration: help(
    "Installation configuration",
    "Settings for the server that runs your Studio installation. Ask its administrator to change connection details or server credentials.",
    "configuration-reference",
  ),
  cloudStart: help(
    "Get started with Cloud",
    "Create an account and a project, then create an API key for that project. Connect your app and run a workflow to see its activity in Studio.",
    "cloud-get-started",
  ),
  cloudWorkspaces: help(
    "Organizations and projects",
    "An organization is your team workspace. It contains projects, each with its own API keys and recorded activity.",
    "cloud-workspaces",
  ),
  cloudEnvironments: help(
    "Environments",
    "Choose the activity marked development, staging, or production by your app. An environment label helps filter records within the current project.",
    "cloud-workspaces#environments",
  ),
  cloudKeys: help(
    "Cloud API keys",
    "This key lets your app send activity to the selected project. Copy the secret when it is created, keep it on your server, and replace it if it is lost.",
    "cloud-api-keys",
  ),
  cloudAccount: help(
    "Account and browser sessions",
    "Change your name or email, manage how you sign in, and review signed-in browsers. These account settings are separate from your app's users and API keys.",
    "cloud-account",
  ),
  cloudLifecycle: help(
    "Workspace deletion and recovery",
    "Deleted workspaces may be recoverable until the deadline shown here. Restored projects need new API keys because their old keys stay revoked.",
    "cloud-workspaces#deletion-and-recovery",
  ),
  cloudEvals: help(
    "Cloud evaluation endpoints",
    "The URL where your app accepts test conversations, plus the secret needed to call it. This is separate from the API key your app uses to send activity to Studio.",
    "cloud-evaluations#application-endpoints",
  ),
  cloudProviders: help(
    "Cloud model providers",
    "Add an AI provider key so Studio can use that provider for features such as checking test answers. Your app's own AI provider keys are set up separately.",
    "cloud-evaluations#provider-credentials",
  ),
  cloudMembers: help(
    "Team collaboration",
    "Items marked Soon are not available yet. This screen does not currently let you invite members, upgrade to Pro, or manage billing.",
    "cloud-workspaces#feature-availability",
  ),
  models: help(
    "AI models",
    "The AI model your app called, such as a GPT or Claude model. Open a run to see each recorded model request.",
    "metrics#model-timing",
  ),
  providers: help(
    "AI providers",
    "The service that runs the AI model, such as OpenAI or Anthropic. Your app reports which provider it used.",
    "metrics#model-timing",
  ),
  duration: help(
    "Duration",
    "How long the recorded work took from start to finish. Open the run to see time spent on steps and waiting for input.",
    "metrics",
  ),
  cloudProfile: help(
    "Your name",
    "The name shown on your Kortyx account. Editing it keeps your projects, access, and connected sign-in accounts.",
    "cloud-account#change-your-name",
  ),
  cloudEmail: help(
    "Email changes",
    "Your current email keeps working until you verify the new address. Open the link sent to the new address to finish the change.",
    "cloud-account#change-your-email-address",
  ),
  cloudVerifiedEmail: help(
    "Verified email",
    "You have confirmed that you can receive mail at this address. Kortyx uses it for sign-in and account recovery.",
    "cloud-account#change-your-email-address",
  ),
  cloudSignIn: help(
    "Sign-in methods",
    "The ways you can sign in to this same account. Connect another option before removing your last one so you can still get in.",
    "cloud-account#manage-sign-in-methods",
  ),
  cloudPasskeys: help(
    "Passkeys",
    "Sign in with your device's fingerprint, face unlock, or a security key instead of typing a password. Add a passkey only on a device you trust.",
    "cloud-account#passkeys",
  ),
  cloudPassword: help(
    "Password",
    "Set a password or replace your current one. If you forget it, use password recovery on the sign-in page.",
    "cloud-account#password",
  ),
  cloudRemoveSignIn: help(
    "Remove a sign-in method",
    "This option will stop working for sign-in. Keep another way to sign in; removing a method does not delete your account or projects.",
    "cloud-account#disconnect-a-sign-in-method",
  ),
  cloudConfirmIdentity: help(
    "Confirm your identity",
    "Sign in again to confirm it is you before changing sensitive account settings. Then return to Account and repeat the change.",
    "cloud-account#confirm-your-identity",
  ),
  cloudBrowserSessions: help(
    "Browser sessions",
    "Browsers currently signed in to your account. Ending a session signs that browser out; your app's API keys and recorded runs keep working.",
    "cloud-account#browser-sessions",
  ),
  cloudAccountDeletion: help(
    "Delete your account",
    "Permanently remove your login and profile and sign out every browser. Shared organization data stays; if you are its last owner, transfer ownership or delete the organization first.",
    "cloud-account#account-deletion",
  ),
} satisfies Record<string, HelpDefinition>;

export type StudioHelpTopic = keyof typeof studioHelp;

const commonColumns: Record<string, StudioHelpTopic> = {
  tokens: "tokens",
  cost: "cost",
  pricingStatus: "cost",
  duration: "duration",
  model: "models",
  models: "models",
  providers: "providers",
  identity: "identity",
  userId: "identity",
  tenantId: "identity",
  environment: "filters",
  feedback: "feedback",
};
const resourceColumns: Record<string, Record<string, StudioHelpTopic>> = {
  runs: {
    parent: "children",
    status: "status",
    workflow: "workflows",
    path: "workflows",
    session: "sessions",
    result: "payloads",
  },
  sessions: {
    status: "sessions",
    session: "sessions",
    runs: "sessions",
    checkpoint: "checkpoints",
    result: "payloads",
    activeVersion: "workflows",
    workflowIds: "workflows",
    tags: "filters",
  },
  interrupts: {
    status: "interrupts",
    age: "interrupts",
    request: "interrupts",
    workflow: "workflows",
    session: "sessions",
    response: "interrupts",
    outcome: "interrupts",
    run: "runs",
    resolutionMs: "interrupts",
    expiresAt: "interrupts",
    resolvedAt: "interrupts",
    resolvedBy: "interrupts",
  },
  evals: {
    baseline: "evalResults",
    candidate: "evalResults",
    change: "evalResults",
    suite: "evals",
    cases: "evals",
    latest: "evalResults",
    latestCost: "evalCost",
    latestPassRate: "evalResults",
    latestDuration: "evalTiming",
    queueMs: "evalTiming",
    attempt: "evalResults",
    steps: "evalResults",
    criteriaScore: "evalResults",
    failure: "evalResults",
    sessionId: "sessions",
    name: "evals",
    status: "evalResults",
    progress: "evalResults",
    results: "evalResults",
    application: "evals",
    trigger: "evals",
    cost: "evalCost",
    duration: "evalTiming",
    queue: "evalTiming",
    passRate: "evalResults",
    result: "evalResults",
    gradingMs: "evalTiming",
    executionMs: "evalTiming",
    phase: "evalTiming",
    outcome: "evalResults",
    score: "evalResults",
    attempts: "evalResults",
    conversation: "evals",
    case: "evals",
  },
  prompts: {
    memberNames: "prompts",
    memberVersions: "prompts",
    category: "prompts",
    newest: "prompts",
    tags: "prompts",
    assignedTags: "prompts",
    assignedVersions: "prompts",
    versionsBehindLive: "promotion",
    prompts: "prompts",
    versions: "prompts",
    "prompt-usage": "prompts",
    version: "prompts",
    live: "promotion",
    status: "promotion",
    reviews: "promotion",
    tests: "prompts",
    key: "prompts",
    name: "prompts",
    latest: "prompts",
    policy: "promotion",
    group: "prompts",
  },
};

const commonColumnDescriptions: Record<string, string> = {
  pricingStatus:
    "Whether Studio has a price for the recorded model calls. A missing price means the cost is unknown, not free.",
  userId:
    "The ID your app uses for the person who started this activity. It is separate from your Studio account.",
  identity:
    "The user and customer IDs sent by your app. Use them to find related activity.",
  environment:
    "The environment label sent by your app, such as development or production.",
};
const resourceColumnDescriptions: Record<string, Record<string, string>> = {
  runs: {
    parent:
      "Whether this is a main run or a workflow called from another run. Open the parent to see the wider task.",
    path: "The workflow steps visited in this run, in the recorded order.",
    workflow:
      "The workflow and version that ran. A version may be missing if your app did not report it.",
    session:
      "The conversation or group this run belongs to. Your app supplies the session ID.",
    result:
      "The outcome and any captured response from this run. Your app must enable content capture to show the response.",
  },
  sessions: {
    status:
      "A summary of activity in this session. Open it to see runs that finished, failed, or are waiting for input.",
    runs: "How many main runs belong to this session. Calls inside another run are shown as child workflows.",
    checkpoint:
      "A saved point where the workflow can continue. Open the session to inspect its saved state and branches.",
    activeVersion:
      "The workflow version used by the current run in this session.",
    workflowIds: "The workflows recorded in this session.",
    tags: "Labels your app attached to this session. Use them to find related activity.",
  },
  interrupts: {
    request:
      "The question or input your app is waiting for. Open the request to see the available details.",
    response:
      "The answer received from the person asked for input, if your app saved it.",
    outcome:
      "What happened after an answer was received, such as continuing the run or encountering an error.",
    run: "The run that asked for input. Open it to see what happened before and after the pause.",
    resolutionMs:
      "How long the request waited before it was answered or closed.",
    expiresAt: "The deadline for answering this request, if your app set one.",
    resolvedAt: "When this request was answered or closed.",
    resolvedBy:
      "The person or service your app recorded as closing this request.",
  },
  evals: {
    baseline: "The earlier test result used as the comparison point.",
    candidate: "The test result you are comparing with the baseline.",
    change:
      "How this conversation differs from the named earlier evaluation. Click the change or comparison icon to inspect both sides in a modal. Changed context and unfinished grading have no score delta.",
    suite: "A group of test conversations run together.",
    cases: "The example conversations included in this test.",
    attempt: "Which repeat of the same test conversation this is.",
    attempts: "How many times each test conversation was tried.",
    steps: "The conversation steps completed during this attempt.",
    criteriaScore: "How well the answer met the checks defined for this test.",
    failure:
      "Why the test could not finish or pass its checks. Open the result for details.",
    application:
      "The app endpoint that receives and runs the test conversations.",
    trigger: "How this test was started.",
    queue: "Time spent waiting for a worker before the test started.",
    queueMs: "Time spent waiting for a worker before the test started.",
    passRate: "The percentage of checked conversations that passed.",
    latestPassRate:
      "The percentage of checked conversations that passed in the latest test.",
    gradingMs: "Time spent checking the answers after the conversation ran.",
    executionMs: "Time spent running the test conversation in your app.",
    phase:
      "The part of the test currently running, such as preparation, conversations, or answer checks.",
    progress:
      "How much of the test has finished. A finished conversation can still be waiting for its answers to be checked.",
    score: "How well the answers met this test's requirements.",
  },
  prompts: {
    version:
      "A saved copy of a prompt. Changes create a new version so earlier versions can still be reviewed.",
    live: "The version apps receive when they request the live prompt. Saving a newer version does not change this selection.",
    versionsBehindLive:
      "How many versions separate this selection from the live version.",
    reviews:
      "The reviews recorded for this prompt version. Promotion rules may require approval before it goes live.",
    tests:
      "Tests recorded for this prompt version. Open the prompt to review their results.",
    policy: "The checks required before a prompt version can go live.",
    tags: "Labels used to organize and find prompts.",
    assignedTags: "Labels assigned to this prompt.",
    group: "A collection of prompts managed together.",
    memberNames: "The prompts included in this group.",
    memberVersions: "The saved prompt versions included in this group.",
  },
};

export function withStudioColumnHelp<C extends { key: string; label: string }>(
  columns: C[],
  resource: keyof typeof resourceColumns,
): Array<C & { help?: HelpDefinition }> {
  return columns.map((column) => {
    const topic =
      resourceColumns[resource]?.[column.key] ?? commonColumns[column.key];
    return topic
      ? {
          ...column,
          help: {
            ...studioHelp[topic],
            label: column.label,
            description:
              resourceColumnDescriptions[resource]?.[column.key] ??
              commonColumnDescriptions[column.key] ??
              studioHelp[topic].description,
          },
        }
      : column;
  });
}
