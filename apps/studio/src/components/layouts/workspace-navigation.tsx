"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import Link from "@/components/scoped-link";
import { usePathname, useSearchParams } from "@/lib/scoped-navigation";

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
  const segments = pathname.split("/").filter(Boolean);
  const environment = params.get("env");
  return (
    <nav
      aria-label="Workspace navigation"
      className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto text-sm"
    >
      {[
        ["organization", organizationSwitcher],
        ["project", projectSwitcher],
        ["environment", environmentSwitcher],
      ]
        .filter(([, selector]) => Boolean(selector))
        .map(([key, selector]) => (
          <span key={String(key)} className="flex shrink-0 items-center gap-2">
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
          const text = labels[segment] ?? decodeURIComponent(segment);
          const path = `/${segments.slice(0, index + 1).join("/")}`;
          const href = `${path}${environment && !environmentSwitcher ? `?env=${encodeURIComponent(environment)}` : ""}`;
          return (
            <li key={path} className="flex min-w-0 items-center gap-2">
              {index > 0 && (
                <ChevronRight
                  className="size-3 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              {last ? (
                <span aria-current="page" className="truncate" title={text}>
                  {text}
                </span>
              ) : (
                <Link
                  href={href}
                  className="truncate text-muted-foreground hover:text-foreground"
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
  );
}
