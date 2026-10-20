"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import { DetailSurfaceProvider } from "@/components/detail/detail-drawer";
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
}: {
  targets: EvalTargets;
  target: EvalTargets["targets"][number];
  suite: EvalSuite;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const { open } = useEvalSetup(targets);
  const path = evalSuiteHref(target.id, suite.id);
  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <h1 className="sr-only">{suite.name ?? suite.id}</h1>
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
  return <DetailSurfaceProvider>{content}</DetailSurfaceProvider>;
}
