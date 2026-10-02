import { redirect } from "next/navigation";
import { EvalRunPage } from "@/features/evals/components/eval-run-page";
import { comparisonSelectionHref } from "@/features/evals/lib/navigation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ evalRunId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ evalRunId }, query] = await Promise.all([params, searchParams]);
  const selected = comparisonSelectionHref(evalRunId, query);
  if (selected) redirect(selected);
  const baseline =
    typeof query.baseline === "string" ? query.baseline : undefined;
  return <EvalRunPage id={evalRunId} mode="compare" baselineId={baseline} />;
}
