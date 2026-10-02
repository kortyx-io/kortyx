"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayName } from "../lib/presentation";
import type { EvalTargets } from "../schema";
import { EvalPayloadViewer } from "./eval-payload-viewer";

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
        {suite.cases.map((c) => (
          <section key={c.id} className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">
              {c.name ?? displayName(c.id)}
            </h3>
            {c.steps.map((step, index) => (
              <div key={`${c.id}:${index}`} className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Step {index + 1} ·{" "}
                  {"message" in step ? "User message" : "Test responder"}
                </p>
                {"message" in step ? (
                  <p className="break-words text-sm">{step.message}</p>
                ) : (
                  <EvalPayloadViewer
                    scope={`suite-${c.id}-${index}`}
                    value={step.resume}
                  />
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Expected {step.expect.type}
                  {step.expect.schemaId ? ` · ${step.expect.schemaId}` : ""}
                </p>
                {step.expect.criteria?.map((criterion, i) => (
                  <p
                    key={`${i}:${typeof criterion === "string" ? criterion : criterion.id}`}
                    className="mt-2 text-xs"
                  >
                    {typeof criterion === "string" ? criterion : criterion.text}
                  </p>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
