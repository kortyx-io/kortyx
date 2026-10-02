"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import { Play } from "lucide-react";
import { parseAsString } from "nuqs";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
import { Button } from "@/components/ui/button";
import { useStudioQueryState } from "@/lib/nuqs";
import { cn } from "@/lib/utils";
import { displayName } from "../lib/presentation";
import type { EvalTargets } from "../schema";
import { EvalDetailHeader } from "./eval-detail-header";
import { EvalSuiteDefinition } from "./eval-suite-definition";

export function EvalSuiteDetail({
  suite,
  target,
  canRun,
  onBack,
  onRun,
}: {
  suite: EvalSuite;
  target: EvalTargets["targets"][number];
  canRun: boolean;
  onBack: () => void;
  onRun: () => void;
}) {
  const detail = useDetailDrawer();
  const [view] = useStudioQueryState("detailView", parseAsString);
  const compact = detail.presentation === "drawer" && view !== "expanded";
  const runAction = (
    <Button
      size="sm"
      disabled={!canRun || Boolean(target.error)}
      onClick={onRun}
    >
      <Play aria-hidden="true" /> Run suite
    </Button>
  );
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col transition-[padding] duration-300 motion-reduce:transition-none",
        detail.supportsSplitInspector &&
          detail.nestedOpen &&
          !detail.isMobile &&
          "lg:pr-[30rem]",
      )}
    >
      {compact ? (
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
          <code
            translate="no"
            className="min-w-0 truncate text-xs text-muted-foreground"
          >
            {suite.id}
          </code>
          {runAction}
        </div>
      ) : (
        <EvalDetailHeader
          title={suite.name ?? displayName(suite.id)}
          description={`${target.name} · ${target.environment} · ${suite.cases.length} conversations`}
          backLabel="Suites"
          onBack={onBack}
          actions={runAction}
        />
      )}
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <EvalSuiteDefinition suite={suite} scope="suite-definition" />
      </div>
    </div>
  );
}
