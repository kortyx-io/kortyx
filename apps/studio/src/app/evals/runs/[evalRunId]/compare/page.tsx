import { EvalRunPage } from "@/features/evals/components/eval-run-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ evalRunId: string }>;
  searchParams: Promise<{ baseline?: string }>;
}) {
  const [{ evalRunId }, { baseline }] = await Promise.all([
    params,
    searchParams,
  ]);
  return <EvalRunPage id={evalRunId} mode="compare" baselineId={baseline} />;
}
