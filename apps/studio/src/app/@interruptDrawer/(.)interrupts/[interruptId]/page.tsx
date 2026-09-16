import { notFound } from "next/navigation";
import { InterruptDetailDrawer } from "@/features/interrupts/components/interrupt-detail-drawer";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { getStudioInterruptDetail } from "@/lib/studio-api";
import { studioRouteId } from "@/lib/studio-routes";

export default async function InterruptDrawerPage({
  params,
}: {
  params: Promise<{ interruptId: string }>;
}) {
  const interruptId = studioRouteId((await params).interruptId);
  const result = await getStudioInterruptDetail(interruptId);
  if (result.error?.status === 404) notFound();
  if (result.error) {
    return (
      <StudioDataError title="Unable to load interrupt" error={result.error} />
    );
  }
  return (
    <InterruptDetailDrawer interruptId={interruptId} detail={result.data} />
  );
}
