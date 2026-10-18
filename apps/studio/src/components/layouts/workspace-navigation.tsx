"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import Link from "@/components/scoped-link";
import { Separator } from "@/components/ui/separator";
import { usePathname, useSearchParams } from "@/lib/scoped-navigation";
import { cn } from "@/lib/utils";
import { useWorkspaceLabels } from "./workspace-labels";

const labels: Record<string, string> = {
  runs: "Runs",
  sessions: "Sessions",
  workflows: "Workflows",
  interrupts: "Interrupts",
  evals: "Evals",
  suites: "Suites",
  cases: "Cases",
  compare: "Compare",
  settings: "Settings",
  onboarding: "Get started",
  diagnostics: "Error diagnostic",
  prompts: "Prompts",
  groups: "Test groups",
  categories: "Categories",
};

const settingsLabels: Record<string, string> = {
  general: "General",
  project: "General",
  account: "Account",
  appearance: "Appearance",
  "sample-project": "Sample project",
  about: "About",
  members: "Members",
  projects: "Projects",
  "api-keys": "API keys",
  environments: "Environments",
  connection: "Connection",
  evaluations: "Evaluations",
  providers: "Providers",
  privacy: "Telemetry & privacy",
  access: "Access",
};

/** Editions supply authorized scope selectors; a single OSS scope needs none. */
export function WorkspaceNavigation({
  projectSwitcher,
  organizationSwitcher,
  environmentSwitcher,
}: {
  projectSwitcher?: ReactNode;
  organizationSwitcher?: ReactNode;
  environmentSwitcher?: ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const workspaceLabels = useWorkspaceLabels();
  const segments = pathname.split("/").filter(Boolean);
  const environment = params.get("env");
  const evaluationRun =
    segments[0] === "evals" && segments[1] === "evaluations";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
      <nav
        aria-label="Workspace navigation"
        className="flex min-w-0 items-center gap-2 text-sm"
      >
        {[
          ["organization", organizationSwitcher],
          ["project", projectSwitcher],
          ["environment", environmentSwitcher],
        ]
          .filter(([, selector]) => Boolean(selector))
          .map(([key, selector]) => (
            <span
              key={String(key)}
              className="flex shrink-0 items-center gap-2"
            >
              {selector}
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
          ))}
        <ol className="flex min-w-0 items-center gap-2 overflow-hidden">
          {segments.map((segment, index) => {
            const last = index === segments.length - 1;
            const path =
              evaluationRun && index === 1
                ? "/evals/runs"
                : `/${segments.slice(0, index + 1).join("/")}`;
            const text =
              workspaceLabels?.[path]?.title ??
              (evaluationRun && index === 1
                ? "Runs"
                : evaluationRun && index === 2
                  ? "Evaluation run"
                  : segments[0] === "prompts" && index === 1 && !labels[segment]
                    ? "Prompt"
                    : undefined) ??
              (segments[0] === "settings" && index === 1
                ? settingsLabels[segment]
                : labels[segment]) ??
              decodeURIComponent(segment);
            const href = `${path}${environment && !environmentSwitcher ? `?env=${encodeURIComponent(environment)}` : ""}`;
            return (
              <li key={path} className="flex min-w-0 items-center gap-2">
                {index > 0 && (
                  <ChevronRight
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                {last || segments[0] === "diagnostics" ? (
                  <span
                    aria-current={last ? "page" : undefined}
                    className="truncate"
                    title={text}
                  >
                    {text}
                  </span>
                ) : (
                  <Link
                    href={href}
                    className="truncate text-foreground transition-colors hover:text-muted-foreground"
                    title={text}
                  >
                    {text}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {segments[0] === "evals" && (
        <>
          <Separator
            orientation="vertical"
            className="h-5! shrink-0 self-center"
          />
          <nav
            aria-label="Eval navigation"
            className="flex shrink-0 items-center gap-1 rounded-lg border bg-muted/50 p-0.5"
          >
            {(["runs", "suites"] as const).map((view) => {
              const active =
                view === (segments[1] === "suites" ? "suites" : "runs");
              const href = `/evals/${view}${environment ? `?env=${encodeURIComponent(environment)}` : ""}`;
              return (
                <Link
                  key={view}
                  href={href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                  )}
                >
                  {view === "runs" ? "Runs" : "Suites"}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </div>
  );
}
