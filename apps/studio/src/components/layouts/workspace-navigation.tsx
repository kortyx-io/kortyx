"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import Link from "@/components/scoped-link";
import { usePathname, useSearchParams } from "@/lib/scoped-navigation";
import { useWorkspaceLabels } from "./workspace-labels";

const labels: Record<string, string> = {
  runs: "Runs",
  sessions: "Sessions",
  workflows: "Workflows",
  interrupts: "Interrupts",
  datasets: "Datasets",
  experiments: "Experiments",
  judges: "Judge instructions",
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
  const experiments = segments[0] === "experiments";
  const reader = experiments && ["judges", "cases"].includes(segments[1]);
  const breadcrumbs = segments
    .map((segment, index) => ({
      segment,
      index,
      path: `/${segments.slice(0, index + 1).join("/")}`,
    }))
    .filter(({ index }) =>
      reader
        ? index <= 1
        : !(experiments && segments[1] === "runs" && index === 1),
    );
  const environment = params.get("env");
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
          {breadcrumbs.map(({ segment, index, path }, position) => {
            const last = position === breadcrumbs.length - 1;
            const text =
              workspaceLabels?.[path]?.title ??
              (segments[0] === "datasets" && index === 1
                ? "Dataset"
                : experiments &&
                    index === (segments[1] === "runs" ? 2 : 1) &&
                    !reader
                  ? "Experiment"
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
    </div>
  );
}
