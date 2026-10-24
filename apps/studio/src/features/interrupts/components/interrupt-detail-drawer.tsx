"use client";

import type { StudioInterruptDetailResponse } from "@kortyx/telemetry-contracts";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { InterruptDetail } from "@/features/interrupts/components/interrupt-detail";
import { studioDetailHref } from "@/lib/studio-routes";

export function InterruptDetailDrawer({
  interruptId,
  detail,
  initialNow,
}: {
  interruptId: string;
  detail: StudioInterruptDetailResponse;
  initialNow: number;
}) {
  return (
    <DetailDrawer
      matchPath={studioDetailHref("interrupts", interruptId)}
      dismissPath="/interrupts"
      title="Interrupt details"
      description="Inspect the decision and resume audit trail"
    >
      <InterruptDetail detail={detail} initialNow={initialNow} />
    </DetailDrawer>
  );
}
