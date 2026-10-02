import { notFound } from "next/navigation";
import { readEvalTargets } from "../api/server";
import { EvalSuitePageClient } from "./eval-suite-page-client";

export async function EvalSuitePage({
  params,
  drawer = false,
}: {
  params: Promise<{ targetId: string; suiteId: string }>;
  drawer?: boolean;
}) {
  const { targetId, suiteId } = await params;
  const targets = await readEvalTargets();
  const target = targets.targets.find((t) => t.id === targetId);
  const suite = target?.manifest?.suites.find((s) => s.id === suiteId);
  if (!target || !suite) notFound();
  return (
    <EvalSuitePageClient
      targets={targets}
      target={target}
      suite={suite}
      drawer={drawer}
    />
  );
}
