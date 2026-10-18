"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { DetailPage } from "@/components/detail/detail-page";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { useEvalSetup } from "../hooks/use-eval-setup";
import { evalNavigationHref, evalSuiteHref } from "../lib/navigation";
import type { EvalTargets } from "../schema";
import { EvalRunSetup } from "./eval-run-setup";
import { EvalSuiteDetail } from "./eval-suite-detail";
export function EvalSuitePageClient({
  targets,
  target,
  suite,
  drawer = false,
}: {
  targets: EvalTargets;
  target: EvalTargets["targets"][number];
  suite: EvalSuite;
  drawer?: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const { open } = useEvalSetup(targets);
  const path = evalSuiteHref(target.id, suite.id);
  const content = (
    <div className="flex h-full min-h-0 flex-col">
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
      <EvalRunSetup targets={targets} matchPath={path} />
    </div>
  );
  return drawer ? (
    <DetailDrawer
      matchPath={path}
      dismissPath="/evals/suites"
      title={suite.name ?? suite.id}
      description={`${target.name} · ${target.environment} · ${suite.cases.length} conversations`}
    >
      {content}
    </DetailDrawer>
  ) : (
    <DetailPage title={suite.name ?? suite.id} description="Suite definition">
      {content}
    </DetailPage>
  );
}
