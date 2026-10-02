"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  return (
    <div className="flex h-full min-h-0 flex-col">
      <EvalDetailHeader
        title={suite.name ?? displayName(suite.id)}
        description={`${target.name} · ${target.environment} · ${suite.cases.length} conversations`}
        backLabel="Suites"
        onBack={onBack}
        actions={
          <Button
            size="sm"
            disabled={!canRun || Boolean(target.error)}
            onClick={onRun}
          >
            <Play />
            Run suite
          </Button>
        }
      />
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <EvalSuiteDefinition suite={suite} scope="suite-definition" />
      </div>
    </div>
  );
}
