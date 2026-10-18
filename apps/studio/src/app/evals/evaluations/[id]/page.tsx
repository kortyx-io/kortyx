import {
  readEvalTargets,
  readEvaluationDetail,
} from "@/features/evals/api/server";
import { EvaluationDetail } from "@/features/evals/components/evaluation-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, targets] = await Promise.allSettled([
    readEvaluationDetail(id),
    readEvalTargets(),
  ]);
  return (
    <EvaluationDetail
      id={id}
      initial={detail.status === "fulfilled" ? detail.value.run : null}
      canRun={targets.status === "fulfilled" && targets.value.canRun}
    />
  );
}
