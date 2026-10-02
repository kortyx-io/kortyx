"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayName } from "../lib/presentation";
import type { EvalTargets } from "../schema";
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
      <div className="flex items-center justify-between border-b p-3">
        <Button variant="ghost" size="xs" onClick={onBack}>
          <ArrowLeft />
          Suites
        </Button>
        <Button
          size="sm"
          disabled={!canRun || Boolean(target.error)}
          onClick={onRun}
        >
          <Play />
          Run suite
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <h2 className="text-lg font-semibold">
          {suite.name ?? displayName(suite.id)}
        </h2>
        <p className="text-xs text-muted-foreground">
          {target.name} · {target.environment} · {suite.cases.length}{" "}
          conversations
        </p>
        <EvalSuiteDefinition suite={suite} scope="suite-definition" />
      </div>
    </div>
  );
}
