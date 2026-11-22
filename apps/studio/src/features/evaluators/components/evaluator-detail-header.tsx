"use client";

import { ArrowLeft, Maximize2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
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
  onBack?: () => void;
  children?: ReactNode;
}) {
  const { navigation } = useDetailDrawer();
  const canExpand = navigation?.canExpand;
  return (
    <header
      data-responsive-surface="detail-header"
      className="@container/evaluator-header flex h-16 shrink-0 items-center gap-2 border-b px-3"
    >
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={canExpand ? "Expand detail" : "Back to judge library"}
        onClick={canExpand ? navigation.expand : (navigation?.close ?? onBack)}
      >
        {canExpand ? <Maximize2 /> : <ArrowLeft />}
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
      {navigation?.isTop && !navigation.expanded && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close detail"
          onClick={navigation.close}
        >
          <X />
        </Button>
      )}
    </header>
  );
}
