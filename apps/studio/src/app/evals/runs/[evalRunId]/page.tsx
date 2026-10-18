import { EvalRunPage } from "@/features/evals/components/eval-run-page";
export default async function Page({
  params,
}: {
  params: Promise<{ evalRunId: string }>;
}) {
  const { evalRunId } = await params;
  return <EvalRunPage id={evalRunId} mode="run" />;
}
