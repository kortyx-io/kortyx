import { EvalSuitePage } from "@/features/evals/components/eval-suite-page";
export default function Page({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  return <EvalSuitePage params={params} />;
}
