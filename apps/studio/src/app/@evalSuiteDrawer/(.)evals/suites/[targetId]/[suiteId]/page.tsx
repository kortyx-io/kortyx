import { EvalSuitePage } from "@/features/evals/components/eval-suite-page";
export default function Page({
  params,
}: {
  params: Promise<{ targetId: string; suiteId: string }>;
}) {
  return <EvalSuitePage params={params} drawer />;
}
