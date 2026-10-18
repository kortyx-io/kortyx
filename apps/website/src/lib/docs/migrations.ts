// Permanent cross-area moves. Keep these for older Studio builds and external links.
export const docsMoves: Record<string, string> = {
  "studio/v0/cli-commands": "cli/v0/reference",
  "studio/v0/configuration-reference":
    "self-hosting/v0/configuration-reference",
  "studio/v0/run-locally": "self-hosting/v0/run-locally",
  "studio/v0/cloud-account": "cloud/v0/account",
  "studio/v0/deploy-server": "self-hosting/v0/deploy-server",
  "studio/v0/operations": "self-hosting/v0/operations",
  "studio/v0/credentials-secrets": "self-hosting/v0/credentials-secrets",
  "studio/v0/cloud-workspaces": "cloud/v0/workspaces",
  "studio/v0/cloud-api-keys": "cloud/v0/api-keys",
  "studio/v0/prompt-migration": "cli/v0/prompts",
  "studio/v0/cloud-evaluations": "cloud/v0/evaluations",
  "studio/v0/cloud-get-started": "cloud/v0/get-started",
  "studio/v0/high-availability": "self-hosting/v0/high-availability",
  "studio/v0/deploy-aws-cdk": "self-hosting/v0/deploy-aws-cdk",
  "studio/v0/self-hosted": "self-hosting/v0",
  "studio/v0/cloud": "cloud/v0",
  "studio/v0/getting-started": "studio/v0/get-started",
  "studio/v0/guides": "studio/v0/overview",
};

// Historical headings that moved into a focused guide. Fragments are resolved in the browser.
export const docsAnchorMoves: Record<string, Record<string, string>> = {
  "/docs/studio/overview": {
    "use-managed-cloud": "/docs/cloud/get-started#complete-setup",
    "develop-on-your-machine": "/docs/self-hosting#start-locally",
    "deploy-for-a-team": "/docs/self-hosting#deploy-for-a-team",
  },
  "/docs/studio/connect-project": {
    "collect-response-feedback":
      "/docs/studio/feedback#collect-response-feedback",
    "publish-the-declared-workflow-catalog":
      "/docs/cli/topology#publish-the-declared-workflow-catalog",
    "interrupt-behavior-in-studio":
      "/docs/studio/interrupts#interrupt-behavior-in-studio",
  },
  "/docs/cli/reference": {
    "everyday-commands": "/docs/cli/local-studio#everyday-commands",
    "start-options": "/docs/cli/local-studio#start-options",
    "print-or-rotate-local-credentials":
      "/docs/cli/local-studio#print-or-rotate-local-credentials",
    "generate-credentials-for-remote-deployment":
      "/docs/cli/local-studio#generate-credentials-for-remote-deployment",
    "publish-a-workflow-catalog":
      "/docs/cli/topology#publish-a-workflow-catalog",
    "reset-local-data": "/docs/cli/local-studio#reset-local-data",
    "read-only-run-and-session-debugging":
      "/docs/cli/inspect#read-only-run-and-session-debugging",
    "connect-local-staging-or-another-project":
      "/docs/cli/connections#connect-local-staging-or-another-project",
    "local-cli-versus-remote-operation":
      "/docs/cli/local-studio#local-cli-versus-remote-operation",
    "eval-suites-and-post-deployment-ci":
      "/docs/cli/evaluations#eval-suites-and-post-deployment-ci",
    "diagnose-deployment-wiring":
      "/docs/cli/evaluations#diagnose-deployment-wiring",
    "run-locally-without-studio":
      "/docs/cli/local-evaluations#run-locally-without-studio",
    "discover-and-run": "/docs/cli/evaluations#discover-and-run",
    "inspect-and-cancel": "/docs/cli/evaluations#inspect-and-cancel",
    "optional-post-deployment-github-actions-step":
      "/docs/cli/evaluation-automation#optional-post-deployment-github-actions-step",
  },
  "/docs/studio/evals": {
    "register-applications-on-the-studio-api-server":
      "/docs/self-hosting/configure-evaluations#register-applications-on-the-studio-api-server",
    "where-application-metadata-comes-from":
      "/docs/self-hosting/configure-evaluations#where-application-metadata-comes-from",
    "credentials-have-separate-jobs":
      "/docs/self-hosting/configure-evaluations#credentials-have-separate-jobs",
    "judge-criteria-and-evidence":
      "/docs/studio/evaluation-reference#judge-criteria-and-evidence",
    "eval-run-costs": "/docs/studio/evaluation-results#eval-run-costs",
    "persistence-and-execution-lifecycle":
      "/docs/self-hosting/evaluation-operations#persistence-and-execution-lifecycle",
    "use-the-interface": "/docs/studio/evaluation-results#use-the-interface",
    "container-configuration":
      "/docs/self-hosting/configure-evaluations#container-configuration",
    "required-structured-responses":
      "/docs/studio/evaluation-reference#required-structured-responses",
    "grouped-evaluation-runs":
      "/docs/studio/evaluation-results#grouped-evaluation-runs",
    "deployment-and-scheduled-ci-examples":
      "/docs/cli/evaluation-automation#deployment-and-scheduled-ci-examples",
    "failure-evidence": "/docs/studio/evaluation-reference#failure-evidence",
    "concurrent-execution-recovery":
      "/docs/self-hosting/evaluation-operations#concurrent-execution-recovery",
  },
  "/docs/cloud/account": {
    "manage-sign-in-methods": "/docs/cloud/sign-in#manage-sign-in-methods",
    password: "/docs/cloud/sign-in#password",
    passkeys: "/docs/cloud/sign-in#passkeys",
    "disconnect-a-sign-in-method":
      "/docs/cloud/sign-in#disconnect-a-sign-in-method",
    "confirm-your-identity": "/docs/cloud/sign-in#confirm-your-identity",
    "browser-sessions": "/docs/cloud/sign-in#browser-sessions",
    "deleted-workspaces": "/docs/cloud/recovery#deleted-workspaces",
  },
};
