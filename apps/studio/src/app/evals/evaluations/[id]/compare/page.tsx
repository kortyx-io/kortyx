import {
  readEvaluationHistory,
  readEvaluationResults,
} from "@/features/evals/api/server";
import { EvaluationComparison } from "@/features/evals/components/evaluation-comparison";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ baseline?: string }>;
}) {
  const [{ id }, { baseline }] = await Promise.all([params, searchParams]);
  const [candidate, previous, history] = await Promise.allSettled([
    readEvaluationResults(id),
    baseline ? readEvaluationResults(baseline) : Promise.resolve(null),
    readEvaluationHistory(),
  ]);
  return (
    <EvaluationComparison
      id={id}
      initialCandidate={
        candidate.status === "fulfilled" ? candidate.value.run : null
      }
      initialBaseline={
        previous.status === "fulfilled" ? (previous.value?.run ?? null) : null
      }
      history={history.status === "fulfilled" ? history.value.runs : []}
      historyError={history.status === "rejected"}
    />
  );
}
