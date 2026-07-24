import { notFound } from "next/navigation";
import { DetailPage } from "@/components/detail/detail-page";
import { RunDetail } from "@/features/runs/components/run-detail";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { getStudioRunDetail } from "@/lib/studio-api";

export default async function RunDetailPage({
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
  return (
    <DetailPage
      title="Run details"
      description="Inspect execution, payloads, and timing"
    >
      <RunDetail detail={result.data} />
    </DetailPage>
  );
}
