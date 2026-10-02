import { EvalCasePage } from "@/features/evals/components/eval-case-page";
export default function Page({
  params,
}: {
  params: Promise<{ evalRunId: string; caseId: string; repetition: string }>;
}) {
  return <EvalCasePage params={params} drawer />;
}
