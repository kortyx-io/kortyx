"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { studioHelp } from "@/lib/studio-help";
import { EvalSuiteStatusBar } from "./eval-suite-status-bar";

export function EvalSuiteNavigation({
  suites,
  loading = false,
  selected,
  onSelect,
  overviewLabel = "All conversations",
}: {
  loading?: boolean;
  suites: {
    id: string;
    name: string;
    description?: string;
    preview?: ReactNode;
    statusCounts?: Record<string, number>;
  }[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  overviewLabel?: string;
}) {
  return (
    <nav
      aria-label="Evaluation suites"
      inert={loading || undefined}
      className="data-table-body-scroll flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-background p-2 lg:w-48 lg:flex-col lg:items-stretch lg:overflow-x-hidden lg:overflow-y-auto lg:border-r lg:border-b-0"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-1">
        <span className="text-xs text-muted-foreground">Suites</span>
        <HelpCircle help={studioHelp.evals} />
      </div>
      <Button
        variant={selected === null ? "secondary" : "ghost"}
        size="sm"
        className="justify-start"
        aria-current={selected === null ? "page" : undefined}
        onClick={() => onSelect(null)}
      >
        {overviewLabel}
      </Button>
      {suites.map((suite) => (
        <Tooltip key={suite.id}>
          <TooltipTrigger asChild>
            <Button
              variant={selected === suite.id ? "secondary" : "ghost"}
              size="sm"
              className="h-auto min-h-8 max-w-full justify-start py-2"
              aria-current={selected === suite.id ? "page" : undefined}
              onClick={() => onSelect(suite.id)}
            >
              <span className="min-w-0 w-full text-left">
                <span className="block truncate">
                  {loading ? <Skeleton className="h-5 w-32" /> : suite.name}
                </span>
                {suite.description ? (
                  <span className="block text-xs text-muted-foreground">
                    {loading ? (
                      <Skeleton className="h-4 w-24" />
                    ) : (
                      suite.description
                    )}
                  </span>
                ) : null}
                {suite.statusCounts ? (
                  <EvalSuiteStatusBar counts={suite.statusCounts} />
                ) : null}
              </span>
            </Button>
          </TooltipTrigger>
          {suite.preview ? (
            <TooltipContent
              side="right"
              align="start"
              className="w-80 max-w-[calc(100vw-2rem)] p-4 text-pretty"
            >
              {suite.preview}
            </TooltipContent>
          ) : (
            <TooltipContent side="right">{suite.name}</TooltipContent>
          )}
        </Tooltip>
      ))}
    </nav>
  );
}
