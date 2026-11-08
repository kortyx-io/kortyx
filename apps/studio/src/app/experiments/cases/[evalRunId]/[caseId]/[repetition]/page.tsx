import { EvalCasePage } from "@/features/evals/components/eval-case-page";
export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ evalRunId: string; caseId: string; repetition: string }>;
  searchParams: Promise<{
    evaluationComparison?: string;
    comparisonBaseline?: string;
    suiteId?: string;
    suiteRun?: string;
    repetition?: string;
  }>;
}) {
  return <EvalCasePage params={params} searchParams={searchParams} />;
}
