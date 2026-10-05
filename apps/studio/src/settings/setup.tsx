"use client";

import { StudioSetupFlow } from "@/components/settings/setup-flow";

import { LOCAL_SETUP_COOKIE } from "./setup-state";

export function LocalStudioSetup({ connected }: { connected: boolean }) {
  return (
    <StudioSetupFlow
      completionCookie={LOCAL_SETUP_COOKIE}
      steps={[
        {
          title: "Check your connection",
          canContinue: connected,
          content: (
            <>
              <p className="text-sm text-muted-foreground">
                {connected
                  ? "Your Studio API connection is ready."
                  : "Studio cannot read your project yet. Check the Connection card below, configure the server-only API URL and read key, then reload Settings."}
              </p>
              <p className="text-sm text-muted-foreground">
                The local CLI prepares these credentials with{" "}
                <code>npx kortyx studio start</code>. Never enter server
                credentials in browser forms.
              </p>
            </>
          ),
        },
        {
          title: "Connect your application",
          content: (
            <>
              <p className="text-sm text-muted-foreground">
                Print your installation’s SDK variables and save them in your
                application’s server-only environment:
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                npx kortyx studio credentials --format dotenv --service-name
                my-agent
              </pre>
              <p className="text-sm text-muted-foreground">
                Install <code>@kortyx/telemetry</code>, attach its adapter to
                your agent, then execute a workflow. Keys permit telemetry
                writes; they are not browser credentials.
              </p>
              <a
                className="text-sm underline"
                href="https://kortyx.io/docs/studio/run-locally"
                target="_blank"
                rel="noreferrer"
              >
                SDK connection guide
              </a>
            </>
          ),
        },
        {
          title: "Start observing",
          content: (
            <p className="text-sm text-muted-foreground">
              Open Runs to see telemetry as your application sends it. You can
              revisit connection details and preferences here in Settings.
            </p>
          ),
        },
      ]}
    />
  );
}
