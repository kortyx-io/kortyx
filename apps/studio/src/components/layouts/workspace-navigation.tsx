"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export function WorkspaceNavigation({
  project,
  environments,
  projectSwitcher,
  organizationSwitcher,
}: {
  project: string;
  environments: string[];
  projectSwitcher?: ReactNode;
  organizationSwitcher?: ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const environment = params.get("env") ?? "All environments";
  const segments = pathname.split("/").filter(Boolean);
  const scoped = segments[0] !== "settings";
  return (
    <nav
      aria-label="Workspace navigation"
      className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto text-sm"
    >
      {organizationSwitcher && (
        <>
          {organizationSwitcher}
          <ChevronRight
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </>
      )}
      {projectSwitcher ?? (
        <span
          className="max-w-44 shrink-0 truncate font-medium"
          title={project}
        >
          {project}
        </span>
      )}
      {environments.length > 0 && (
        <>
          <ChevronRight
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Telemetry environment"
                className="max-w-44 shrink-0 font-normal"
              >
                <span className="truncate">{environment}</span>
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Environments</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={environment}
                onValueChange={(value) => {
                  // Scope changes discard detail IDs and resource-specific filters.
                  const next = new URLSearchParams(
                    scoped ? undefined : params.toString(),
                  );
                  next.delete("env");
                  if (value !== "All environments") next.set("env", value);
                  router.push(
                    `/${segments[0] === "evals" ? "evals/runs" : segments[0] || "runs"}${next.size ? `?${next}` : ""}`,
                  );
                }}
              >
                <DropdownMenuRadioItem value="All environments">
                  All environments
                </DropdownMenuRadioItem>
                {Array.from(
                  new Set([
                    ...environments,
                    ...(environment !== "All environments"
                      ? [environment]
                      : []),
                  ]),
                ).map((value) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    {value}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      <ChevronRight
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <ol className="flex min-w-0 items-center gap-2 overflow-hidden">
        {segments.map((segment, index) => {
          const last = index === segments.length - 1;
          const text = labels[segment] ?? decodeURIComponent(segment);
          const path = `/${segments.slice(0, index + 1).join("/")}`;
          const href = `${path}${scoped && environment !== "All environments" ? `?env=${encodeURIComponent(environment)}` : ""}`;
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
