"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { studioHelp } from "@/lib/studio-help";

export function EvaluatorDetailHeader({
  title,
  status,
  onBack,
  children,
}: {
  title: string;
  status: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <header
      data-responsive-surface="detail-header"
      className="@container/evaluator-header flex h-16 shrink-0 items-center gap-2 border-b px-3"
    >
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Back to judge library"
        onClick={onBack}
      >
        <ArrowLeft />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h1 className="truncate text-sm font-semibold" title={title}>
            {title}
          </h1>
          <HelpCircle help={studioHelp.evaluators} />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          Judge · {status}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </header>
  );
}
