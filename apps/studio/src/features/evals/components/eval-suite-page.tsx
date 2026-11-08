import { notFound } from "next/navigation";
import { readEvalTargets } from "../api/server";
import { parseDatasetId } from "../lib/navigation";
import { EvalSuitePageClient } from "./eval-suite-page-client";

export async function EvalSuitePage({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  const identity = parseDatasetId(datasetId);
  if (!identity) notFound();
  const [targetId, suiteId] = identity;
  const targets = await readEvalTargets();
  const target = targets.targets.find((t) => t.id === targetId);
  const suite = target?.manifest?.suites.find((s) => s.id === suiteId);
  if (!target || !suite) notFound();
  return (
    <EvalSuitePageClient targets={targets} target={target} suite={suite} />
  );
}
