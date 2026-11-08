import { readEvaluationHistory } from "@/features/evals/api/server";
import { EvaluationComparison } from "@/features/evals/components/evaluation-comparison";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ baseline?: string }>;
}) {
  const { id } = await params;
  const [history] = await Promise.allSettled([readEvaluationHistory()]);
  return (
    <EvaluationComparison
      id={id}
      initialCandidate={null}
      initialBaseline={null}
      history={history.status === "fulfilled" ? history.value.runs : []}
      historyError={history.status === "rejected"}
    />
  );
}
