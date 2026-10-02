import { notFound } from "next/navigation";
import { readEvalTargets } from "@/features/evals/api/server";
import { EvalSuitePageClient } from "@/features/evals/components/eval-suite-page-client";
export default async function Page({
  params,
}: {
  params: Promise<{ targetId: string; suiteId: string }>;
}) {
  const { targetId, suiteId } = await params;
  const targets = await readEvalTargets();
  const target = targets.targets.find((t) => t.id === targetId);
  const suite = target?.manifest?.suites.find((s) => s.id === suiteId);
  if (!target || !suite) notFound();
  return (
    <EvalSuitePageClient targets={targets} target={target} suite={suite} />
  );
}
