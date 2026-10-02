"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import { useRouter, useSearchParams } from "next/navigation";
import { DetailPage } from "@/components/detail/detail-page";
import { useEvalSetup } from "../hooks/use-eval-setup";
import { evalNavigationHref } from "../lib/navigation";
import type { EvalTargets } from "../schema";
import { EvalNavigation } from "./eval-navigation";
import { EvalRunSetup } from "./eval-run-setup";
import { EvalSuiteDetail } from "./eval-suite-detail";
export function EvalSuitePageClient({
  targets,
  target,
  suite,
}: {
  targets: EvalTargets;
  target: EvalTargets["targets"][number];
  suite: EvalSuite;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const { open } = useEvalSetup(targets);
  return (
    <DetailPage title={suite.name ?? suite.id} description="Suite definition">
      <div className="flex h-full min-h-0 flex-col">
        <div className="px-4 pt-3">
          <EvalNavigation active="suites" />
        </div>
        <div className="min-h-0 flex-1">
          <EvalSuiteDetail
            suite={suite}
            target={target}
            canRun={targets.canRun}
            onBack={() =>
              router.push(evalNavigationHref("/evals/suites", search))
            }
            onRun={() => open(target.id, suite.id)}
          />
        </div>
        <EvalRunSetup targets={targets} />
      </div>
    </DetailPage>
  );
}
