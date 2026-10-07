"use client";

import { Check, Copy, RadioTower } from "lucide-react";
import { useState } from "react";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";

export type ObservationResource =
  | "runs"
  | "sessions"
  | "workflows"
  | "interrupts"
  | "evals";
const guidance: Record<
  ObservationResource,
  { title: string; instruction: string }
> = {
  runs: {
    title: "Observe your first run",
    instruction:
      "Attach Kortyx telemetry to your agent, then execute a workflow.",
  },
  sessions: {
    title: "Observe your first session",
    instruction:
      "Connect telemetry and use a stable sessionId across related agent runs.",
  },
  workflows: {
    title: "Observe your first workflow",
    instruction:
      "Connect telemetry and execute a declared Kortyx workflow to see its structure and transitions.",
  },
  interrupts: {
    title: "Observe your first interrupt",
    instruction:
      "Connect telemetry and execute a workflow that pauses for an interrupt. Ordinary runs do not create interrupts.",
  },
  evals: {
    title: "Run your first evaluation",
    instruction:
      "Expose your application's Kortyx eval endpoint, register the server-side target, and run a conversation suite.",
  },
};

export function FirstObservation({
  resource,
}: {
  resource: ObservationResource;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const item = guidance[resource];
  const prompt = `Add Kortyx ${resource === "evals" ? "conversation evaluations" : "observability"} to this application using the existing Kortyx SDK and the current official documentation at https://kortyx.io/docs. ${item.instruction} Read API credentials from the server environment; never embed secrets in browser code or prompts. Preserve default payload privacy. Verify the integration by running a minimal example and checking ${resource} in Studio.`;
  return (
    <div className="h-full overflow-y-auto rounded-xl border bg-background p-6 sm:p-10">
      <div className="max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-400">
            <RadioTower className="size-3.5" />
            Waiting for first{" "}
            {resource === "evals" ? "evaluation" : "observation"}
          </p>
          <h1 className="text-xl font-semibold tracking-tight">{item.title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {item.instruction}
          </p>
        </header>
        <ol className="space-y-8">
          <li className="space-y-3">
            <h2 className="font-medium">1. Configure your connection</h2>
            <p className="text-sm text-muted-foreground">
              Use Settings for connection details and credentials. Keep your SDK
              key in your application’s server-only environment.
            </p>
            <Button asChild variant="outline">
              <Link
                href={`/settings/${resource === "evals" ? "evaluations" : "connection"}`}
              >
                Open {resource === "evals" ? "evaluation" : "connection"}{" "}
                settings
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/settings/api-keys">Manage API keys</Link>
            </Button>
          </li>
          <li className="space-y-3">
            <h2 className="font-medium">2. Integrate with your coding agent</h2>
            <p className="text-sm text-muted-foreground">
              Copy this prompt into your coding agent. It contains no API
              secret.
            </p>
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <p className="font-mono text-xs leading-6">{prompt}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(prompt);
                    setCopied(true);
                    setCopyError(false);
                  } catch {
                    setCopyError(true);
                  }
                }}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy prompt"}
              </Button>
              {copyError && (
                <p role="alert" className="text-xs text-destructive">
                  Could not access clipboard. Select and copy the prompt
                  manually.
                </p>
              )}
            </div>
            <a
              href="https://kortyx.io/docs"
              target="_blank"
              rel="noreferrer"
              className="text-sm underline underline-offset-4"
            >
              Or follow the documentation manually
            </a>
          </li>
          <li className="space-y-3">
            <h2 className="font-medium">3. Run your application</h2>
            <p className="text-sm text-muted-foreground">
              Return here and refresh after the application sends data. Your
              selected project determines what you see.
            </p>
          </li>
        </ol>
      </div>
    </div>
  );
}
