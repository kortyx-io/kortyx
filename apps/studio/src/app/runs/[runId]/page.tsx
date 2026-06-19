import { notFound } from "next/navigation";
import { RunDetail } from "@/features/runs/components/run-detail";
import { getMockRun } from "@/features/runs/data/mock-runs";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await getMockRun(runId);

  if (!run) notFound();

  return <RunDetail run={run} />;
}
