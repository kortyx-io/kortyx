import { notFound } from "next/navigation";
import { SessionDetailDrawer } from "@/features/sessions/components/session-detail-drawer";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { getStudioSessionDetail } from "@/lib/studio-api";

export default async function SessionDrawerPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const result = await getStudioSessionDetail(sessionId);
  if (result.error?.status === 404) notFound();
  if (result.error) {
    return (
      <StudioDataError title="Unable to load session" error={result.error} />
    );
  }
  return <SessionDetailDrawer sessionId={sessionId} detail={result.data} />;
}
