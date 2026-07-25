import { notFound } from "next/navigation";
import { RunDetailDrawer } from "@/features/runs/components/run-detail-drawer";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { getStudioRunDetail } from "@/lib/studio-api";

export default async function RunDrawerPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const result = await getStudioRunDetail(runId);
  if (result.error?.status === 404) notFound();
  if (result.error) {
    return <StudioDataError title="Unable to load run" error={result.error} />;
  }
  return <RunDetailDrawer runId={runId} detail={result.data} />;
}
