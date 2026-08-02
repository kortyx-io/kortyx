import { notFound } from "next/navigation";
import { DetailPage } from "@/components/detail/detail-page";
import { InterruptDetail } from "@/features/interrupts/components/interrupt-detail";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { getStudioInterruptDetail } from "@/lib/studio-api";

export default async function InterruptDetailPage({
  params,
}: {
  params: Promise<{ interruptId: string }>;
}) {
  const { interruptId } = await params;
  const result = await getStudioInterruptDetail(interruptId);
  if (result.error?.status === 404) notFound();
  if (result.error)
    return (
      <StudioDataError title="Unable to load interrupt" error={result.error} />
    );
  return (
    <DetailPage
      title="Interrupt details"
      description="Inspect the decision and resume audit trail"
    >
      <InterruptDetail detail={result.data} />
    </DetailPage>
  );
}
