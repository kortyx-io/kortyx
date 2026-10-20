import { readEvaluationChanges } from "@/features/evals/api/changes";
import {
  readEvalCapabilities,
  readEvaluationDetail,
  readEvaluationHistory,
} from "@/features/evals/api/server";
import { EvaluationDetail } from "@/features/evals/components/evaluation-detail";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ changesSince?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [detail, targets, history] = await Promise.allSettled([
    readEvaluationDetail(id),
    readEvalCapabilities(),
    readEvaluationHistory(),
  ]);
  const comparison =
    detail.status === "fulfilled" && history.status === "fulfilled"
      ? (
          await readEvaluationChanges(
            [detail.value.run],
            history.value.runs,
            query.changesSince,
          )
        )[id]
      : undefined;
  return (
    <EvaluationDetail
      id={id}
      comparison={comparison}
      initial={detail.status === "fulfilled" ? detail.value.run : null}
      canRun={targets.status === "fulfilled" && targets.value.canRun}
    />
  );
}
