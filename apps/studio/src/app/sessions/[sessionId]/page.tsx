import { notFound } from "next/navigation";
import { DetailPage } from "@/components/detail/detail-page";
import { SessionDetail } from "@/features/sessions/components/session-detail";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { getStudioSessionDetail } from "@/lib/studio-api";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const result = await getStudioSessionDetail(sessionId);
  if (result.error?.status === 404) notFound();
  if (result.error)
    return (
      <StudioDataError title="Unable to load session" error={result.error} />
    );
  return (
    <DetailPage
      title="Session details"
      description="Replay runs, state, and lifecycle events"
    >
      <SessionDetail detail={result.data} />
    </DetailPage>
  );
}
